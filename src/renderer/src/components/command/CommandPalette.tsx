import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Search, BookOpen, Sun, Moon, PanelLeft, BrainCircuit,
  NotebookPen, SplitSquareHorizontal, ArrowLeftRight, CheckCircle2,
  Circle, ZoomIn, ZoomOut, FileText, X, LibraryBig, Download
} from 'lucide-react'
import { useCommandPaletteStore } from '@/stores/command-palette-store'
import { useLibraryStore } from '@/stores/library-store'
import { useReaderStore } from '@/stores/reader-store'
import { useTabsStore } from '@/stores/tabs-store'
import { useAnnotationStore } from '@/stores/annotation-store'
import { useSelectionStore } from '@/stores/selection-store'
import { fuzzyFilter } from '@/lib/fuzzy'
import { cn, truncate } from '@/lib/utils'

type CommandItem = {
  id: string
  label: string
  hint?: string
  keywords?: string
  icon: React.ReactNode
  section: 'Actions' | 'Books' | 'Navigation'
  shortcut?: string
  run: () => void | Promise<void>
}

export function CommandPalette() {
  const { isOpen, close, open } = useCommandPaletteStore()
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const { books, theme, toggleTheme, toggleBookStatus, deleteBooks, filteredBooks } = useLibraryStore()
  const selectedCount = useSelectionStore((s) => s.selectedIds.size)
  const setAllSelection = useSelectionStore((s) => s.setAll)
  const clearSelection = useSelectionStore((s) => s.clear)
  const {
    currentBook, openBook, closeBook, setPage, totalPages,
    zoomIn, zoomOut, toggleSidebar, toggleAIPanel, toggleNotesPanel
  } = useReaderStore()
  const { tabs, openInSplit, closeSplit, swapSplitPanes, splitBookId } = useTabsStore()
  const { exportAnnotations } = useAnnotationStore()

  // Global ⌘K / Ctrl+K shortcut — registered once at mount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useCommandPaletteStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setHighlightIdx(0)
    }
  }, [isOpen])

  const commands: CommandItem[] = useMemo(() => {
    const out: CommandItem[] = []

    // Actions — always available
    out.push({
      id: 'theme:toggle',
      label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      hint: 'Theme',
      icon: theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
      section: 'Actions',
      shortcut: '⌘D',
      run: () => toggleTheme()
    })

    // Library-scope selection commands (only shown when viewing the library).
    if (!currentBook) {
      out.push({
        id: 'selection:select-all',
        label: 'Select all visible books',
        icon: <LibraryBig className="w-4 h-4" />,
        section: 'Actions',
        shortcut: '⌘A',
        run: () => setAllSelection(filteredBooks().map((b) => b.id))
      })
      if (selectedCount > 0) {
        out.push({
          id: 'selection:delete',
          label: `Delete ${selectedCount} selected book${selectedCount === 1 ? '' : 's'}`,
          hint: 'Cannot be undone',
          icon: <X className="w-4 h-4" />,
          section: 'Actions',
          run: async () => {
            const ids = Array.from(useSelectionStore.getState().selectedIds)
            if (ids.length === 0) return
            if (!confirm(`Delete ${ids.length} book${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
            await deleteBooks(ids)
            clearSelection()
          }
        })
        out.push({
          id: 'selection:clear',
          label: 'Clear selection',
          icon: <Circle className="w-4 h-4" />,
          section: 'Actions',
          shortcut: 'Esc',
          run: () => clearSelection()
        })
      }
    }

    if (currentBook) {
      out.push({
        id: 'view:library',
        label: 'Back to library',
        hint: 'Close all tabs',
        icon: <LibraryBig className="w-4 h-4" />,
        section: 'Actions',
        shortcut: 'Esc',
        run: () => closeBook()
      })
      out.push({
        id: 'panel:notes',
        label: 'Toggle notes panel',
        hint: 'Long-form markdown notes',
        icon: <NotebookPen className="w-4 h-4" />,
        section: 'Actions',
        run: () => toggleNotesPanel()
      })
      out.push({
        id: 'panel:ai',
        label: 'Toggle AI assistant',
        hint: 'Chat, summarize, explain',
        icon: <BrainCircuit className="w-4 h-4" />,
        section: 'Actions',
        shortcut: '⌘J',
        run: () => toggleAIPanel()
      })
      out.push({
        id: 'panel:sidebar',
        label: 'Toggle sidebar',
        hint: 'Contents & notes',
        icon: <PanelLeft className="w-4 h-4" />,
        section: 'Actions',
        shortcut: '⌘B',
        run: () => toggleSidebar()
      })
      out.push({
        id: 'zoom:in',
        label: 'Zoom in',
        icon: <ZoomIn className="w-4 h-4" />,
        section: 'Actions',
        shortcut: '⌘+',
        run: () => zoomIn()
      })
      out.push({
        id: 'zoom:out',
        label: 'Zoom out',
        icon: <ZoomOut className="w-4 h-4" />,
        section: 'Actions',
        shortcut: '⌘-',
        run: () => zoomOut()
      })
      out.push({
        id: 'book:toggle-done',
        label: currentBook && books.find(b => b.id === currentBook.id)?.status === 'done'
          ? 'Mark book as to-do'
          : 'Mark book as done',
        icon: currentBook && books.find(b => b.id === currentBook.id)?.status === 'done'
          ? <Circle className="w-4 h-4" />
          : <CheckCircle2 className="w-4 h-4" />,
        section: 'Actions',
        run: () => toggleBookStatus(currentBook.id)
      })
      out.push({
        id: 'book:export-annotations',
        label: 'Export annotations as Markdown',
        icon: <Download className="w-4 h-4" />,
        section: 'Actions',
        run: async () => {
          const md = await exportAnnotations(currentBook.id)
          const blob = new Blob([md], { type: 'text/markdown' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${currentBook.title}-annotations.md`
          a.click()
          URL.revokeObjectURL(url)
        }
      })

      // Split view management
      if (splitBookId) {
        out.push({
          id: 'split:close',
          label: 'Close split view',
          icon: <X className="w-4 h-4" />,
          section: 'Actions',
          run: () => closeSplit()
        })
        out.push({
          id: 'split:swap',
          label: 'Swap split panes',
          icon: <ArrowLeftRight className="w-4 h-4" />,
          section: 'Actions',
          run: () => swapSplitPanes()
        })
      }

      // Navigation — page jumps by query like "page 42"
      const pageMatch = query.match(/^(?:p|page)\s*(\d+)$/i)
      if (pageMatch) {
        const target = Math.max(1, Math.min(totalPages || Number(pageMatch[1]), Number(pageMatch[1])))
        out.push({
          id: 'nav:page',
          label: `Go to page ${target}`,
          icon: <FileText className="w-4 h-4" />,
          section: 'Navigation',
          keywords: 'jump page number',
          run: () => setPage(target)
        })
      }
    }

    // Books — open any book from the library in a tab
    for (const book of books) {
      const isOpen = tabs.some((t) => t.book.id === book.id)
      const isActive = currentBook?.id === book.id
      out.push({
        id: `book:${book.id}`,
        label: truncate(book.title, 70),
        hint: isActive ? 'Active tab' : isOpen ? 'Already open' : book.author || 'Open in reader',
        keywords: `${book.author} ${book.tags.join(' ')}`,
        icon: <BookOpen className="w-4 h-4" />,
        section: 'Books',
        run: () => openBook(book)
      })
    }

    // "Open in split" commands when a primary book is active and query
    // looks like it's looking for a second doc.
    if (currentBook) {
      for (const book of books) {
        if (book.id === currentBook.id) continue
        out.push({
          id: `split:open:${book.id}`,
          label: `Open in split: ${truncate(book.title, 50)}`,
          hint: 'Side-by-side reader',
          keywords: `split ${book.author}`,
          icon: <SplitSquareHorizontal className="w-4 h-4" />,
          section: 'Actions',
          run: () => openInSplit(book)
        })
      }
    }

    return out
  }, [
    theme, currentBook, books, tabs, splitBookId, totalPages, query,
    selectedCount, filteredBooks, deleteBooks, setAllSelection, clearSelection,
    toggleTheme, closeBook, toggleNotesPanel, toggleAIPanel, toggleSidebar,
    zoomIn, zoomOut, toggleBookStatus, exportAnnotations, closeSplit,
    swapSplitPanes, setPage, openBook, openInSplit
  ])

  const filtered = useMemo(() => {
    const q = query.trim()
    const scored = fuzzyFilter(commands, q, (c) =>
      `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''} ${c.section}`
    )
    // Cap to avoid rendering hundreds of rows.
    return scored.slice(0, 80).map((s) => s.item)
  }, [commands, query])

  // Group by section while preserving filter order.
  const grouped = useMemo(() => {
    const order: CommandItem['section'][] = []
    const map = new Map<CommandItem['section'], CommandItem[]>()
    for (const cmd of filtered) {
      if (!map.has(cmd.section)) {
        map.set(cmd.section, [])
        order.push(cmd.section)
      }
      map.get(cmd.section)!.push(cmd)
    }
    return order.map((section) => ({ section, items: map.get(section)! }))
  }, [filtered])

  // Flat ordered list for keyboard navigation (matches visual order).
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  // Keep highlighted item scrolled into view on arrow nav.
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlightIdx}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  const runCommand = (cmd: CommandItem | undefined): void => {
    if (!cmd) return
    close()
    // Defer execution a tick so the dialog closes cleanly before side
    // effects (especially those that move focus) fire.
    setTimeout(() => { void cmd.run() }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(flat[highlightIdx])
    } else if (e.key === 'Escape') {
      // Stop the event from bubbling up to App.tsx's window-level handler,
      // which would otherwise also close the active book whenever the
      // user dismisses the palette with Esc.
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(v) => (v ? open() : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-[18%] -translate-x-1/2 w-[min(640px,92vw)] z-50 bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-command-palette-in"
          onKeyDown={handleKeyDown}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search for books, pages, and commands. Use arrow keys to navigate and Enter to run.
          </Dialog.Description>

          <div className="flex items-center gap-2 px-4 h-12 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a command or search books…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
              ESC
            </kbd>
          </div>

          <div ref={listRef} className="max-h-[420px] overflow-auto py-1">
            {flat.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No commands match "{query}"
              </div>
            ) : (
              grouped.map(({ section, items }) => (
                <div key={section}>
                  <div className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                    {section}
                  </div>
                  {items.map((cmd) => {
                    const idx = flat.indexOf(cmd)
                    const active = idx === highlightIdx
                    return (
                      <button
                        key={cmd.id}
                        data-idx={idx}
                        onMouseMove={() => setHighlightIdx(idx)}
                        onClick={() => runCommand(cmd)}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
                          active ? 'bg-secondary text-foreground' : 'text-foreground/90 hover:bg-secondary/60'
                        )}
                      >
                        <span className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground')}>
                          {cmd.icon}
                        </span>
                        <span className="flex-1 min-w-0 truncate">{cmd.label}</span>
                        {cmd.hint && (
                          <span className="text-[11px] text-muted-foreground shrink-0 truncate max-w-[180px]">
                            {cmd.hint}
                          </span>
                        )}
                        {cmd.shortcut && (
                          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground font-medium shrink-0">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-4 px-4 h-8 border-t border-border bg-sidebar/40 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-secondary">↑↓</kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-secondary">↵</kbd> select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded bg-secondary">esc</kbd> close
              </span>
            </div>
            <span>{flat.length} result{flat.length === 1 ? '' : 's'}</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
