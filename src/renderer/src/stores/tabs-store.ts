import { create } from 'zustand'
import type { Book } from './library-store'

// Lightweight tabs layer that sits on top of the single-pane reader store.
//   - tabs[]           : every book the user currently has open
//   - activeTabId      : the book currently driving the primary reader pane
//   - splitBookId      : optional second book rendered side-by-side (read-only
//                        "reference" pane — no annotation tools, keeps code
//                        changes to the main reader minimal).
// Per-tab reading position is remembered so switching tabs restores where
// the reader was.

export interface TabPosition {
  page: number
  zoom: number
}

export interface TabEntry {
  book: Book
  position: TabPosition
}

interface TabsState {
  tabs: TabEntry[]
  activeTabId: string | null
  splitBookId: string | null

  openTab: (book: Book) => void
  setActiveTab: (bookId: string) => void
  closeTab: (bookId: string) => void
  updateTabPosition: (bookId: string, position: Partial<TabPosition>) => void

  openInSplit: (book: Book) => void
  closeSplit: () => void
  swapSplitPanes: () => void
  setSplitBook: (bookId: string | null) => void

  reset: () => void
}

function removeTab(tabs: TabEntry[], bookId: string): TabEntry[] {
  return tabs.filter((t) => t.book.id !== bookId)
}

export const useTabsStore = create<TabsState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  splitBookId: null,

  openTab: (book) => {
    const { tabs, activeTabId } = get()
    const existing = tabs.find((t) => t.book.id === book.id)
    if (existing) {
      set({ activeTabId: book.id })
      return
    }
    const entry: TabEntry = {
      book,
      position: {
        page:
          book.status === 'done' || !book.lastAnnotationPage || book.lastAnnotationPage < 1
            ? 1
            : book.lastAnnotationPage,
        zoom: 1.2
      }
    }
    // Insert the new tab right after the active one so the tab bar feels
    // "chronological" in recent-use order without being disorienting.
    const activeIdx = activeTabId ? tabs.findIndex((t) => t.book.id === activeTabId) : -1
    const next = activeIdx >= 0
      ? [...tabs.slice(0, activeIdx + 1), entry, ...tabs.slice(activeIdx + 1)]
      : [...tabs, entry]
    set({ tabs: next, activeTabId: book.id })
  },

  setActiveTab: (bookId) => {
    const { tabs } = get()
    if (!tabs.some((t) => t.book.id === bookId)) return
    set({ activeTabId: bookId })
  },

  closeTab: (bookId) => {
    const { tabs, activeTabId, splitBookId } = get()
    const idx = tabs.findIndex((t) => t.book.id === bookId)
    if (idx === -1) return
    const nextTabs = removeTab(tabs, bookId)

    // Pick a replacement active tab: prefer the tab immediately to the left,
    // then to the right, then nothing.
    let nextActive = activeTabId
    if (activeTabId === bookId) {
      const fallback = nextTabs[idx - 1] ?? nextTabs[idx] ?? null
      nextActive = fallback?.book.id ?? null
    }

    set({
      tabs: nextTabs,
      activeTabId: nextActive,
      splitBookId: splitBookId === bookId ? null : splitBookId
    })
  },

  updateTabPosition: (bookId, position) => {
    const { tabs } = get()
    const next = tabs.map((t) =>
      t.book.id === bookId ? { ...t, position: { ...t.position, ...position } } : t
    )
    set({ tabs: next })
  },

  openInSplit: (book) => {
    const { tabs, activeTabId } = get()
    // Ensure the book also lives as a tab so the tab bar reflects reality.
    if (!tabs.some((t) => t.book.id === book.id)) {
      get().openTab(book)
      // openTab moves activeTabId — restore original focus.
      set({ activeTabId })
    }
    // Don't split against itself.
    if (activeTabId === book.id) return
    set({ splitBookId: book.id })
  },

  closeSplit: () => set({ splitBookId: null }),

  swapSplitPanes: () => {
    const { activeTabId, splitBookId } = get()
    if (!activeTabId || !splitBookId) return
    set({ activeTabId: splitBookId, splitBookId: activeTabId })
  },

  setSplitBook: (bookId) => set({ splitBookId: bookId }),

  reset: () => set({ tabs: [], activeTabId: null, splitBookId: null })
}))
