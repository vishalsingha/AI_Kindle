import { useEffect, useRef } from 'react'
import { X, SplitSquareHorizontal, ArrowLeftRight } from 'lucide-react'
import { useTabsStore } from '@/stores/tabs-store'
import { useReaderStore } from '@/stores/reader-store'
import { useLibraryStore } from '@/stores/library-store'
import { cn, truncate } from '@/lib/utils'

export function TabBar() {
  const { tabs, activeTabId, splitBookId, setActiveTab, closeTab, openInSplit, closeSplit, swapSplitPanes } = useTabsStore()
  const { currentBook, openBook, closeBook } = useReaderStore()
  const { books } = useLibraryStore()
  const activeRef = useRef<HTMLDivElement>(null)

  // Keep the active tab scrolled into view when switched programmatically.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeTabId])

  // When the user clicks a tab, we swap which book drives the reader pane.
  // openBook already records per-tab position on tab switch via the reader
  // store's setPage/setZoom hooks, so switching is resume-safe.
  const handleActivate = (bookId: string): void => {
    if (activeTabId === bookId) return
    setActiveTab(bookId)
    const book = books.find((b) => b.id === bookId) ?? tabs.find((t) => t.book.id === bookId)?.book
    if (book) openBook(book as any)
  }

  const handleClose = (e: React.MouseEvent, bookId: string): void => {
    e.stopPropagation()
    const wasActive = activeTabId === bookId
    closeTab(bookId)

    const remaining = useTabsStore.getState()
    if (remaining.tabs.length === 0) {
      // Last tab closed — return to the library.
      closeBook()
      return
    }
    if (wasActive && remaining.activeTabId) {
      const next = remaining.tabs.find((t) => t.book.id === remaining.activeTabId)
      if (next) openBook(next.book as any)
    }
  }

  const handleOpenSplit = (): void => {
    // Pick the first non-active tab as the split target. If none, do nothing.
    const other = tabs.find((t) => t.book.id !== activeTabId)
    if (!other) return
    openInSplit(other.book)
  }

  if (tabs.length === 0 || !currentBook) return null

  const canSplit = tabs.length >= 2

  return (
    <div className="flex items-stretch h-9 border-b border-border bg-sidebar/60 shrink-0 overflow-hidden">
      <div className="flex-1 flex items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.book.id === activeTabId
          const isSplit = tab.book.id === splitBookId
          return (
            <div
              key={tab.book.id}
              ref={isActive ? activeRef : null}
              onClick={() => handleActivate(tab.book.id)}
              onAuxClick={(e) => { if (e.button === 1) handleClose(e as any, tab.book.id) }}
              className={cn(
                'group relative flex items-center gap-2 px-3 min-w-[120px] max-w-[240px] cursor-pointer border-r border-border select-none',
                isActive
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                isSplit && 'ring-1 ring-inset ring-primary/40'
              )}
              title={tab.book.title}
            >
              {isActive && (
                <span className="absolute inset-x-0 top-0 h-[2px] bg-primary pointer-events-none" />
              )}
              <span className="text-xs font-medium truncate flex-1 min-w-0">
                {truncate(tab.book.title, 40)}
              </span>
              <button
                onClick={(e) => handleClose(e, tab.book.id)}
                className={cn(
                  'p-0.5 rounded transition-opacity',
                  isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:opacity-100'
                )}
                title="Close tab"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-0.5 px-2 border-l border-border">
        {splitBookId ? (
          <>
            <button
              onClick={swapSplitPanes}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Swap panes"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={closeSplit}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Close split"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={handleOpenSplit}
            disabled={!canSplit}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              canSplit
                ? 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                : 'text-muted-foreground/40 cursor-not-allowed'
            )}
            title={canSplit ? 'Split view' : 'Open a second book to enable split view'}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
