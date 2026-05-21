import { useEffect, useMemo } from 'react'
import {
  Search, LayoutGrid, List, BookOpen, Upload, CheckCircle2, Circle,
  BookMarked, Clock, Trash2, X, Tag as TagIcon
} from 'lucide-react'
import { useLibraryStore, getEffectiveStatus, type StatusFilter } from '@/stores/library-store'
import { useReaderStore } from '@/stores/reader-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useImporter } from '@/hooks/useImporter'
import { BookCard } from './BookCard'
import { BookCardSkeleton } from './BookCardSkeleton'
import { ImportButton } from './ImportButton'
import { ImportDialog } from './ImportDialog'
import { ImportDropzone } from './ImportDropzone'
import { VirtualBookGrid } from './VirtualBookGrid'
import { TagFilter } from './TagFilter'
import { cn, truncate } from '@/lib/utils'

export function LibraryGrid() {
  const {
    books,
    searchQuery,
    statusFilter,
    tagFilter,
    tagMatch,
    viewMode,
    sortBy,
    loading,
    setSearchQuery,
    setStatusFilter,
    toggleTagFilter,
    clearTagFilter,
    setViewMode,
    setSortBy,
    loadBooks,
    filteredBooks,
    counts,
    deleteBooks,
    setBookStatuses
  } = useLibraryStore()
  const { openBook } = useReaderStore()
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const clearSelection = useSelectionStore((s) => s.clear)
  const setAllSelection = useSelectionStore((s) => s.setAll)
  const importer = useImporter()

  useEffect(() => { loadBooks() }, [loadBooks])

  const filtered = filteredBooks()
  const c = counts()

  // Stable ordered list of visible book ids — used by BookCard for
  // shift-click range selection. Memoized on the id sequence so that
  // selection-only changes don't invalidate it and force re-renders.
  const orderedIds = useMemo(() => filtered.map((b) => b.id), [filtered])
  const orderedIdsKey = orderedIds.join('|')
  const stableOrderedIds = useMemo(() => orderedIds, [orderedIdsKey])

  const selectionCount = selectedIds.size
  const hasSelection = selectionCount > 0
  // Are all currently visible books selected?
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id))

  // Drop selections for books that have been deleted or filtered out so
  // stale ids don't accumulate. Intentionally scoped to deletions — a
  // filter change shouldn't silently wipe the user's selection.
  useEffect(() => {
    const existing = new Set(books.map((b) => b.id))
    const stale: string[] = []
    selectedIds.forEach((id) => { if (!existing.has(id)) stale.push(id) })
    if (stale.length > 0) {
      const state = useSelectionStore.getState()
      stale.forEach((id) => state.remove(id))
    }
  }, [books, selectedIds])

  // Global keyboard shortcuts while the library view is active.
  //   Esc    → clear selection
  //   ⌘A     → select all visible books
  //   Del/⌫  → delete selected (with confirmation)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      const meta = e.metaKey || e.ctrlKey

      if (e.key === 'Escape' && hasSelection && !typing) {
        e.preventDefault()
        clearSelection()
        return
      }
      if (meta && e.key.toLowerCase() === 'a' && !typing) {
        if (filtered.length === 0) return
        e.preventDefault()
        setAllSelection(filtered.map((b) => b.id))
        return
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && hasSelection && !typing) {
        e.preventDefault()
        void handleBulkDelete()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSelection, filtered, clearSelection, setAllSelection])

  const handleBulkDelete = async (): Promise<void> => {
    const ids = Array.from(useSelectionStore.getState().selectedIds)
    if (ids.length === 0) return
    const msg =
      ids.length === 1
        ? 'Delete this book? This cannot be undone.'
        : `Delete ${ids.length} books? This cannot be undone.`
    if (!confirm(msg)) return
    await deleteBooks(ids)
    clearSelection()
  }

  const handleBulkMark = async (status: 'todo' | 'done'): Promise<void> => {
    const ids = Array.from(useSelectionStore.getState().selectedIds)
    if (ids.length === 0) return
    await setBookStatuses(ids, status)
  }

  const handleToggleSelectAll = (): void => {
    if (allVisibleSelected) clearSelection()
    else setAllSelection(filtered.map((b) => b.id))
  }

  // Resolve the "last session" book from localStorage (set in reader-store
  // whenever a book is opened). Shown as Continue Reading if still present.
  const lastSessionId = useMemo(() => {
    try { return localStorage.getItem('ai-kindle-last-book-id') }
    catch { return null }
  }, [books.length])

  // Prefer the explicitly-remembered last session; fall back to most recent
  // in-progress book if none is remembered.
  const continueBook =
    (lastSessionId && books.find(b => b.id === lastSessionId && getEffectiveStatus(b) !== 'done')) ||
    [...books]
      .filter(b => getEffectiveStatus(b) === 'in-progress' && b.lastRead)
      .sort((a, b) => new Date(b.lastRead || 0).getTime() - new Date(a.lastRead || 0).getTime())[0]

  const tabs: Array<{ key: StatusFilter; label: string; count: number; icon?: typeof CheckCircle2 }> = [
    { key: 'all', label: 'All', count: c.all },
    { key: 'todo', label: 'To Do', count: c.todo, icon: Circle },
    { key: 'in-progress', label: 'In Progress', count: c.inProgress, icon: BookMarked },
    { key: 'done', label: 'Done', count: c.done, icon: CheckCircle2 }
  ]

  return (
    <ImportDropzone onDropPaths={importer.importPaths}>
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} {filtered.length === 1 ? 'book' : 'books'}
            </p>
          </div>
          <ImportButton
            onImportFiles={importer.importFiles}
            onImportFolder={importer.importFolder}
            busy={importer.busy}
          />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-3 bg-secondary/40 p-0.5 rounded-lg w-fit">
          {tabs.map(({ key, label, count, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                statusFilter === key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {Icon && <Icon className="w-3 h-3" />}
              {label}
              <span className={cn(
                'ml-0.5 px-1.5 py-0 rounded-full text-[10px] leading-4',
                statusFilter === key
                  ? 'bg-secondary text-foreground'
                  : 'bg-secondary/60 text-muted-foreground'
              )}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search books..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-secondary/60 border border-border rounded-lg text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-colors"
            />
          </div>

          <TagFilter />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-secondary/60 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer"
          >
            <option value="dateAdded">Date Added</option>
            <option value="lastRead">Last Read</option>
            <option value="title">Title</option>
          </select>

          <div className="flex items-center bg-secondary/60 border border-border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'focus-ring p-1.5 rounded-md transition-all',
                viewMode === 'grid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'focus-ring p-1.5 rounded-md transition-all',
                viewMode === 'list' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              title="List view"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Active tag-filter chips. Surfaces the current filter set above
            the grid so users can drop individual tags without re-opening
            the filter dropdown. */}
        {tagFilter.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 mt-3">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <TagIcon className="w-3 h-3" />
              {tagMatch === 'all' ? 'All of:' : 'Any of:'}
            </span>
            {tagFilter.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTagFilter(tag)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                title={`Remove tag: ${tag}`}
              >
                {tag}
                <X className="w-2.5 h-2.5 opacity-70" />
              </button>
            ))}
            <button
              onClick={clearTagFilter}
              className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Selection toolbar */}
      {hasSelection && (
        <div className="mx-6 mt-5 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/30 text-sm animate-pop-in">
          <span className="font-medium text-primary">
            {selectionCount} selected
          </span>
          <span className="text-muted-foreground text-xs">
            of {filtered.length}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleToggleSelectAll}
            className="px-2.5 py-1 rounded-md text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            {allVisibleSelected ? 'Deselect all' : 'Select all'}
          </button>
          <button
            onClick={() => handleBulkMark('done')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-green-700 hover:bg-green-500/10 dark:text-green-400 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Mark Done
          </button>
          <button
            onClick={() => handleBulkMark('todo')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <Circle className="w-3.5 h-3.5" />
            Mark To Do
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="focus-ring p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Clear selection (Esc)"
            aria-label="Clear selection"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Continue Reading banner */}
      {continueBook && !hasSelection && !searchQuery && statusFilter === 'all' && (
        <button
          onClick={() => openBook(continueBook)}
          className="mx-6 mt-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30 transition-colors text-left group"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-primary uppercase tracking-wider">
              Continue reading
            </p>
            <p className="text-sm font-semibold truncate">{truncate(continueBook.title, 60)}</p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 group-hover:text-foreground transition-colors">
            {continueBook.lastAnnotationPage > 0 ? `Page ${continueBook.lastAnnotationPage}` : 'Resume'} →
          </span>
        </button>
      )}

      {/* Book grid/list */}
      {loading ? (
        // Skeleton shimmer while `listBooks` is in flight. We render the
        // same layout we'd render once books load (grid vs list) so the
        // page doesn't visibly snap when real cards take over.
        viewMode === 'list' ? (
          <div
            className="flex-1 overflow-hidden p-6"
            role="status"
            aria-busy="true"
            aria-label="Loading library"
          >
            <div className="flex flex-col gap-1 max-w-3xl">
              {Array.from({ length: 6 }).map((_, i) => (
                <BookCardSkeleton key={i} viewMode="list" />
              ))}
            </div>
          </div>
        ) : (
          <div
            className="flex-1 overflow-hidden p-6"
            role="status"
            aria-busy="true"
            aria-label="Loading library"
          >
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <BookCardSkeleton key={i} viewMode="grid" />
              ))}
            </div>
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-primary/60" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                {searchQuery || tagFilter.length > 0
                  ? 'No books match'
                  : 'Your library is empty'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery
                  ? 'Try a different search term'
                  : tagFilter.length > 0
                  ? 'Try removing a tag filter or switching to “Any”'
                  : 'Import PDFs to start building your study library'}
              </p>
            </div>
            {tagFilter.length > 0 && (
              <button
                onClick={clearTagFilter}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear tag filter
              </button>
            )}
            {!searchQuery && tagFilter.length === 0 && (
              <button
                onClick={importer.importFiles}
                disabled={importer.busy}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Import Your First PDF
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <VirtualBookGrid books={filtered} orderedIds={stableOrderedIds} />
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="flex flex-col gap-1 max-w-3xl">
            {filtered.map(book => (
              <BookCard key={book.id} book={book} viewMode="list" orderedIds={stableOrderedIds} />
            ))}
          </div>
        </div>
      )}

      {importer.activeConflict && (
        <ImportDialog
          conflict={importer.activeConflict.conflict}
          progress={importer.progress}
          onDecide={importer.resolveConflict}
        />
      )}
    </div>
    </ImportDropzone>
  )
}
