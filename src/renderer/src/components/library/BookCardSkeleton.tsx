/**
 * Loading-state placeholder for a book card.
 *
 * Mirrors the geometry of the real `BookCard` (3:4 thumbnail, ~64px info
 * footer, same border radius and card chrome) so the grid doesn't visibly
 * reflow once `listBooks` resolves and the real cards take over.
 *
 * The shimmer comes from the `.skeleton` utility defined in globals.css
 * — that class is theme-aware and respects `prefers-reduced-motion`.
 */
export function BookCardSkeleton({ viewMode = 'grid' }: { viewMode?: 'grid' | 'list' }): JSX.Element {
  if (viewMode === 'list') {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg border border-transparent"
        aria-hidden="true"
      >
        <div className="w-10 h-14 rounded skeleton shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-3.5 w-2/3 rounded skeleton" />
          <div className="mt-1.5 h-3 w-1/3 rounded skeleton" />
        </div>
        <div className="h-3 w-12 rounded skeleton shrink-0" />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden bg-card border border-border"
      aria-hidden="true"
    >
      <div className="aspect-[3/4] skeleton" />
      <div className="p-3">
        <div className="h-3.5 w-3/4 rounded skeleton" />
        <div className="mt-1.5 h-3 w-1/2 rounded skeleton" />
      </div>
    </div>
  )
}
