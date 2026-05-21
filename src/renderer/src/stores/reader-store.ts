import { create } from 'zustand'
import { useLibraryStore, type Book } from './library-store'
import { useTabsStore } from './tabs-store'

interface ReaderState {
  currentBook: Book | null
  currentPage: number
  totalPages: number
  zoom: number
  scrollMode: boolean
  sidebarOpen: boolean
  sidebarTab: 'toc' | 'annotations'
  aiPanelOpen: boolean
  notesPanelOpen: boolean
  pdfUrl: string | null
  selectedText: string
  selectionRects: Array<{ x: number; y: number; width: number; height: number }>
  selectionPage: number

  openBook: (book: Book) => void
  closeBook: () => void
  setPage: (page: number) => void
  setTotalPages: (total: number) => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  toggleScrollMode: () => void
  toggleSidebar: () => void
  setSidebarTab: (tab: 'toc' | 'annotations') => void
  toggleAIPanel: () => void
  toggleNotesPanel: () => void
  setSelection: (text: string, rects: Array<{ x: number; y: number; width: number; height: number }>, page: number) => void
  clearSelection: () => void
}

export const useReaderStore = create<ReaderState>()((set, get) => ({
  currentBook: null,
  currentPage: 1,
  totalPages: 0,
  zoom: 1.2,
  scrollMode: true,
  sidebarOpen: true,
  sidebarTab: 'toc',
  aiPanelOpen: false,
  notesPanelOpen: false,
  pdfUrl: null,
  selectedText: '',
  selectionRects: [],
  selectionPage: 0,

  openBook: (book) => {
    const url = window.api.getPDFUrl(book.filepath)
    // Prefer the per-tab remembered position so switching tabs restores
    // the last reading location. Fall back to annotation-based resume.
    const tabEntry = useTabsStore.getState().tabs.find((t) => t.book.id === book.id)
    const startPage = tabEntry
      ? tabEntry.position.page
      : book.status === 'done' || !book.lastAnnotationPage || book.lastAnnotationPage < 1
        ? 1
        : book.lastAnnotationPage
    const startZoom = tabEntry?.position.zoom ?? 1.2

    set({
      currentBook: book,
      currentPage: startPage,
      zoom: startZoom,
      pdfUrl: url,
      selectedText: '',
      selectionRects: [],
      selectionPage: 0
    })

    // Register with the tabs layer (no-op if already open).
    useTabsStore.getState().openTab(book)

    const now = new Date().toISOString()
    window.api.markBookOpened(book.id).catch(() => {})
    useLibraryStore.getState().updateBook(book.id, { lastRead: now })
    try { localStorage.setItem('ai-kindle-last-book-id', book.id) } catch { /* ignore */ }
  },

  closeBook: () => {
    // Closing the active book should also clean up the tabs layer so the
    // user isn't left with orphaned tabs after pressing Escape or "Library".
    useTabsStore.getState().reset()
    set({
      currentBook: null,
      pdfUrl: null,
      currentPage: 1,
      totalPages: 0,
      selectedText: '',
      selectionRects: [],
      selectionPage: 0
    })
  },

  setPage: (page) => {
    const { totalPages, currentPage, currentBook } = get()
    const clamped = Math.max(1, Math.min(page, totalPages || page))
    if (clamped === currentPage) return
    set({ currentPage: clamped })
    if (currentBook) useTabsStore.getState().updateTabPosition(currentBook.id, { page: clamped })
  },

  setTotalPages: (totalPages) => set({ totalPages }),
  setZoom: (zoom) => {
    const clamped = Math.max(0.5, Math.min(3, zoom))
    set({ zoom: clamped })
    const { currentBook } = get()
    if (currentBook) useTabsStore.getState().updateTabPosition(currentBook.id, { zoom: clamped })
  },
  zoomIn: () => {
    const next = Math.min(3, get().zoom + 0.2)
    set({ zoom: next })
    const { currentBook } = get()
    if (currentBook) useTabsStore.getState().updateTabPosition(currentBook.id, { zoom: next })
  },
  zoomOut: () => {
    const next = Math.max(0.5, get().zoom - 0.2)
    set({ zoom: next })
    const { currentBook } = get()
    if (currentBook) useTabsStore.getState().updateTabPosition(currentBook.id, { zoom: next })
  },
  toggleScrollMode: () => set((s) => ({ scrollMode: !s.scrollMode })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab, sidebarOpen: true }),
  // The right-hand side can show either the AI panel OR the notes editor,
  // but not both at once (they would each be far too narrow otherwise).
  toggleAIPanel: () => set((s) => ({
    aiPanelOpen: !s.aiPanelOpen,
    notesPanelOpen: s.aiPanelOpen ? s.notesPanelOpen : false
  })),
  toggleNotesPanel: () => set((s) => ({
    notesPanelOpen: !s.notesPanelOpen,
    aiPanelOpen: s.notesPanelOpen ? s.aiPanelOpen : false
  })),

  setSelection: (selectedText, selectionRects, selectionPage) =>
    set({ selectedText, selectionRects, selectionPage }),
  clearSelection: () => set({ selectedText: '', selectionRects: [], selectionPage: 0 })
}))
