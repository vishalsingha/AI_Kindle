import { useState } from 'react'
import {
  BookOpen, Minus, Square, X, Sun, Moon, PanelLeft, BrainCircuit,
  CheckCircle2, Circle, NotebookPen, Command, FileDown, Loader2
} from 'lucide-react'
import { useLibraryStore } from '@/stores/library-store'
import { useReaderStore } from '@/stores/reader-store'
import { useCommandPaletteStore } from '@/stores/command-palette-store'
import { cn } from '@/lib/utils'

export function Titlebar() {
  const platform = window.api.getPlatform()
  const { theme, toggleTheme, toggleBookStatus, books } = useLibraryStore()
  const {
    currentBook, closeBook, toggleSidebar, toggleAIPanel, toggleNotesPanel,
    sidebarOpen, aiPanelOpen, notesPanelOpen
  } = useReaderStore()
  const openPalette = useCommandPaletteStore((s) => s.open)
  const [exportingPDF, setExportingPDF] = useState(false)

  // Read status from library store so the button reflects toggles immediately
  const liveBook = currentBook ? books.find(b => b.id === currentBook.id) : null
  const isDone = liveBook?.status === 'done'

  const handleDownloadAnnotatedPDF = async (): Promise<void> => {
    if (!currentBook || exportingPDF) return
    setExportingPDF(true)
    try {
      const result = await window.api.exportAnnotatedPDF(currentBook.id)
      if (!result.ok && !result.canceled) {
        // The titlebar is too cramped for an inline error banner, so we
        // surface failures via the OS alert. The most common cause is
        // "no annotations yet" or a missing source file on disk.
        alert(result.error ?? 'Failed to export annotated PDF.')
      }
    } catch (err) {
      console.error('Annotated PDF export failed:', err)
      alert((err as Error)?.message ?? 'Failed to export annotated PDF.')
    } finally {
      setExportingPDF(false)
    }
  }

  return (
    <div className="h-11 flex items-center justify-between bg-sidebar border-b border-border titlebar-drag shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-2 h-full">
        {platform === 'darwin' && <div className="w-[78px]" />}

        {currentBook ? (
          <div className="flex items-center gap-2 px-3 titlebar-no-drag">
            <button
              onClick={closeBook}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              ← Library
            </button>
            <div className="w-px h-4 bg-border" />
            <span className="text-sm font-medium truncate max-w-[300px]">
              {currentBook.title}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold tracking-tight">AI Kindle</span>
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-1 px-2 titlebar-no-drag">
        {currentBook && (
          <>
            <button
              onClick={() => toggleBookStatus(currentBook.id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                isDone
                  ? 'bg-green-500/15 text-green-600 hover:bg-green-500/25 dark:text-green-400'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              )}
              title={isDone ? 'Mark as To Do' : 'Mark as Done'}
            >
              {isDone ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Done
                </>
              ) : (
                <>
                  <Circle className="w-3.5 h-3.5" />
                  Mark Done
                </>
              )}
            </button>
            <button
              onClick={() => void handleDownloadAnnotatedPDF()}
              disabled={exportingPDF}
              className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              title="Download annotated PDF"
              aria-label="Download annotated PDF"
            >
              {exportingPDF
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <FileDown className="w-4 h-4" aria-hidden="true" />}
            </button>
            <div className="w-px h-4 bg-border mx-1" />
            <button
              onClick={toggleSidebar}
              className={cn(
                'focus-ring p-1.5 rounded-md transition-colors',
                sidebarOpen
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
              aria-pressed={sidebarOpen}
            >
              <PanelLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={toggleNotesPanel}
              className={cn(
                'focus-ring p-1.5 rounded-md transition-colors',
                notesPanelOpen
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
              title="Long-form notes (Markdown)"
              aria-label="Toggle notes panel"
              aria-pressed={notesPanelOpen}
            >
              <NotebookPen className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={toggleAIPanel}
              className={cn(
                'focus-ring p-1.5 rounded-md transition-colors',
                aiPanelOpen
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              )}
              title="AI Assistant"
              aria-label="Toggle AI assistant"
              aria-pressed={aiPanelOpen}
            >
              <BrainCircuit className="w-4 h-4" aria-hidden="true" />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
          </>
        )}

        {/* Command palette */}
        <button
          onClick={openPalette}
          className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Command palette (⌘K)"
          aria-label="Open command palette"
        >
          <Command className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark'
            ? <Sun className="w-4 h-4" aria-hidden="true" />
            : <Moon className="w-4 h-4" aria-hidden="true" />}
        </button>

        {/* Window controls (non-macOS) */}
        {platform !== 'darwin' && (
          <div className="flex items-center ml-2">
            <button
              onClick={() => window.api.minimizeWindow()}
              className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Minimize window"
              title="Minimize"
            >
              <Minus className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              onClick={() => window.api.maximizeWindow()}
              className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Maximize window"
              title="Maximize"
            >
              <Square className="w-3 h-3" aria-hidden="true" />
            </button>
            <button
              onClick={() => window.api.closeWindow()}
              className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Close window"
              title="Close"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
