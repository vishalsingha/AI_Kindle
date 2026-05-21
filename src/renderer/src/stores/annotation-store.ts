import { create } from 'zustand'
import { useLibraryStore } from './library-store'

export interface Annotation {
  id: string
  bookId: string
  type: 'highlight' | 'comment' | 'text_note' | 'underline'
  page: number
  content: string
  selectedText: string
  color: string
  rects: Array<{ x: number; y: number; width: number; height: number }>
  createdAt: string
  updatedAt: string
}

interface AnnotationState {
  annotations: Annotation[]
  // Precomputed index for fast page-based lookups (O(1) instead of O(N) filter per page)
  pageIndex: Map<number, Annotation[]>
  activeTool: 'highlight' | 'comment' | 'text_note' | null
  activeColor: string
  selectedAnnotation: Annotation | null

  loadAnnotations: (bookId: string) => Promise<void>
  addAnnotation: (annotation: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Annotation | null>
  updateAnnotation: (id: string, updates: Partial<Annotation>) => Promise<void>
  removeAnnotation: (id: string) => Promise<void>
  setActiveTool: (tool: 'highlight' | 'comment' | 'text_note' | null) => void
  setActiveColor: (color: string) => void
  setSelectedAnnotation: (annotation: Annotation | null) => void
  getPageAnnotations: (page: number) => Annotation[]
  exportAnnotations: (bookId: string) => Promise<string>
}

const EMPTY: Annotation[] = []

function buildPageIndex(annotations: Annotation[]): Map<number, Annotation[]> {
  const idx = new Map<number, Annotation[]>()
  for (const a of annotations) {
    const existing = idx.get(a.page)
    if (existing) existing.push(a)
    else idx.set(a.page, [a])
  }
  return idx
}

// Recompute derived book stats (annotation count, last-annotated page) from
// the current annotation list, and push them into the library store so the
// BookCard progress updates live.
function syncBookProgress(annotations: Annotation[]): void {
  if (annotations.length === 0) return
  const bookId = annotations[0].bookId
  const sameBook = annotations.filter(a => a.bookId === bookId)
  const lastPage = sameBook.reduce((m, a) => Math.max(m, a.page), 0)
  useLibraryStore.getState().updateBook(bookId, {
    annotationCount: sameBook.length,
    lastAnnotationPage: lastPage
  })
}

function syncEmptyBook(bookId: string): void {
  useLibraryStore.getState().updateBook(bookId, {
    annotationCount: 0,
    lastAnnotationPage: 0
  })
}

export const useAnnotationStore = create<AnnotationState>()((set, get) => ({
  annotations: [],
  pageIndex: new Map(),
  activeTool: 'highlight',
  activeColor: '#FBBF24',
  selectedAnnotation: null,

  loadAnnotations: async (bookId) => {
    try {
      const annotations = await window.api.getAnnotations(bookId)
      set({ annotations, pageIndex: buildPageIndex(annotations) })
      if (annotations.length > 0) syncBookProgress(annotations)
      else syncEmptyBook(bookId)
    } catch (err) {
      console.error('Failed to load annotations:', err)
    }
  },

  addAnnotation: async (annotation) => {
    try {
      const saved = await window.api.saveAnnotation(annotation)
      const next = [...get().annotations, saved]
      set({ annotations: next, pageIndex: buildPageIndex(next) })
      syncBookProgress(next)
      return saved
    } catch (err) {
      console.error('Failed to save annotation:', err)
      return null
    }
  },

  updateAnnotation: async (id, updates) => {
    const existing = get().annotations.find(a => a.id === id)
    if (!existing) return
    const updated = { ...existing, ...updates }
    try {
      await window.api.saveAnnotation(updated)
      const next = get().annotations.map(a => (a.id === id ? updated : a))
      set({ annotations: next, pageIndex: buildPageIndex(next) })
      syncBookProgress(next)
    } catch (err) {
      console.error('Failed to update annotation:', err)
    }
  },

  removeAnnotation: async (id) => {
    try {
      const existing = get().annotations.find(a => a.id === id)
      await window.api.deleteAnnotation(id)
      const next = get().annotations.filter(a => a.id !== id)
      set({ annotations: next, pageIndex: buildPageIndex(next) })
      if (existing) {
        if (next.length === 0) syncEmptyBook(existing.bookId)
        else syncBookProgress(next)
      }
    } catch (err) {
      console.error('Failed to delete annotation:', err)
    }
  },

  setActiveTool: (activeTool) => set({ activeTool }),
  setActiveColor: (activeColor) => set({ activeColor }),
  setSelectedAnnotation: (selectedAnnotation) => set({ selectedAnnotation }),

  getPageAnnotations: (page) => get().pageIndex.get(page) ?? EMPTY,

  exportAnnotations: async (bookId) => {
    return window.api.exportAnnotations(bookId)
  }
}))
