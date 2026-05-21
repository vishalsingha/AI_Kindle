import { useCallback, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useReaderStore } from '@/stores/reader-store'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useLibraryStore } from '@/stores/library-store'
import { HighlightLayer } from '@/components/annotations/HighlightLayer'
import { SelectionToolbar } from '@/components/annotations/SelectionToolbar'
import { configurePdfWorker } from '@/lib/pdf-setup'
import { mergeLineRects } from '@/lib/rects'

// Set once at module load…
configurePdfWorker()
// …and once again at first render tick, because react-pdf lazily loads a
// TextLayer chunk whose init code overwrites GlobalWorkerOptions.workerSrc
// with a bare specifier. Re-asserting our hashed URL on mount guarantees
// the worker resolves correctly by the time Document tries to use it.

const PDF_RENDER_IDLE_MS = 1500
const REFRESH_ZOOM_RATIO = 1.8
// How many pages above/below the viewport to keep rendered. Higher = smoother
// scroll, lower = less memory. 2 is a good balance.
const VIRTUALIZE_BUFFER_PAGES = 2
// Default US Letter size in PDF points; used as placeholder until real dims arrive.
const DEFAULT_PAGE_W = 612
const DEFAULT_PAGE_H = 792
// Must mirror the Document className below: `py-6` + `gap-4`.
const DOCUMENT_PADDING_TOP = 24
const PAGE_GAP = 16
// (A) Jumps farther than this (in pages) skip the smooth-scroll animation.
// Smooth-scrolling 200+ pages takes many seconds; instant scroll is snappier.
const INSTANT_JUMP_PAGES = 5

interface PageDimension { width: number; height: number }

