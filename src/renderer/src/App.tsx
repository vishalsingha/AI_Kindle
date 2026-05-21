import { useEffect, useCallback } from 'react'
import { useLibraryStore } from '@/stores/library-store'
import { useReaderStore } from '@/stores/reader-store'
import { useCommandPaletteStore } from '@/stores/command-palette-store'
import { useSelectionStore } from '@/stores/selection-store'
import { AppShell } from '@/components/layout/AppShell'

export default function App() {
  const { theme, setTheme, filteredBooks } = useLibraryStore()
  const {
    currentBook, currentPage, totalPages, setPage,
    zoomIn, zoomOut, toggleSidebar, toggleAIPanel, closeBook
  } = useReaderStore()

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey
    const key = e.key
    // Lowercased letter form so ⌘D / ⌘⇧D / etc. all match "d".
    const lkey = key.length === 1 ? key.toLowerCase() : key

    // Helper: after firing a global shortcut, dismiss the command palette
    // so the user isn't left staring at the now-stale list. We do this on
    // the next tick so the action itself runs before the modal unmounts.
    const dismissPalette = (): void => {
      const cp = useCommandPaletteStore.getState()
      if (cp.isOpen) cp.close()
    }

    // ── Always-on global shortcuts (work even while typing in any input,
    // including the command palette's search field) ─────────────────────
    if (meta && lkey === 'd') {
      e.preventDefault()
      setTheme(theme === 'dark' ? 'light' : 'dark')
      dismissPalette()
      return
    }

    // Library-scope shortcuts (no book open).
    if (!currentBook) {
      if (meta && lkey === 'a') {
        // Only hijack ⌘A when the user isn't actively editing text — a plain
        // ⌘A in an input should still mean "select all text".
        const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        if (!isTyping || useCommandPaletteStore.getState().isOpen) {
          e.preventDefault()
          useSelectionStore.getState().setAll(filteredBooks().map((b) => b.id))
          dismissPalette()
        }
      }
      return
    }

    // ── Reader-scope shortcuts (book open) ───────────────────────────────
    // Meta-key combos bypass the typing guard so they keep working from
    // the command palette's input, the page-number field, etc. Without
    // this, every shortcut hint shown in the palette is a lie.
    if (meta) {
      if (lkey === 'b') { e.preventDefault(); toggleSidebar(); dismissPalette(); return }
      if (lkey === 'j') { e.preventDefault(); toggleAIPanel(); dismissPalette(); return }
      // `=` and `+` are the same physical key — match both so ⌘= and ⌘⇧+
      // both zoom in. Some keyboards also surface the digit-row "+" as
      // `key === '+'` even without shift.
      if (key === '=' || key === '+') { e.preventDefault(); zoomIn(); dismissPalette(); return }
      if (key === '-' || key === '_') { e.preventDefault(); zoomOut(); dismissPalette(); return }
      if (key === 'ArrowRight') { e.preventDefault(); setPage(currentPage + 1); return }
      if (key === 'ArrowLeft')  { e.preventDefault(); setPage(currentPage - 1); return }
    }

    // Single-key navigation — gated behind the typing guard so it doesn't
    // hijack keystrokes the user means to type into a note / search box.
    const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    if (isTyping) return

    if (key === 'PageDown') { e.preventDefault(); setPage(currentPage + 1) }
    if (key === 'PageUp')   { e.preventDefault(); setPage(currentPage - 1) }
    if (key === 'Home')     { e.preventDefault(); setPage(1) }
    if (key === 'End')      { e.preventDefault(); setPage(totalPages) }
    // Don't let Escape leak through to closeBook when the palette is the
    // thing the user is actually trying to dismiss.
    if (key === 'Escape' && !useCommandPaletteStore.getState().isOpen) {
      closeBook()
    }
  }, [currentBook, currentPage, totalPages, theme, filteredBooks, setPage, zoomIn, zoomOut, toggleSidebar, toggleAIPanel, closeBook, setTheme])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={theme}>
      <div className="h-screen bg-background text-foreground theme-transition">
        <AppShell />
      </div>
    </div>
  )
}
