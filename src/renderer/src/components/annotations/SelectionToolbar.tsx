import { MessageSquareQuote } from 'lucide-react'
import { useReaderStore } from '@/stores/reader-store'
import { useAnnotationStore, type Annotation } from '@/stores/annotation-store'
import { useAIStore } from '@/stores/ai-store'
import { HIGHLIGHT_COLORS } from '@/lib/colors'
import { boundingBox, iou, type Rect } from '@/lib/rects'

// Two selections are considered "the same highlight" when their text
// matches (ignoring whitespace variation) AND their bounding boxes
// overlap meaningfully. The IoU threshold is low-ish because consecutive
// selections of the same phrase can differ by a few sub-pixels due to
// getClientRects() behaviour — but a shared word picked from a long
// sentence won't hit this threshold.
const DUP_IOU_THRESHOLD = 0.5

function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

function findDuplicateHighlight(
  annotations: Annotation[],
  bookId: string,
  page: number,
  text: string,
  rects: Rect[]
): Annotation | null {
  const newText = normalizeText(text)
  if (!newText) return null
  const newBbox = boundingBox(rects)
  if (!newBbox) return null
  for (const a of annotations) {
    if (a.type !== 'highlight') continue
    if (a.bookId !== bookId) continue
    if (a.page !== page) continue
    if (normalizeText(a.selectedText) !== newText) continue
    const existingBbox = boundingBox(a.rects)
    if (!existingBbox) continue
    if (iou(newBbox, existingBbox) >= DUP_IOU_THRESHOLD) return a
  }
  return null
}

interface SelectionToolbarProps {
  position: { x: number; y: number }
}

export function SelectionToolbar({ position }: SelectionToolbarProps) {
  const {
    selectedText, selectionRects, selectionPage, currentBook,
    clearSelection, aiPanelOpen, toggleAIPanel
  } = useReaderStore()
  const { activeColor, addAnnotation, updateAnnotation, annotations } = useAnnotationStore()
  const addPendingContext = useAIStore((s) => s.addPendingContext)

  if (!selectedText || !currentBook) return null

  const createHighlight = async (color?: string) => {
    const nextColor = color || activeColor

    // Don't stack duplicate highlights on the same passage. If the user
    // re-highlights text that's already highlighted:
    //   - same color → treat as a no-op (silent dedupe),
    //   - different color → update the existing highlight in place.
    const duplicate = findDuplicateHighlight(
      annotations,
      currentBook.id,
      selectionPage,
      selectedText,
      selectionRects
    )
    if (duplicate) {
      if (duplicate.color !== nextColor) {
        await updateAnnotation(duplicate.id, { color: nextColor })
      }
      window.getSelection()?.removeAllRanges()
      clearSelection()
      return
    }

    await addAnnotation({
      bookId: currentBook.id,
      type: 'highlight',
      page: selectionPage,
      content: '',
      selectedText,
      color: nextColor,
      rects: selectionRects
    })
    window.getSelection()?.removeAllRanges()
    clearSelection()
  }

  /**
   * Stage the current selection as a context chip in the AI panel composer.
   * The chip persists until the user sends a message (where it's folded
   * into the model's PDF context block) or removes it manually. We open
   * the AI panel so the chip is visible right away.
   */
  const handleAddToChat = (): void => {
    addPendingContext({
      text: selectedText,
      page: selectionPage,
      sourceTitle: currentBook.title || 'Document'
    })
    if (!aiPanelOpen) toggleAIPanel()
    window.getSelection()?.removeAllRanges()
    clearSelection()
  }

  return (
    <div
      data-selection-toolbar
      className="absolute z-50 animate-pop-in"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -100%)'
      }}
    >
      <div className="bg-popover border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center p-1.5 gap-0.5">
          {/* Quick highlight colors */}
          {HIGHLIGHT_COLORS.map(color => (
            <button
              key={color.value}
              onClick={() => createHighlight(color.value)}
              className="focus-ring w-7 h-7 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
              title={`Highlight ${color.name}`}
              aria-label={`Highlight selection in ${color.name}`}
            >
              <div
                className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: color.value }}
                aria-hidden="true"
              />
            </button>
          ))}

          <div className="w-px h-5 bg-border mx-0.5" aria-hidden="true" />

          <button
            onClick={handleAddToChat}
            className="focus-ring p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            title="Send selection to chat as context"
            aria-label="Send selection to chat as context"
          >
            <MessageSquareQuote className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
