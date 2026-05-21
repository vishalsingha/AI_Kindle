import { useState, useCallback, type ReactNode, type DragEvent } from 'react'
import { Upload, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  onDropPaths: (paths: string[]) => void
}

/**
 * Library-wide drag-and-drop target for importing PDFs.
 *
 * Accepts BOTH individual files and entire folders dropped at once.
 * Folders are walked recursively in the main process via
 * `window.api.resolveDroppedPaths`, so users can drag a parent
 * directory and pick up every PDF nested inside (skipping hidden
 * directories like `.git` / `node_modules`).
 *
 * The hover overlay only appears for drags that contain files —
 * `dataTransfer.types` includes `'Files'` for OS-originated drags but
 * not for in-page selections, so dragging text inside the app doesn't
 * accidentally trigger the dropzone.
 */
export function ImportDropzone({ children, onDropPaths }: Props) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResolving, setIsResolving] = useState(false)

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    // In Electron, dropped files (and folders) surface their absolute
    // path on the File object. Empty paths can show up if the drag came
    // from the renderer itself (e.g. a screenshot drag) — skip those.
    const droppedPaths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0)

    if (droppedPaths.length === 0) return

    setIsResolving(true)
    try {
      // Ask the main process to walk any directories and pull out every
      // PDF underneath. This also de-duplicates across the input list.
      const pdfPaths = await window.api.resolveDroppedPaths(droppedPaths)
      if (pdfPaths.length > 0) onDropPaths(pdfPaths)
    } catch (err) {
      console.error('[import-dropzone] failed to resolve drop:', err)
      // Fall back to client-side filtering (file drops only — we can't
      // walk a folder from the renderer) so the user still gets *some*
      // import out of the gesture.
      const pdfFallback = droppedPaths.filter((p) => p.toLowerCase().endsWith('.pdf'))
      if (pdfFallback.length > 0) onDropPaths(pdfFallback)
    } finally {
      setIsResolving(false)
    }
  }, [onDropPaths])

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {(isDragging || isResolving) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
          <div className={cn(
            'flex flex-col items-center gap-4 p-10 rounded-2xl border-2 border-dashed transition-colors',
            'border-primary bg-primary/5'
          )}>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              {isResolving
                ? <FolderOpen className="w-8 h-8 text-primary animate-pulse" aria-hidden="true" />
                : <Upload className="w-8 h-8 text-primary" aria-hidden="true" />}
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">
                {isResolving ? 'Scanning for PDFs…' : 'Drop PDFs or folders here'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isResolving
                  ? 'Reading folder contents'
                  : 'Folders are imported recursively'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
