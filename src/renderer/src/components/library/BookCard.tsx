import { useState, useMemo, memo, useEffect, useRef } from 'react'
import {
  BookOpen, MoreVertical, Trash2, FolderOpen, Tag, Clock,
  CheckCircle2, Circle, RotateCcw, BookMarked, Check, Tags
} from 'lucide-react'
import { useReaderStore } from '@/stores/reader-store'
import { useLibraryStore, getEffectiveStatus, getProgress, type Book } from '@/stores/library-store'
import { useSelectionStore } from '@/stores/selection-store'
import { cn, formatDate, truncate } from '@/lib/utils'
import { renderThumbnail } from '@/lib/thumbnail'
import { TagEditor } from './TagEditor'

interface BookCardProps {
  book: Book
  viewMode: 'grid' | 'list'
  // The full ordered list of book ids currently visible in the library
  // grid. Needed so shift-click can select a contiguous range without
  // the card having to know about filter/sort state.
  orderedIds: string[]
}

function BookCardImpl({ book, viewMode, orderedIds }: BookCardProps) {
  const { openBook } = useReaderStore()
  const { deleteBook, toggleBookStatus } = useLibraryStore()
  const tagFilter = useLibraryStore((s) => s.tagFilter)
  const toggleTagFilter = useLibraryStore((s) => s.toggleTagFilter)
  // Subscribe narrowly: only re-render when *this* book's selection
  // state or the selection-mode flag flips, not on every other toggle.
  const isSelected = useSelectionStore((s) => s.selectedIds.has(book.id))
  const selectionMode = useSelectionStore((s) => s.selectedIds.size > 0)
  const [showMenu, setShowMenu] = useState(false)
  const [showTagEditor, setShowTagEditor] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const generatingRef = useRef(false)

  const pdfUrl = useMemo(() => window.api.getPDFUrl(book.filepath), [book.filepath])
  const effectiveStatus = getEffectiveStatus(book)
  const progress = getProgress(book)
  const isDone = effectiveStatus === 'done'
  const isInProgress = effectiveStatus === 'in-progress'

  // Fast path: if a cached thumbnail exists on disk, show it.
  // Slow path: render page 1 via pdf.js (no React tree), save as JPEG for next time.
  useEffect(() => {
    if (viewMode !== 'grid') return
    let cancelled = false

    const load = async (): Promise<void> => {
      try {
        const cached = await window.api.getThumbnailPath(book.hash)
        if (cancelled) return
        if (cached) {
          setThumbUrl(window.api.toFileURL(cached))
          return
        }
        // Not cached — generate on-demand in a concurrency-limited queue.
        if (generatingRef.current) return
        generatingRef.current = true
        const bytes = await renderThumbnail(pdfUrl)
        if (cancelled) return
        if (!bytes) {
          setLoadError(true)
          return
        }
        // Show immediately via a blob URL for instant feedback.
        const blob = new Blob([bytes], { type: 'image/jpeg' })
        const blobUrl = URL.createObjectURL(blob)
        setThumbUrl(blobUrl)
        // Persist to disk in the background for future launches.
        window.api.saveThumbnail(book.hash, bytes).catch(() => {})
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        generatingRef.current = false
      }
    }

    load()
    return () => {
      cancelled = true
      // Revoke any blob URL we created to free memory
      if (thumbUrl && thumbUrl.startsWith('blob:')) URL.revokeObjectURL(thumbUrl)
    }
    // We intentionally don't depend on thumbUrl — it's only tracked to clean up on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.hash, viewMode, pdfUrl])

  // Unified click handler that decides between open / toggle-selection
  // / range-select based on modifier keys and whether we're already in
  // selection mode. ⌘-click and shift-click always engage selection,
  // even from zero selections, matching Finder behavior.
  const handleCardClick = (e: React.MouseEvent): void => {
    const sel = useSelectionStore.getState()
    const meta = e.metaKey || e.ctrlKey
    const shift = e.shiftKey

    if (shift && (sel.hasAny() || meta)) {
      e.preventDefault()
      sel.selectRange(orderedIds, book.id)
      return
    }
    if (meta) {
      e.preventDefault()
      sel.toggle(book.id)
      return
    }
    if (selectionMode) {
      e.preventDefault()
      sel.toggle(book.id)
      return
    }
    openBook(book)
  }

  const handleCheckboxClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    const sel = useSelectionStore.getState()
    if (e.shiftKey && sel.hasAny()) sel.selectRange(orderedIds, book.id)
    else sel.toggle(book.id)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    if (confirm(`Delete "${book.title}"? This cannot be undone.`)) {
      await deleteBook(book.id)
    }
  }

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    window.api.revealInFinder(book.filepath)
  }

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowMenu(false)
    await toggleBookStatus(book.id)
  }

  const handleEditTags = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setShowMenu(false)
    setShowTagEditor(true)
  }

  const handleTagChipClick = (e: React.MouseEvent, tag: string): void => {
    e.stopPropagation()
    toggleTagFilter(tag)
  }

  if (viewMode === 'list') {
    return (
      <>
      <div
        onClick={handleCardClick}
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group border',
          isSelected
            ? 'bg-primary/10 border-primary/40 hover:bg-primary/15'
            : 'border-transparent hover:border-border hover:bg-card'
        )}
      >
        <SelectionCheckbox
          selected={isSelected}
          selectionMode={selectionMode}
          onClick={handleCheckboxClick}
          variant="list"
        />

        <div className="w-10 h-14 bg-muted rounded overflow-hidden shrink-0 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className={cn('text-sm font-medium truncate', isDone && 'text-muted-foreground')}>
            {book.title}
          </h3>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            {book.author && (
              <p className="text-xs text-muted-foreground truncate">{book.author}</p>
            )}
            {book.tags.length > 0 && (
              <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                {book.tags.slice(0, 4).map((t) => (
                  <button
                    key={t}
                    onClick={(e) => handleTagChipClick(e, t)}
                    className={cn(
                      'inline-flex items-center px-1.5 py-0 rounded-full text-[10px] transition-colors shrink-0',
                      tagFilter.includes(t)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    )}
                    title={`Filter by ${t}`}
                  >
                    {t}
                  </button>
                ))}
                {book.tags.length > 4 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    +{book.tags.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs shrink-0">
          {isDone ? (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Done
            </span>
          ) : isInProgress ? (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <BookMarked className="w-3.5 h-3.5" />
              {progress}%
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Circle className="w-3.5 h-3.5" />
              To Do
            </span>
          )}
          {book.lastRead && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatDate(book.lastRead)}
            </span>
          )}
          <button
            onClick={handleEditTags}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100"
            title="Edit tags"
          >
            <Tags className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {showTagEditor && <TagEditor book={book} onClose={() => setShowTagEditor(false)} />}
      </>
    )
  }

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'group relative flex flex-col rounded-xl overflow-hidden bg-card border cursor-pointer transition-all duration-200',
        isSelected
          ? 'border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/10'
          : isDone
          ? 'border-green-500/30 hover:border-green-500/50 hover:shadow-lg hover:shadow-green-500/5'
          : isInProgress
          ? 'border-amber-500/30 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-500/5'
          : 'border-border hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5'
      )}
    >
      {/* Selection checkbox — always visible when any books are
          selected; otherwise reveals on hover so it never distracts
          from the thumbnail art. */}
      <div
        className={cn(
          'absolute top-2 left-2 z-20 transition-opacity',
          selectionMode || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <SelectionCheckbox
          selected={isSelected}
          selectionMode={selectionMode}
          onClick={handleCheckboxClick}
          variant="grid"
        />
      </div>
      {/* Thumbnail */}
      <div
        className="aspect-[3/4] bg-gradient-to-br from-muted to-secondary relative overflow-hidden"
        data-book-thumb={book.id}
      >
        {thumbUrl && !loadError ? (
          <img
            src={thumbUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setLoadError(true)}
            draggable={false}
          />
        ) : loadError ? (
          // Render fallback once we've definitively failed to make a thumbnail
          // — distinct from the still-loading state so the user sees that
          // we tried, instead of an indefinite shimmer.
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <BookOpen className="w-10 h-10 opacity-40" aria-hidden="true" />
              <span className="text-[10px] font-medium opacity-60 uppercase tracking-wider">PDF</span>
            </div>
          </div>
        ) : (
          // Shimmer while the thumbnail is being rendered/fetched. Reuses
          // the global `.skeleton` utility so it matches the rest of the
          // loading affordances and respects reduced-motion.
          <div className="absolute inset-0 skeleton" aria-hidden="true" />
        )}

        {/* Done overlay */}
        {isDone && (
          <div className="absolute inset-0 bg-green-500/10 pointer-events-none" />
        )}

        {/* Status badge — shifts down when the selection checkbox is in
            the same corner so the two don't overlap. */}
        <div
          className={cn(
            'absolute left-2 transition-[top]',
            selectionMode || isSelected ? 'top-11' : 'top-2 group-hover:top-11'
          )}
        >
          <span
            className={cn(
              'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm shadow-sm',
              isDone
                ? 'bg-green-500/90 text-white'
                : isInProgress
                ? 'bg-amber-500/90 text-white'
                : 'bg-black/50 text-white'
            )}
          >
            {isDone ? (
              <>
                <CheckCircle2 className="w-2.5 h-2.5" />
                Done
              </>
            ) : isInProgress ? (
              <>
                <BookMarked className="w-2.5 h-2.5" />
                {progress}%
              </>
            ) : (
              <>
                <Circle className="w-2.5 h-2.5" />
                To Do
              </>
            )}
          </span>
        </div>

        {/* Progress bar overlay for in-progress books */}
        {isInProgress && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Menu button */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
            className="focus-ring p-1.5 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors"
            aria-label={`More actions for ${book.title}`}
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          {showMenu && (
            <div
              className="absolute top-full right-0 mt-1 w-44 bg-popover border border-border rounded-lg shadow-xl py-1 z-50 animate-pop-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleToggleStatus}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
              >
                {isDone ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    Mark as To Do
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark as Done
                  </>
                )}
              </button>
              <button
                onClick={handleEditTags}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
              >
                <Tags className="w-3.5 h-3.5" />
                Edit tags
              </button>
              <button
                onClick={handleReveal}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Show in Finder
              </button>
              <div className="h-px bg-border my-1" />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className={cn(
          'text-sm font-medium leading-tight truncate',
          isDone && 'text-muted-foreground'
        )}>
          {truncate(book.title, 40)}
        </h3>
        {book.tags.length > 0 ? (
          <div className="flex items-center gap-1 mt-1.5 min-w-0 overflow-hidden">
            <Tag className="w-2.5 h-2.5 text-primary/70 shrink-0" />
            {book.tags.slice(0, 3).map((t) => (
              <button
                key={t}
                onClick={(e) => handleTagChipClick(e, t)}
                className={cn(
                  'inline-flex items-center px-1.5 py-0 rounded-full text-[10px] transition-colors shrink-0',
                  tagFilter.includes(t)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                )}
                title={`Filter by ${t}`}
              >
                {t}
              </button>
            ))}
            {book.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                +{book.tags.length - 3}
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
              {isInProgress && book.annotationCount > 0
                ? `${book.annotationCount} ${book.annotationCount === 1 ? 'note' : 'notes'}`
                : book.pageCount > 0
                ? `${book.pageCount} pages`
                : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-muted-foreground">
              {book.lastRead ? formatDate(book.lastRead) : formatDate(book.dateAdded)}
            </span>
            {isInProgress && book.annotationCount > 0 ? (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {book.annotationCount} {book.annotationCount === 1 ? 'note' : 'notes'}
              </span>
            ) : book.pageCount > 0 ? (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {book.pageCount} pages
              </span>
            ) : null}
          </div>
        )}
      </div>
      {showTagEditor && <TagEditor book={book} onClose={() => setShowTagEditor(false)} />}
    </div>
  )
}

function SelectionCheckbox({
  selected, selectionMode, onClick, variant
}: {
  selected: boolean
  selectionMode: boolean
  onClick: (e: React.MouseEvent) => void
  variant: 'grid' | 'list'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      aria-pressed={selected}
      title={selected ? 'Deselect' : 'Select'}
      className={cn(
        'flex items-center justify-center rounded-md border transition-colors',
        variant === 'grid'
          ? 'w-6 h-6 backdrop-blur-sm shadow-sm'
          : cn(
              'w-5 h-5 shrink-0',
              // In list view the checkbox stays hidden until the row is
              // hovered or some books are already selected.
              !selected && !selectionMode && 'opacity-0 group-hover:opacity-100 transition-opacity'
            ),
        selected
          ? 'bg-primary border-primary text-primary-foreground'
          : variant === 'grid'
            ? 'bg-black/50 border-white/30 text-white hover:bg-black/70'
            : 'bg-background border-border hover:border-primary/60'
      )}
    >
      {selected && <Check className={variant === 'grid' ? 'w-3.5 h-3.5' : 'w-3 h-3'} strokeWidth={3} />}
    </button>
  )
}

// Re-render only when fields the card actually displays change.
// This prevents the entire library from re-rendering (and thus reloading
// PDF thumbnails) when an unrelated book is modified.
export const BookCard = memo(BookCardImpl, (prev, next) => {
  if (prev.viewMode !== next.viewMode) return false
  // Cheap identity check on orderedIds — LibraryGrid memoizes it, so this
  // is normally true; only filter/sort changes recreate the array.
  if (prev.orderedIds !== next.orderedIds) return false
  const a = prev.book, b = next.book
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.author === b.author &&
    a.status === b.status &&
    a.pageCount === b.pageCount &&
    a.annotationCount === b.annotationCount &&
    a.lastAnnotationPage === b.lastAnnotationPage &&
    a.lastRead === b.lastRead &&
    a.filepath === b.filepath &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i])
  )
})
