import { MarkdownEditor } from './MarkdownEditor'
import {
  useUIStore,
  NOTES_PANEL_MIN_WIDTH, NOTES_PANEL_MAX_WIDTH
} from '@/stores/ui-store'
import { ResizeHandle } from '@/components/layout/ResizeHandle'

// Side-dock wrapper for the markdown editor. Mirrors the sizing conventions
// of AIPanel — including the drag-to-resize handle — so the two feel
// interchangeable when toggled.
export function NotesPanel() {
  const notesPanelWidth = useUIStore((s) => s.notesPanelWidth)
  const setNotesPanelWidth = useUIStore((s) => s.setNotesPanelWidth)
  const resetNotesPanelWidth = useUIStore((s) => s.resetNotesPanelWidth)

  return (
    <div className="flex shrink-0 animate-slide-in-right">
      <ResizeHandle
        width={notesPanelWidth}
        onResize={setNotesPanelWidth}
        onReset={resetNotesPanelWidth}
        side="right"
        min={NOTES_PANEL_MIN_WIDTH}
        max={NOTES_PANEL_MAX_WIDTH}
      />
      <div
        className="border-l border-border bg-sidebar/40 flex flex-col shrink-0 min-w-0"
        style={{ width: `${notesPanelWidth}px` }}
      >
        <MarkdownEditor />
      </div>
    </div>
  )
}
