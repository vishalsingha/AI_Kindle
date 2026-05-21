import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Persisted UI-layout preferences that don't belong in any domain store.
// Keeping them separate avoids tangling things like panel widths into the
// library / reader / AI stores (which are already busy enough).

export const AI_PANEL_MIN_WIDTH = 280
export const AI_PANEL_MAX_WIDTH = 720
export const AI_PANEL_DEFAULT_WIDTH = 320

export const NOTES_PANEL_MIN_WIDTH = 280
export const NOTES_PANEL_MAX_WIDTH = 720
export const NOTES_PANEL_DEFAULT_WIDTH = 360

export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 560
export const SIDEBAR_DEFAULT_WIDTH = 288

interface UIState {
  aiPanelWidth: number
  notesPanelWidth: number
  sidebarWidth: number
  setAIPanelWidth: (w: number) => void
  setNotesPanelWidth: (w: number) => void
  setSidebarWidth: (w: number) => void
  resetAIPanelWidth: () => void
  resetNotesPanelWidth: () => void
  resetSidebarWidth: () => void
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(v)))

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      aiPanelWidth: AI_PANEL_DEFAULT_WIDTH,
      notesPanelWidth: NOTES_PANEL_DEFAULT_WIDTH,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setAIPanelWidth: (w) =>
        set({ aiPanelWidth: clamp(w, AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH) }),
      setNotesPanelWidth: (w) =>
        set({ notesPanelWidth: clamp(w, NOTES_PANEL_MIN_WIDTH, NOTES_PANEL_MAX_WIDTH) }),
      setSidebarWidth: (w) =>
        set({ sidebarWidth: clamp(w, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH) }),
      resetAIPanelWidth: () => set({ aiPanelWidth: AI_PANEL_DEFAULT_WIDTH }),
      resetNotesPanelWidth: () => set({ notesPanelWidth: NOTES_PANEL_DEFAULT_WIDTH }),
      resetSidebarWidth: () => set({ sidebarWidth: SIDEBAR_DEFAULT_WIDTH })
    }),
    { name: 'ai-kindle-ui' }
  )
)
