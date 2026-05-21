import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { purgeBookReferences } from './book-cleanup'

export type BookStatus = 'todo' | 'done'
export type EffectiveStatus = 'todo' | 'in-progress' | 'done'

export interface Book {
  id: string
  hash: string
  title: string
  author: string
  filename: string
  filepath: string
  pageCount: number
  currentPage: number
  status: BookStatus
  lastAnnotationPage: number
  annotationCount: number
  tags: string[]
  dateAdded: string
  lastRead: string | null
}

export type StatusFilter = 'all' | 'todo' | 'in-progress' | 'done'

export function getEffectiveStatus(book: Book): EffectiveStatus {
  if (book.status === 'done') return 'done'
  if (book.annotationCount > 0) return 'in-progress'
  return 'todo'
}

export function getProgress(book: Book): number {
  if (book.pageCount <= 0) return 0
  if (book.status === 'done') return 100
  if (book.lastAnnotationPage <= 0) return 0
  return Math.min(100, Math.round((book.lastAnnotationPage / book.pageCount) * 100))
}

export type TagMatch = 'any' | 'all'

export function normalizeTag(raw: string): string {
  // Tags are normalized so "ML", " ml ", and "ml" don't show up as three
  // separate chips. Lowercase + collapse internal whitespace + cap length.
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)
}

interface LibraryState {
  books: Book[]
  searchQuery: string
  statusFilter: StatusFilter
  tagFilter: string[]
  tagMatch: TagMatch
  viewMode: 'grid' | 'list'
  sortBy: 'title' | 'dateAdded' | 'lastRead'
  theme: 'light' | 'dark'
  loading: boolean

  loadBooks: () => Promise<void>
  deleteBook: (id: string) => Promise<void>
  deleteBooks: (ids: string[]) => Promise<void>
  updateBook: (id: string, data: Partial<Book>) => void
  updateBookTags: (id: string, tags: string[]) => Promise<void>
  setBookStatus: (id: string, status: BookStatus) => Promise<void>
  setBookStatuses: (ids: string[], status: BookStatus) => Promise<void>
  toggleBookStatus: (id: string) => Promise<void>
  setSearchQuery: (query: string) => void
  setStatusFilter: (filter: StatusFilter) => void
  setTagFilter: (tags: string[]) => void
  toggleTagFilter: (tag: string) => void
  clearTagFilter: () => void
  setTagMatch: (mode: TagMatch) => void
  setViewMode: (mode: 'grid' | 'list') => void
  setSortBy: (sort: 'title' | 'dateAdded' | 'lastRead') => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void

  filteredBooks: () => Book[]
  counts: () => { all: number; todo: number; inProgress: number; done: number }
  /** Distinct tags across the library, sorted by frequency desc, then alpha. */
  allTags: () => Array<{ tag: string; count: number }>
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      books: [],
      searchQuery: '',
      statusFilter: 'all',
      tagFilter: [],
      tagMatch: 'any',
      viewMode: 'grid',
      sortBy: 'dateAdded',
      theme: 'light',
      loading: false,

      loadBooks: async () => {
        set({ loading: true })
        try {
          const books = await window.api.listBooks()
          set({ books: books as Book[], loading: false })
        } catch {
          set({ loading: false })
        }
      },

      deleteBook: async (id) => {
        await window.api.deleteBook(id)
        set({ books: get().books.filter(b => b.id !== id) })
        // Scrub the deleted book out of every other renderer store so no
        // panel keeps showing ghost data (reader, tabs, AI chat, notes,
        // annotations, grid selection, resume-last-session pointer).
        purgeBookReferences([id])
      },