export function PDFViewer() {
  const {
    pdfUrl, currentPage, zoom, scrollMode, totalPages,
    setTotalPages, setPage, setZoom, currentBook, setSelection, clearSelection,
    selectedText, selectionRects
  } = useReaderStore()
  const { updateBook } = useLibraryStore()
  const { getPageAnnotations } = useAnnotationStore()

  // Per-page natural dimensions (in PDF points). Populated once on document load.
  const [pageDims, setPageDims] = useState<PageDimension[]>([])
  // Which pages are currently rendered (the rest are just placeholder divs).
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]))
  const observerRef = useRef<IntersectionObserver | null>(null)

  // (C) Precomputed page-top offsets in CSS pixels relative to the content
  // wrapper. Indexed by pageNumber - 1. Built once per (pageDims, zoom) change
  // so every jump-to-page is an O(1) lookup instead of a getBoundingClientRect
  // layout thrash across every virtualized placeholder.
  const pageOffsetsRef = useRef<number[]>([])

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const contentWrapperRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)
  const isProgrammaticScroll = useRef(false)
  const scrollRafId = useRef<number | null>(null)
  // True when currentPage changed because of the user's own scroll — in that
  // case we must NOT scroll back to that page (it creates a snap loop).
  const skipNextScrollToPage = useRef(false)

  // pdfRenderZoom is what pdf.js renders at (changes rarely).
  // effectiveZoom is what the user sees (changes continuously during pinch).
  // visibleTransform = effectiveZoom / pdfRenderZoom — applied as CSS transform.
  const pdfRenderZoomRef = useRef(zoom)
  const effectiveZoomRef = useRef(zoom)
  const zoomCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomAnchorRef = useRef<{ cursorX: number; cursorY: number; contentX: number; contentY: number } | null>(null)
  const pendingCommitRef = useRef<{ ratio: number; anchor: { cursorX: number; cursorY: number; contentX: number; contentY: number } } | null>(null)

  // Re-assert the worker URL after any lazy react-pdf chunk has had a
  // chance to clobber it during its own init. Runs exactly once per
  // viewer mount, before the first Document render commits.
  useEffect(() => {
    configurePdfWorker()
  }, [])

  // Keep refs in sync when zoom changes externally (e.g. from zoom buttons).
  useEffect(() => {
    pdfRenderZoomRef.current = zoom
    effectiveZoomRef.current = zoom
    const content = contentWrapperRef.current
    if (content) {
      content.style.transform = ''
      content.style.transformOrigin = ''
      content.style.willChange = ''
    }
  }, [zoom])

  // Reset virtualization state when loading a DIFFERENT document. This
  // intentionally does NOT depend on `currentPage` — page changes during
  // normal reading (scrolling, TOC jumps, zoom commits that nudge
  // currentPage via the scroll-position tracker) must never wipe pageDims,
  // or the offsets table rebuilds with fallback 612×792 dims and the
  // entire content reflows (which looks like the viewport jumping back
  // to the page top mid-zoom).
  //
  // We seed visiblePages once per book using the value of currentPage at
  // the time the URL changes (i.e. the resume-to page the user landed on),
  // so the target page pre-renders before the scroll-to-page effect fires.
  // `currentPage` is read via a ref to keep it out of this effect's deps.
  const initialPageRef = useRef(currentPage)
  useEffect(() => { initialPageRef.current = currentPage }, [currentPage])

  useEffect(() => {
    setPageDims([])
    const start = initialPageRef.current
    const seed = new Set<number>()
    for (let p = start - VIRTUALIZE_BUFFER_PAGES; p <= start + VIRTUALIZE_BUFFER_PAGES; p++) {
      if (p >= 1) seed.add(p)
    }
    setVisiblePages(seed)
    // Next render will observe the new page divs via registerPageRef and
    // IntersectionObserver will accurately refine visibility from there.
  }, [pdfUrl])

  // Set up the IntersectionObserver that decides which pages to actually render.
  // Pages outside the viewport are kept as fixed-size placeholder divs so the
  // total scroll height stays stable — only a handful of <Page> components
  // exist at any time, regardless of PDF length.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || !totalPages) return

    const pending = new Map<number, boolean>()
    let rafId: number | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number((entry.target as HTMLElement).dataset.page)
          if (!pageNum) continue
          pending.set(pageNum, entry.isIntersecting)
        }
        if (rafId === null) {
          rafId = requestAnimationFrame(() => {
            rafId = null
            if (pending.size === 0) return
            setVisiblePages(prev => {
              const next = new Set(prev)
              let changed = false
              for (const [page, visible] of pending) {
                if (visible && !next.has(page)) { next.add(page); changed = true }
                else if (!visible && next.has(page)) { next.delete(page); changed = true }
              }
              return changed ? next : prev
            })
            pending.clear()
          })
        }
      },
      {
        root: container,
        rootMargin: `${VIRTUALIZE_BUFFER_PAGES * 100}% 0px ${VIRTUALIZE_BUFFER_PAGES * 100}% 0px`
      }
    )
    observerRef.current = observer

    for (const el of pageRefs.current.values()) {
      observer.observe(el)
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      observer.disconnect()
      observerRef.current = null
    }
  }, [totalPages, pdfUrl])

  const onDocumentLoadSuccess = useCallback(async (pdf: { numPages: number; getPage: (n: number) => Promise<any> }): Promise<void> => {
    const { numPages } = pdf
    setTotalPages(numPages)
    if (currentBook) {
      updateBook(currentBook.id, { pageCount: numPages })
      window.api.updateBook(currentBook.id, { pageCount: numPages })
    }

    // Fetch each page's natural size in parallel — metadata only, very fast.
    const dims: PageDimension[] = Array.from({ length: numPages }, () => ({
      width: DEFAULT_PAGE_W,
      height: DEFAULT_PAGE_H
    }))
    try {
      const pages = await Promise.all(
        Array.from({ length: numPages }, (_, i) => pdf.getPage(i + 1))
      )
      pages.forEach((page, i) => {
        const viewport = page.getViewport({ scale: 1 })
        dims[i] = { width: viewport.width, height: viewport.height }
      })
    } catch {
      // Fallback to defaults on error
    }
    setPageDims(dims)
  }, [setTotalPages, currentBook, updateBook])

  // (C) Recompute the precomputed page-top offset table whenever dimensions
  // or zoom change. O(N) once instead of O(N) DOM reads on every jump.
  useLayoutEffect(() => {
    if (pageDims.length === 0) { pageOffsetsRef.current = []; return }
    const offsets = new Array<number>(pageDims.length)
    let y = DOCUMENT_PADDING_TOP
    for (let i = 0; i < pageDims.length; i++) {
      offsets[i] = y
      const h = (pageDims[i]?.height ?? DEFAULT_PAGE_H) * zoom
      y += h + PAGE_GAP
    }
    pageOffsetsRef.current = offsets
  }, [pageDims, zoom])

  // Scroll to currentPage when it changes externally (book open, TOC click,
  // PageUp/Down). If the change came from the user's own scroll, skip — we
  // don't want to re-align the page they are actively reading.
  //
  // IMPORTANT: `zoom` is intentionally NOT in this effect's dep array.
  // When the user pinch-zooms (especially off-center), the zoom commit's
  // own useLayoutEffect rescales scrollTop around the cursor anchor so
  // the point they were zooming into stays fixed. Re-running this effect
  // on zoom changes would see the new scrollTop differ from currentPage's
  // top (because the anchor isn't necessarily the page start) and force
  // a scroll there, discarding the anchor. We read `zoom` via a ref so
  // currentPage-triggered runs still get the up-to-date value for the
  // distance-in-pages calculation.
  const zoomRef2 = useRef(zoom)
  useEffect(() => { zoomRef2.current = zoom }, [zoom])

  useEffect(() => {
    if (!scrollMode) return
    if (skipNextScrollToPage.current) {
      skipNextScrollToPage.current = false
      return
    }
    if (!totalPages) return

    const container = scrollContainerRef.current
    if (!container) return

    // (C) Compute target scrollTop from the offset table — no layout reads.
    const offsets = pageOffsetsRef.current
    const offset = offsets[currentPage - 1]
    const targetTop =
      typeof offset === 'number'
        ? Math.max(0, offset - 16)
        : (() => {
            // Fallback to DOM read if offsets aren't ready yet (e.g. document
            // hasn't finished loading page dimensions).
            const pageEl = pageRefs.current.get(currentPage)
            if (!pageEl) return null
            const pageRect = pageEl.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()
            return Math.max(0, pageRect.top - containerRect.top + container.scrollTop - 16)
          })()
    if (targetTop == null) return

    const distance = Math.abs(targetTop - container.scrollTop)
    if (distance < 80) return

    // (B) Pre-mark a ring of pages around the target as visible BEFORE we
    // scroll, so pdf.js starts rasterizing them in the background. By the
    // time the scroll animation finishes (or instantly arrives), the target
    // page is already rendering instead of starting from a blank placeholder.
    setVisiblePages(prev => {
      const next = new Set(prev)
      let changed = false
      for (let p = currentPage - VIRTUALIZE_BUFFER_PAGES; p <= currentPage + VIRTUALIZE_BUFFER_PAGES; p++) {
        if (p >= 1 && p <= totalPages && !next.has(p)) {
          next.add(p)
          changed = true
        }
      }
      return changed ? next : prev
    })

    // (A) Smooth-scroll small jumps (feels polished) but instantly jump large
    // distances — smooth-scrolling 200 pages takes 10+ seconds and is useless.
    const distanceInPages = distance / (DEFAULT_PAGE_H * zoomRef2.current)
    const behavior: ScrollBehavior = distanceInPages > INSTANT_JUMP_PAGES ? 'auto' : 'smooth'

    isProgrammaticScroll.current = true
    container.scrollTo({ top: targetTop, behavior })
    // Instant jumps settle within a frame; smooth scrolls take longer.
    const settleMs = behavior === 'auto' ? 50 : 600
    setTimeout(() => { isProgrammaticScroll.current = false }, settleMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see note above
  }, [currentPage, scrollMode, totalPages])

  const onScroll = useCallback(() => {
    if (!scrollMode || isProgrammaticScroll.current) return
    if (scrollRafId.current !== null) return
    scrollRafId.current = requestAnimationFrame(() => {
      scrollRafId.current = null
      const container = scrollContainerRef.current
      if (!container) return

      // Binary-search the precomputed offset table to find the page whose
      // top is just above the viewport top. O(log N), no DOM reads.
      const offsets = pageOffsetsRef.current
      const target = container.scrollTop + 60 // 60px "reading line" offset
      let found = 1
      if (offsets.length > 0) {
        let lo = 0, hi = offsets.length - 1
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (offsets[mid] <= target) { found = mid + 1; lo = mid + 1 }
          else hi = mid - 1
        }
      } else {
        // Offsets not ready yet — fall back to one scan over registered pages.
        const containerTop = container.getBoundingClientRect().top
        let closestDist = Infinity
        for (const [pageNum, el] of pageRefs.current.entries()) {
          const rect = el.getBoundingClientRect()
          const dist = Math.abs(rect.top - containerTop - 60)
          if (rect.bottom > containerTop && dist < closestDist) {
            closestDist = dist
            found = pageNum
          }
        }
      }

      if (found !== currentPage) {
        skipNextScrollToPage.current = true
        setPage(found)
      }
    })
  }, [scrollMode, currentPage, setPage])

  const handleTextSelection = useCallback((e?: MouseEvent) => {
    // Clicks *inside* the selection toolbar (e.g. pressing "Add comment",
    // focusing the comment textarea, or clicking Save) collapse the window
    // selection as a side effect. Without this guard that would trigger a
    // clearSelection() here, which in turn unmounts the toolbar before the
    // button's onClick can run — breaking the comment flow entirely.
    const target = e?.target as Element | null
    if (target && typeof target.closest === 'function' && target.closest('[data-selection-toolbar]')) {
      return
    }

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      clearSelection()
      setToolbarPos(null)
      return
    }

    const text = selection.toString().trim()
    if (!text) return

    const range = selection.getRangeAt(0)
    const rangeRect = range.getBoundingClientRect()

    let selPage = currentPage
    let pageEl: HTMLDivElement | null = null

    for (const [pageNum, el] of pageRefs.current.entries()) {
      const elRect = el.getBoundingClientRect()
      if (rangeRect.top >= elRect.top && rangeRect.top <= elRect.bottom) {
        selPage = pageNum
        pageEl = el
        break
      }
    }

    if (!pageEl) return

    const pageRect = pageEl.getBoundingClientRect()
    const rawRects = Array.from(range.getClientRects())
      .filter(cr => cr.width > 0 && cr.height > 0)
      .map(cr => ({
        x: (cr.left - pageRect.left) / pageRect.width,
        y: (cr.top - pageRect.top) / pageRect.height,
        width: cr.width / pageRect.width,
        height: cr.height / pageRect.height
      }))
    const rects = mergeLineRects(rawRects)

    setSelection(text, rects, selPage)

    const container = scrollContainerRef.current
    if (container) {
      const containerRect = container.getBoundingClientRect()
      setToolbarPos({
        x: rangeRect.left + rangeRect.width / 2 - containerRect.left + container.scrollLeft,
        y: rangeRect.top - containerRect.top - 10 + container.scrollTop
      })
    }
  }, [currentPage, setSelection, clearSelection])

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection)
    return () => document.removeEventListener('mouseup', handleTextSelection)
  }, [handleTextSelection])

  useEffect(() => {
    return () => {
      if (scrollRafId.current !== null) cancelAnimationFrame(scrollRafId.current)
      if (zoomCommitTimer.current) clearTimeout(zoomCommitTimer.current)
    }
  }, [])

  const registerPageRef = useCallback((pageNum: number, el: HTMLDivElement | null) => {
    const prev = pageRefs.current.get(pageNum)
    if (prev && prev !== el && observerRef.current) {
      observerRef.current.unobserve(prev)
    }
    if (el) {
      pageRefs.current.set(pageNum, el)
      if (observerRef.current) observerRef.current.observe(el)
    } else {
      pageRefs.current.delete(pageNum)
    }
  }, [])

  // Atomic zoom commit: runs synchronously after React applies the new zoom
  // state but BEFORE paint. Resets the CSS transform and adjusts scroll so
  // the anchor point stays under the cursor — all in the same paint frame.
  useLayoutEffect(() => {
    const pending = pendingCommitRef.current
    const container = scrollContainerRef.current
    const content = contentWrapperRef.current
    if (!pending || !container || !content) return

    const { ratio, anchor } = pending
    pendingCommitRef.current = null

    content.style.transform = ''
    content.style.transformOrigin = ''
    content.style.willChange = ''
    container.scrollLeft = anchor.contentX * ratio - anchor.cursorX
    container.scrollTop = anchor.contentY * ratio - anchor.cursorY
  }, [zoom])

  // Trackpad pinch-to-zoom. CSS transform during gesture = instant visual zoom.
  // pdf.js is re-rendered only when user has been idle, or when the CSS
  // transform has deviated far enough that text would look blurry.
  useEffect(() => {
    const container = scrollContainerRef.current
    const content = contentWrapperRef.current
    if (!container || !content) return

    const applyCSSTransform = (): void => {
      const ratio = effectiveZoomRef.current / pdfRenderZoomRef.current
      const anchor = zoomAnchorRef.current
      if (Math.abs(ratio - 1) < 0.001) {
        content.style.transform = ''
        content.style.transformOrigin = ''
        // Drop the compositor layer hint once no gesture is in progress —
        // keeping `will-change: transform` at rest forces Chromium to
        // rasterize the pages into a GPU layer at CSS pixel resolution,
        // which looks slightly blurry on Retina displays.
        content.style.willChange = ''
        return
      }
      const originX = anchor ? anchor.contentX : container.scrollLeft + container.clientWidth / 2
      const originY = anchor ? anchor.contentY : container.scrollTop + container.clientHeight / 2
      content.style.transformOrigin = `${originX}px ${originY}px`
      content.style.transform = `scale(${ratio})`
      // Only promote to a compositor layer while a gesture is actually
      // transforming the content — that's when will-change helps.
      content.style.willChange = 'transform'
    }

    const commitZoom = (): void => {
      const effective = effectiveZoomRef.current
      const rendered = pdfRenderZoomRef.current
      if (Math.abs(effective - rendered) < 0.001) return

      const ratio = effective / rendered
      const anchor = zoomAnchorRef.current

      if (!anchor) {
        setZoom(effective)
        return
      }

      pendingCommitRef.current = { ratio, anchor }
      zoomAnchorRef.current = null
      setZoom(effective)
    }

    const handleWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()

      // Capture anchor once per gesture
      if (zoomAnchorRef.current === null) {
        const rect = container.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top
        zoomAnchorRef.current = {
          cursorX,
          cursorY,
          contentX: cursorX + container.scrollLeft,
          contentY: cursorY + container.scrollTop
        }
      }

      const delta = Math.exp(-e.deltaY * 0.01)
      const newEffective = Math.max(0.5, Math.min(4, effectiveZoomRef.current * delta))
      effectiveZoomRef.current = newEffective

      applyCSSTransform()

      // If CSS transform has drifted too far from 1, commit immediately so
      // text doesn't look blurry for too long.
      const drift = newEffective / pdfRenderZoomRef.current
      if (drift > REFRESH_ZOOM_RATIO || drift < 1 / REFRESH_ZOOM_RATIO) {
        if (zoomCommitTimer.current) clearTimeout(zoomCommitTimer.current)
        commitZoom()
        return
      }

      // Otherwise debounce the commit until user is idle
      if (zoomCommitTimer.current) clearTimeout(zoomCommitTimer.current)
      zoomCommitTimer.current = setTimeout(commitZoom, PDF_RENDER_IDLE_MS)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [setZoom])

  if (!pdfUrl) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      className="flex-1 min-h-0 overflow-auto relative"
    >
      {/*
        Intentionally no `will-change: transform` here at rest. It is added
        dynamically by the wheel/pinch handler while a zoom gesture is
        in progress and removed when the gesture ends, so steady-state
        rendering stays at native device-pixel sharpness.
      */}
      <div ref={contentWrapperRef}>
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={(error) => console.error('[PDFViewer] PDF load error:', error)}
          loading={
            <div className="flex items-center justify-center p-20">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center p-20 text-destructive">
              <p className="font-medium">Failed to load PDF</p>
            </div>
          }
          className="flex flex-col items-center gap-4 py-6"
        >
          {totalPages > 0 &&
            (scrollMode
              ? Array.from({ length: totalPages }, (_, i) => i + 1)
              : [currentPage]
            ).map(pageNum => {
              const dims = pageDims[pageNum - 1] ?? { width: DEFAULT_PAGE_W, height: DEFAULT_PAGE_H }
              const pxW = dims.width * zoom
              const pxH = dims.height * zoom
              const isVisible = visiblePages.has(pageNum) || !scrollMode

              return (
                <div
                  key={pageNum}
                  ref={(el) => registerPageRef(pageNum, el)}
                  data-page={pageNum}
                  className="relative shadow-lg bg-white"
                  style={{ display: 'block', width: pxW, height: pxH }}
                >
                  {isVisible ? (
                    <>
                      <Page
                        pageNumber={pageNum}
                        scale={zoom}
                        // Explicitly render the backing canvas at the display's
                        // native pixel density so text stays crisp on Retina
                        // without relying on react-pdf's implicit default.
                        devicePixelRatio={window.devicePixelRatio || 1}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        loading={
                          <div
                            className="flex items-center justify-center bg-white"
                            style={{ width: pxW, height: pxH }}
                          >
                            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          </div>
                        }
                      />
                      <HighlightLayer
                        annotations={getPageAnnotations(pageNum)}
                        pageNumber={pageNum}
                      />
                    </>
                  ) : (
                    // Cheap placeholder — keeps scroll height stable without
                    // holding a canvas or text layer in memory.
                    <div
                      className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 text-xs select-none"
                      aria-hidden
                    >
                      {pageNum}
                    </div>
                  )}
                  {scrollMode && (
                    <div className="absolute bottom-1 right-2 text-[10px] text-muted-foreground/50 pointer-events-none select-none">
                      {pageNum} / {totalPages}
                    </div>
                  )}
                </div>
              )
            })}
        </Document>
      </div>

      {selectedText && selectionRects.length > 0 && toolbarPos && (
        <SelectionToolbar position={toolbarPos} />
      )}
    </div>
  )
}
