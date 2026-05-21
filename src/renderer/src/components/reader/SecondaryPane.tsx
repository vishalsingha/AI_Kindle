import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X } from 'lucide-react'
import type { Book } from '@/stores/library-store'
import { useTabsStore } from '@/stores/tabs-store'
import { configurePdfWorker } from '@/lib/pdf-setup'
import { cn } from '@/lib/utils'

configurePdfWorker()

// Lightweight reference-reader for the right pane of split view. Keeps its
// own state so the primary PDFViewer (with annotations, AI, selection) stays
// untouched. No annotation tooling here on purpose — this pane is for
// *looking things up alongside* the book you're actually working in.
export function SecondaryPane({ book }: { book: Book }) {
  const { closeSplit, updateTabPosition, tabs } = useTabsStore()

  const tabEntry = tabs.find((t) => t.book.id === book.id)
  const [page, setPage] = useState<number>(tabEntry?.position.page ?? 1)
  const [zoom, setZoom] = useState<number>(tabEntry?.position.zoom ?? 1)
  const [totalPages, setTotalPages] = useState<number>(0)

  const pdfUrl = window.api.getPDFUrl(book.filepath)
  const containerRef = useRef<HTMLDivElement>(null)

  // Re-assert the worker URL in case a lazy react-pdf chunk overwrote it
  // after our initial top-level configuration. See pdf-setup.ts.
  useEffect(() => {
    configurePdfWorker()
  }, [])

  const onDocumentLoadSuccess = useCallback((pdf: { numPages: number }) => {
    setTotalPages(pdf.numPages)
  }, [])

  // Persist position back into the tabs store so closing/swapping panes
  // remembers where the user was.
  useEffect(() => {
    updateTabPosition(book.id, { page, zoom })
  }, [book.id, page, zoom, updateTabPosition])

  const goPrev = (): void => setPage((p) => Math.max(1, p - 1))
  const goNext = (): void => setPage((p) => Math.min(totalPages || p, p + 1))
  const zoomIn = (): void => setZoom((z) => Math.min(3, z + 0.2))
  const zoomOut = (): void => setZoom((z) => Math.max(0.5, z - 0.2))

  return (
    <div className="flex-1 min-w-0 flex flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between px-3 h-9 border-b border-border bg-sidebar/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate max-w-[200px]" title={book.title}>
            {book.title}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {page} / {totalPages || '…'}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <IconBtn onClick={goPrev} disabled={page <= 1} title="Previous page">
            <ChevronLeft className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn onClick={goNext} disabled={totalPages > 0 && page >= totalPages} title="Next page">
            <ChevronRight className="w-3.5 h-3.5" />
          </IconBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <IconBtn onClick={zoomOut} title="Zoom out">
            <ZoomOut className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn onClick={zoomIn} title="Zoom in">
            <ZoomIn className="w-3.5 h-3.5" />
          </IconBtn>
          <div className="w-px h-4 bg-border mx-1" />
          <IconBtn onClick={closeSplit} title="Close split">
            <X className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center p-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          }
          error={
            <div className="flex items-center justify-center p-12 text-destructive text-sm">
              Failed to load PDF
            </div>
          }
          className="flex flex-col items-center py-4"
        >
          {totalPages > 0 && (
            <Page
              pageNumber={Math.min(page, totalPages)}
              scale={zoom}
              devicePixelRatio={window.devicePixelRatio || 1}
              renderTextLayer
              renderAnnotationLayer
              loading={
                <div className="flex items-center justify-center p-8">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              }
            />
          )}
        </Document>
      </div>
    </div>
  )
}

function IconBtn({
  children, onClick, disabled, title
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'p-1.5 rounded-md transition-colors',
        disabled
          ? 'text-muted-foreground/30 cursor-not-allowed'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      )}
    >
      {children}
    </button>
  )
}
