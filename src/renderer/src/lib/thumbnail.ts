import { pdfjs } from 'react-pdf'
import { configurePdfWorker } from './pdf-setup'

configurePdfWorker()

// Render the first page at a generous size, then crop to a zoomed-in
// view of the top of the page. Academic PDFs (and most books' title
// pages) place the meaningful cover content in the upper portion — the
// bottom-third is usually margin or page number. Showing a tight crop
// of the top looks more like a book cover and less like a photocopy.
const SOURCE_WIDTH = 640 // full render width; higher = sharper crop
const TOP_FRACTION = 0.75 // keep the top 75% of the page's height
const TARGET_ASPECT = 3 / 4 // width:height ratio of the BookCard thumbnail
const JPEG_QUALITY = 0.82

// Queue to avoid hammering pdf.js with 100 concurrent thumbnail renders on
// first library visit. A small concurrency is faster than sequential (CPU
// parallelism) but a lot friendlier than unbounded.
const CONCURRENCY = 3
let running = 0
const queue: Array<() => void> = []

function acquire(): Promise<void> {
  if (running < CONCURRENCY) {
    running++
    return Promise.resolve()
  }
  return new Promise(resolve => {
    queue.push(() => {
      running++
      resolve()
    })
  })
}

function release(): void {
  running--
  const next = queue.shift()
  if (next) next()
}

/**
 * Render page 1 of a PDF to a JPEG blob without mounting any React components.
 * Far cheaper than react-pdf's <Document>/<Page> tree when all we want is an
 * image we'll then discard the React state for.
 */
export async function renderThumbnail(pdfUrl: string): Promise<Uint8Array | null> {
  await acquire()
  let loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null
  try {
    loadingTask = pdfjs.getDocument(pdfUrl)
    const pdf = await loadingTask.promise
    const page = await pdf.getPage(1)

    const viewport = page.getViewport({ scale: 1 })
    const scale = SOURCE_WIDTH / viewport.width
    const scaled = page.getViewport({ scale })

    const source = document.createElement('canvas')
    source.width = Math.floor(scaled.width)
    source.height = Math.floor(scaled.height)
    const srcCtx = source.getContext('2d', { alpha: false })
    if (!srcCtx) return null

    await page.render({ canvasContext: srcCtx, viewport: scaled, canvas: source }).promise

    // Crop a zoomed "book cover" view: keep the top `TOP_FRACTION` of the
    // page's height, then centre-crop horizontally so the final image
    // matches the card's 3:4 aspect exactly. Everything below the crop
    // (page numbers, footers) and the outer margins are discarded.
    const croppedH = Math.floor(source.height * TOP_FRACTION)
    // Desired output width to hit TARGET_ASPECT, but never wider than
    // the source (very-portrait pages would otherwise produce padding).
    const desiredW = Math.floor(croppedH * TARGET_ASPECT)
    const outW = Math.min(desiredW, source.width)
    const outH = outW === desiredW ? croppedH : Math.floor(outW / TARGET_ASPECT)
    const srcX = Math.max(0, Math.floor((source.width - outW) / 2))

    const out = document.createElement('canvas')
    out.width = outW
    out.height = outH
    const outCtx = out.getContext('2d', { alpha: false })
    if (!outCtx) return null
    outCtx.drawImage(source, srcX, 0, outW, outH, 0, 0, outW, outH)

    const blob: Blob | null = await new Promise(resolve => {
      out.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY)
    })
    if (!blob) return null

    const buffer = await blob.arrayBuffer()

    // Release pdf.js resources immediately — we don't need this document again.
    try { page.cleanup() } catch { /* ignore */ }
    try { await pdf.destroy() } catch { /* ignore */ }

    return new Uint8Array(buffer)
  } catch (err) {
    console.warn('[thumbnail] render failed:', err)
    try { await loadingTask?.destroy() } catch { /* ignore */ }
    return null
  } finally {
    release()
  }
}
