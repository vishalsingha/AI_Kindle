import { lazy, Suspense } from 'react'
import { useReaderStore } from '@/stores/reader-store'
import { useTabsStore } from '@/stores/tabs-store'
import { Titlebar } from './Titlebar'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { LibraryGrid } from '@/components/library/LibraryGrid'
import { CommandPalette } from '@/components/command/CommandPalette'

// Reader code is heavy (pdf.js text layer, annotation layer, AI panel, notes,
// split pane). Load it lazily so the library view boots quickly — the user
// may never open a book in a given session.
const PDFViewer = lazy(() =>
  import('@/components/reader/PDFViewer').then(m => ({ default: m.PDFViewer }))
)
const SecondaryPane = lazy(() =>
  import('@/components/reader/SecondaryPane').then(m => ({ default: m.SecondaryPane }))
)
const PageControls = lazy(() =>
  import('@/components/reader/PageControls').then(m => ({ default: m.PageControls }))
)
const ProgressBar = lazy(() =>
  import('@/components/reader/ProgressBar').then(m => ({ default: m.ProgressBar }))
)
const AIPanel = lazy(() =>
  import('@/components/ai/AIPanel').then(m => ({ default: m.AIPanel }))
)
const NotesPanel = lazy(() =>
  import('@/components/notes/NotesPanel').then(m => ({ default: m.NotesPanel }))
)

function ReaderFallback(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <span className="text-xs">Opening book…</span>
      </div>
    </div>
  )
}

function ReaderView(): JSX.Element {
  const { aiPanelOpen, notesPanelOpen, sidebarOpen } = useReaderStore()
  const { splitBookId, tabs } = useTabsStore()
  const splitBook = splitBookId ? tabs.find((t) => t.book.id === splitBookId)?.book : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <TabBar />
      <Suspense fallback={<ReaderFallback />}>
        <div className="flex-1 flex overflow-hidden min-h-0">
          {sidebarOpen && <Sidebar />}
          <div className="flex-1 flex overflow-hidden min-w-0 min-h-0">
            <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
              <ProgressBar />
              <PDFViewer />
              <PageControls />
            </div>
            {splitBook && <SecondaryPane key={splitBook.id} book={splitBook} />}
          </div>
          {notesPanelOpen && <NotesPanel />}
          {aiPanelOpen && <AIPanel />}
        </div>
      </Suspense>
    </div>
  )
}

export function AppShell(): JSX.Element {
  const { currentBook } = useReaderStore()

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Titlebar />
      <main className="flex-1 flex flex-col overflow-hidden min-h-0">
        {currentBook ? <ReaderView /> : <LibraryGrid />}
      </main>
      <CommandPalette />
    </div>
  )
}
