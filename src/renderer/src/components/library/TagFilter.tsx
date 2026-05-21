import { useEffect, useMemo, useRef, useState } from 'react'
import { Tag as TagIcon, ChevronDown, Search, Check, X } from 'lucide-react'
import { useLibraryStore } from '@/stores/library-store'
import { cn } from '@/lib/utils'

/**
 * Multi-select tag filter for the library grid header.
 *
 * Renders as a small button that opens a popover listing every distinct
 * tag in the library with its book count. Users can:
 *   - tick / untick tags to narrow the grid
 *   - flip between "match any" (OR) and "match all" (AND)
 *   - search/filter the tag list when there are many tags
 *
 * The active filter set lives in the library store, so chips elsewhere
 * (e.g. directly under the search row) can drive it too.
 */
export function TagFilter() {
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const tagMatch = useLibraryStore((s) => s.tagMatch)
  const toggleTagFilter = useLibraryStore((s) => s.toggleTagFilter)
  const clearTagFilter = useLibraryStore((s) => s.clearTagFilter)
  const setTagMatch = useLibraryStore((s) => s.setTagMatch)
  const allTags = useLibraryStore((s) => s.allTags)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const tags = useMemo(() => allTags(), [allTags])

  const filtered = useMemo(() => {
    if (!query.trim()) return tags
    const q = query.toLowerCase()
    return tags.filter(({ tag }) => tag.includes(q))
  }, [tags, query])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (!target) return
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // No tags anywhere yet: hide the filter so the toolbar isn't cluttered.
  if (tags.length === 0) return null

  const activeCount = tagFilter.length

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((s) => !s)}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors',
          activeCount > 0
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-secondary/60 border-border hover:bg-secondary text-foreground'
        )}
        title="Filter by tags"
      >
        <TagIcon className="w-3.5 h-3.5" />
        <span>Tags</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-medium bg-primary text-primary-foreground">
            {activeCount}
          </span>
        )}
        <ChevronDown
          className={cn('w-3 h-3 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-30 mt-1 right-0 w-72 bg-popover border border-border rounded-lg shadow-xl animate-pop-in overflow-hidden"
        >
          {/* Match mode toggle */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Match
            </span>
            <div className="flex items-center bg-secondary/60 rounded-md p-0.5">
              <button
                onClick={() => setTagMatch('any')}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                  tagMatch === 'any'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Show books with any of the selected tags"
              >
                Any
              </button>
              <button
                onClick={() => setTagMatch('all')}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                  tagMatch === 'all'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Only books that have ALL selected tags"
              >
                All
              </button>
            </div>
          </div>

          {/* Search */}
          {tags.length > 8 && (
            <div className="relative px-2 py-2 border-b border-border">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tags…"
                className="w-full pl-7 pr-2 py-1 text-xs bg-secondary/40 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          )}

          {/* Tag list */}
          <div className="max-h-64 overflow-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                No tags match “{query}”.
              </p>
            ) : (
              filtered.map(({ tag, count }) => {
                const checked = tagFilter.includes(tag)
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTagFilter(tag)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-secondary/60 transition-colors',
                      checked && 'bg-primary/5'
                    )}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center w-4 h-4 rounded border transition-colors',
                        checked
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-background'
                      )}
                    >
                      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 text-left truncate">{tag}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          {activeCount > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border">
              <span className="text-[11px] text-muted-foreground">
                {activeCount} {activeCount === 1 ? 'tag' : 'tags'} selected
              </span>
              <button
                onClick={clearTagFilter}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
