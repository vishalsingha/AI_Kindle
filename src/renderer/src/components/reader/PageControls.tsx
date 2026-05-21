import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  BookOpen, ScrollText
} from 'lucide-react'
import { useReaderStore } from '@/stores/reader-store'
import { cn } from '@/lib/utils'

export function PageControls() {
  const {
    currentPage, totalPages, zoom, scrollMode,
    setPage, zoomIn, zoomOut, setZoom, toggleScrollMode
  } = useReaderStore()

  return (
    <div className="h-12 border-t border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
      {/* View mode */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleScrollMode}
          className={cn(
            'focus-ring p-2 rounded-lg transition-colors',
            scrollMode
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
          title={scrollMode ? 'Switch to page mode' : 'Switch to scroll mode'}
          aria-label={scrollMode ? 'Switch to page mode' : 'Switch to scroll mode'}
          aria-pressed={scrollMode}
        >
          {scrollMode
            ? <ScrollText className="w-4 h-4" aria-hidden="true" />
            : <BookOpen className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous page"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => setPage(parseInt(e.target.value) || 1)}
            className="w-12 text-center bg-secondary/60 border border-border rounded-md py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
            aria-label="Current page number"
          />
          <span className="text-muted-foreground" aria-hidden="true">/</span>
          <span className="text-muted-foreground" aria-label={`of ${totalPages} pages`}>
            {totalPages}
          </span>
        </div>

        <button
          onClick={() => setPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next page"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={zoomOut}
          className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          onClick={() => setZoom(1.0)}
          className="focus-ring px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors min-w-[48px] text-center"
          title="Reset zoom to 100%"
          aria-label={`Zoom level ${Math.round(zoom * 100)} percent. Click to reset to 100 percent`}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
