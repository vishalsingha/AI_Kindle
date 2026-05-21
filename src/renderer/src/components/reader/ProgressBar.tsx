import { useReaderStore } from '@/stores/reader-store'

export function ProgressBar() {
  const { currentPage, totalPages } = useReaderStore()

  if (!totalPages) return null

  const progress = (currentPage / totalPages) * 100

  return (
    <div className="h-1 bg-secondary shrink-0 relative group cursor-pointer" title={`Page ${currentPage} of ${totalPages}`}>
      <div
        className="h-full bg-primary/60 transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-popover border border-border rounded text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-sm">
        {Math.round(progress)}% · Page {currentPage}/{totalPages}
      </div>
    </div>
  )
}
