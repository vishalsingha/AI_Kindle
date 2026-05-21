import { pdfjs } from 'react-pdf'
// Import the worker as a URL asset — Vite bundles it and Vite resolves it
// against the same pdfjs-dist that react-pdf uses, so the versions match.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// NOTE: do NOT gate this behind a `configured` flag.
//
// react-pdf code-splits `Document`/`Page`/TextLayer into a separate
// lazy-loaded chunk. That chunk re-initializes react-pdf with:
//     GlobalWorkerOptions.workerSrc = "pdf.worker.mjs"
// *after* our initial configuration, clobbering our hashed URL with a
// bare specifier that the browser/Electron ESM loader can't resolve.
// If we skip on subsequent calls, our correct URL never wins and the
// user gets: Setting up fake worker failed: "Failed to resolve module
// specifier 'pdf.worker.mjs'". Assigning unconditionally is cheap and
// guarantees the hashed asset URL is in place by the time Document
// tries to spin up the worker.
export function configurePdfWorker(): void {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
}

export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data && typeof data === 'object' && 'length' in data) {
    return new Uint8Array(Object.values(data as Record<string, number>))
  }
  throw new Error('Cannot convert data to Uint8Array')
}