      // Delete many books at once. Issues deletes in parallel but only
      // rebuilds the list state once at the end so React re-renders the
      // grid a single time regardless of how many books are removed.
      deleteBooks: async (ids) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        await Promise.allSettled(ids.map((id) => window.api.deleteBook(id)))
        set({ books: get().books.filter(b => !idSet.has(b.id)) })
        purgeBookReferences(idSet)
      },

      updateBook: (id, data) => {
        set({
          books: get().books.map(b => (b.id === id ? { ...b, ...data } : b))
        })
      },

      // Persist a book's tag list. Tags are normalized + deduped before
      // being written so the on-disk representation stays canonical no
      // matter what the editor sent.
      updateBookTags: async (id, tags) => {
        const seen = new Set<string>()
        const cleaned: string[] = []
        for (const t of tags) {
          const norm = normalizeTag(t)
          if (!norm) continue
          if (seen.has(norm)) continue
          seen.add(norm)
          cleaned.push(norm)
        }
        await window.api.updateBook(id, { tags: cleaned })
        set({
          books: get().books.map(b => (b.id === id ? { ...b, tags: cleaned } : b))
        })
        // If the user removed every instance of a tag from the library, the
        // existing tag filter could now refer to a tag nothing matches. We
        // intentionally leave it alone — the filter UI will simply show 0
        // results, which is honest and lets the user re-add the tag without
        // re-selecting their filter.
      },

      setBookStatus: async (id, status) => {
        await window.api.setBookStatus(id, status)
        set({
          books: get().books.map(b =>
            b.id === id ? { ...b, status, lastRead: new Date().toISOString() } : b
          )
        })
      },

      setBookStatuses: async (ids, status) => {
        if (ids.length === 0) return
        const idSet = new Set(ids)
        const now = new Date().toISOString()
        await Promise.allSettled(ids.map((id) => window.api.setBookStatus(id, status)))
        set({
          books: get().books.map(b =>
            idSet.has(b.id) ? { ...b, status, lastRead: now } : b
          )
        })
      },

      toggleBookStatus: async (id) => {
        const book = get().books.find(b => b.id === id)
        if (!book) return
        const next: BookStatus = book.status === 'done' ? 'todo' : 'done'
        await get().setBookStatus(id, next)
      },

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      setTagFilter: (tags) => {
        const seen = new Set<string>()
        const cleaned: string[] = []
        for (const t of tags) {
          const norm = normalizeTag(t)
          if (!norm || seen.has(norm)) continue
          seen.add(norm)
          cleaned.push(norm)
        }
        set({ tagFilter: cleaned })
      },
      toggleTagFilter: (tag) => {
        const norm = normalizeTag(tag)
        if (!norm) return
        const { tagFilter } = get()
        if (tagFilter.includes(norm)) {
          set({ tagFilter: tagFilter.filter((t) => t !== norm) })
        } else {
          set({ tagFilter: [...tagFilter, norm] })
        }
      },
      clearTagFilter: () => set({ tagFilter: [] }),
      setTagMatch: (tagMatch) => set({ tagMatch }),
      setViewMode: (viewMode) => set({ viewMode }),
      setSortBy: (sortBy) => set({ sortBy }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      filteredBooks: () => {
        const { books, searchQuery, statusFilter, tagFilter, tagMatch, sortBy } = get()
        let filtered = books

        if (statusFilter !== 'all') {
          filtered = filtered.filter(b => getEffectiveStatus(b) === statusFilter)
        }

        if (tagFilter.length > 0) {
          // tagFilter is already normalized; book.tags is normalized at
          // write time. Either every selected tag must be present (all)
          // or at least one (any).
          if (tagMatch === 'all') {
            filtered = filtered.filter(b =>
              tagFilter.every(t => b.tags.includes(t))
            )
          } else {
            const set = new Set(tagFilter)
            filtered = filtered.filter(b => b.tags.some(t => set.has(t)))
          }
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          filtered = filtered.filter(
            b =>
              b.title.toLowerCase().includes(q) ||
              b.author.toLowerCase().includes(q) ||
              b.tags.some(t => t.toLowerCase().includes(q))
          )
        }

        return [...filtered].sort((a, b) => {
          if (sortBy === 'title') return a.title.localeCompare(b.title)
          if (sortBy === 'dateAdded') return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
          if (sortBy === 'lastRead') {
            if (!a.lastRead && !b.lastRead) return 0
            if (!a.lastRead) return 1
            if (!b.lastRead) return -1
            return new Date(b.lastRead).getTime() - new Date(a.lastRead).getTime()
          }
          return 0
        })
      },

      counts: () => {
        const { books } = get()
        return {
          all: books.length,
          todo: books.filter(b => getEffectiveStatus(b) === 'todo').length,
          inProgress: books.filter(b => getEffectiveStatus(b) === 'in-progress').length,
          done: books.filter(b => getEffectiveStatus(b) === 'done').length
        }
      },

      allTags: () => {
        const { books } = get()
        const counts = new Map<string, number>()
        for (const b of books) {
          for (const t of b.tags) {
            const norm = normalizeTag(t)
            if (!norm) continue
            counts.set(norm, (counts.get(norm) ?? 0) + 1)
          }
        }
        return Array.from(counts.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count
            return a.tag.localeCompare(b.tag)
          })
      }
    }),
    {
      name: 'ai-kindle-library',
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortBy: state.sortBy,
        theme: state.theme,
        statusFilter: state.statusFilter,
        tagFilter: state.tagFilter,
        tagMatch: state.tagMatch
      })
    }
  )
)
