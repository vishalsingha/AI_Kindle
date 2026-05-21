import { create } from 'zustand'

// Tracks which books in the library are selected for bulk operations.
// Separate from the library store so selection churn doesn't trigger
// re-renders of book lists / filters.
//
// lastAnchorId is kept around so shift-click can produce a contiguous
// range selection against the most recent single click.

interface SelectionState {
  selectedIds: Set<string>
  lastAnchorId: string | null

  isSelected: (id: string) => boolean
  hasAny: () => boolean
  count: () => number

  toggle: (id: string) => void
  add: (id: string) => void
  remove: (id: string) => void
  selectRange: (orderedIds: string[], toId: string) => void
  setAll: (ids: string[]) => void
  clear: () => void
}

export const useSelectionStore = create<SelectionState>()((set, get) => ({
  selectedIds: new Set<string>(),
  lastAnchorId: null,

  isSelected: (id) => get().selectedIds.has(id),
  hasAny: () => get().selectedIds.size > 0,
  count: () => get().selectedIds.size,

  toggle: (id) => {
    const next = new Set(get().selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    set({ selectedIds: next, lastAnchorId: id })
  },

  add: (id) => {
    const next = new Set(get().selectedIds)
    next.add(id)
    set({ selectedIds: next, lastAnchorId: id })
  },

  remove: (id) => {
    const next = new Set(get().selectedIds)
    next.delete(id)
    set({ selectedIds: next })
  },

  // Select every id in the inclusive range between the last anchor (or
  // the clicked id, if none) and `toId`, as laid out in `orderedIds`.
  selectRange: (orderedIds, toId) => {
    const { lastAnchorId, selectedIds } = get()
    const anchor = lastAnchorId && orderedIds.includes(lastAnchorId) ? lastAnchorId : toId
    const a = orderedIds.indexOf(anchor)
    const b = orderedIds.indexOf(toId)
    if (a === -1 || b === -1) return
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    const next = new Set(selectedIds)
    for (let i = lo; i <= hi; i++) next.add(orderedIds[i])
    set({ selectedIds: next, lastAnchorId: toId })
  },

  setAll: (ids) => {
    set({ selectedIds: new Set(ids), lastAnchorId: ids[ids.length - 1] ?? null })
  },

  clear: () => set({ selectedIds: new Set(), lastAnchorId: null })
}))
