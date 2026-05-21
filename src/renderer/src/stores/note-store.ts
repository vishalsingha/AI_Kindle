import { create } from 'zustand'

// Per-book markdown notes — now multiple per PDF. The store holds:
//   - a list of `notes` summaries for the active book
//   - the active note's full content with debounced auto-save
//   - status flags so the editor can show "Saving / Saved / Unsaved"
//
// Switching the active note flushes pending changes for the previous one
// before loading the next, so unsaved edits never leak across notes.

export interface NoteSummary {
  id: string
  bookId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface NoteData extends NoteSummary {
  content: string
}

interface NoteState {
  bookId: string | null
  notes: NoteSummary[]
  activeNoteId: string | null
  content: string
  status: 'idle' | 'loading' | 'saving' | 'saved' | 'dirty'
  lastSavedAt: string | null

  loadNotes: (bookId: string) => Promise<void>
  selectNote: (id: string) => Promise<void>
  createNote: (title?: string) => Promise<NoteSummary | null>
  setContent: (content: string) => void
  renameNote: (id: string, title: string) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  flush: () => Promise<void>
  reset: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const AUTO_SAVE_MS = 700

const cancelTimer = (): void => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

export const useNoteStore = create<NoteState>()((set, get) => ({
  bookId: null,
  notes: [],
  activeNoteId: null,
  content: '',
  status: 'idle',
  lastSavedAt: null,

  loadNotes: async (bookId) => {
    cancelTimer()
    // Flush any pending edit for the previous book before we move on.
    await get().flush()

    set({
      bookId,
      notes: [],
      activeNoteId: null,
      content: '',
      status: 'loading'
    })

    try {
      const notes = (await window.api.listNotes(bookId)) as NoteSummary[]
      // Race guard: user could have switched books while the listNotes
      // promise was in flight.
      if (get().bookId !== bookId) return

      if (notes.length === 0) {
        set({ notes: [], activeNoteId: null, content: '', status: 'idle' })
        return
      }

      // Open the most-recently-updated note by default.
      const first = notes[0]
      const full = await window.api.getNote(first.id)
      if (get().bookId !== bookId) return
      set({
        notes,
        activeNoteId: first.id,
        content: full?.content ?? '',
        status: 'idle'
      })
    } catch {
      if (get().bookId === bookId) set({ status: 'idle' })
    }
  },

  selectNote: async (id) => {
    const { activeNoteId } = get()
    if (id === activeNoteId) return
    cancelTimer()
    await get().flush()

    set({ activeNoteId: id, content: '', status: 'loading' })
    try {
      const full = await window.api.getNote(id)
      if (get().activeNoteId !== id) return
      set({ content: full?.content ?? '', status: 'idle' })
    } catch {
      if (get().activeNoteId === id) set({ status: 'idle' })
    }
  },

  createNote: async (title) => {
    const { bookId } = get()
    if (!bookId) return null
    cancelTimer()
    await get().flush()
    const created = (await window.api.createNote(bookId, title)) as NoteData
    // Prepend in the list — newest-on-top matches the listNotes ordering
    // (DESC by updated_at) and avoids a refetch.
    set((s) => ({
      notes: [
        {
          id: created.id,
          bookId: created.bookId,
          title: created.title,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt
        },
        ...s.notes
      ],
      activeNoteId: created.id,
      content: '',
      status: 'idle'
    }))
    return created
  },

  setContent: (content) => {
    const { activeNoteId } = get()
    set({ content, status: 'dirty' })
    if (!activeNoteId) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void get().flush()
    }, AUTO_SAVE_MS)
  },

  flush: async () => {
    cancelTimer()
    const { activeNoteId, content, status } = get()
    if (!activeNoteId) return
    // Skip if there's nothing dirty to write — avoids a no-op DB hit on
    // every book switch / unmount.
    if (status !== 'dirty') return

    set({ status: 'saving' })
    try {
      const updated = await window.api.updateNoteContent(activeNoteId, content)
      if (get().activeNoteId !== activeNoteId) return
      set((s) => ({
        status: 'saved',
        lastSavedAt: new Date().toISOString(),
        notes: updated
          ? s.notes.map((n) =>
              n.id === activeNoteId ? { ...n, updatedAt: updated.updatedAt } : n
            )
          : s.notes
      }))
    } catch {
      if (get().activeNoteId === activeNoteId) set({ status: 'dirty' })
    }
  },

  renameNote: async (id, title) => {
    const updated = await window.api.renameNote(id, title)
    if (!updated) return
    set((s) => ({
      notes: s.notes.map((n) =>
        n.id === id ? { ...n, title: updated.title, updatedAt: updated.updatedAt } : n
      )
    }))
  },

  deleteNote: async (id) => {
    cancelTimer()
    await window.api.deleteNote(id)
    set((s) => {
      const remaining = s.notes.filter((n) => n.id !== id)
      // If we deleted the active note, fall back to the next one in the
      // list (or to an empty editor if none remain).
      if (s.activeNoteId === id) {
        const next = remaining[0]
        return {
          notes: remaining,
          activeNoteId: next?.id ?? null,
          content: '',
          status: next ? 'loading' : 'idle'
        }
      }
      return { notes: remaining }
    })

    // Hydrate the new active note's content (if any) outside of `set` so we
    // don't block; activeNoteId could have been reassigned above.
    const { activeNoteId } = get()
    if (activeNoteId && activeNoteId !== id) {
      try {
        const full = await window.api.getNote(activeNoteId)
        if (get().activeNoteId === activeNoteId) {
          set({ content: full?.content ?? '', status: 'idle' })
        }
      } catch {
        if (get().activeNoteId === activeNoteId) set({ status: 'idle' })
      }
    }
  },

  reset: () => {
    cancelTimer()
    set({
      bookId: null,
      notes: [],
      activeNoteId: null,
      content: '',
      status: 'idle',
      lastSavedAt: null
    })
  }
}))
