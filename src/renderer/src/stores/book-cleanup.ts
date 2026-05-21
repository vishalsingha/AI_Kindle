import { useReaderStore } from './reader-store'
import { useTabsStore } from './tabs-store'
import { useAIStore } from './ai-store'
import { useAnnotationStore } from './annotation-store'
import { useNoteStore } from './note-store'
import { useSelectionStore } from './selection-store'

// localStorage keys used by various surfaces to remember a "last seen" book.
// Listed explicitly here so cleanup stays honest when the keys are renamed.
const LAST_BOOK_KEY = 'ai-kindle-last-book-id'

/**
 * Purge every in-memory reference to the given book(s) from the renderer-side
 * Zustand stores and localStorage, so deleting a book leaves no ghost state:
 *
 *   - reader-store:     if the active book was deleted, close it
 *   - tabs-store:       remove every matching tab entry + split pane ref
 *   - ai-store:         drop the active conversation/messages if it was for
 *                       a deleted book; drop conversations from the list too
 *   - annotation-store: clear the cached annotations if they belonged to a
 *                       deleted book
 *   - note-store:       reset if the open note belonged to a deleted book
 *   - selection-store:  remove the deleted ids from any library-grid selection
 *   - localStorage:     clear `last-book-id` if it points at a deleted book
 *
 * Called from `library-store.deleteBook` / `deleteBooks` AFTER the main
 * process has finished its own cleanup so this is pure renderer state
 * reconciliation — no IPC is issued from here.
 */
export function purgeBookReferences(deletedIds: Iterable<string>): void {
  const ids = new Set(deletedIds)
  if (ids.size === 0) return

  // Reader: close the active book if it was deleted.
  const reader = useReaderStore.getState()
  if (reader.currentBook && ids.has(reader.currentBook.id)) {
    reader.closeBook()
  }

  // Tabs: remove every matching tab.
  const tabs = useTabsStore.getState()
  for (const id of ids) {
    tabs.closeTab(id)
  }

  // AI: drop any conversation attached to a deleted book. If the ACTIVE
  // conversation was for a deleted book, also clear messages so the chat
  // pane doesn't keep showing stale history.
  const ai = useAIStore.getState()
  const survivingConvs = ai.conversations.filter((c) => !ids.has(c.bookId))
  const activeStillValid =
    ai.currentConversation && !ids.has(ai.currentConversation.bookId)
  useAIStore.setState({
    conversations: survivingConvs,
    ...(activeStillValid
      ? {}
      : { currentConversation: null, messages: [], streamingContent: '', streamError: null, isStreaming: false })
  })

  // Annotations: the cache is scoped to one book at a time, so if the
  // book it was loaded for is gone, reset.
  const annotationStore = useAnnotationStore.getState()
  const first = annotationStore.annotations[0]
  if (first && ids.has(first.bookId)) {
    useAnnotationStore.setState({
      annotations: [],
      pageIndex: new Map(),
      selectedAnnotation: null
    })
  }

  // Notes: reset if the editor was holding a deleted book's note.
  const note = useNoteStore.getState()
  if (note.bookId && ids.has(note.bookId)) {
    note.reset()
  }

  // Library-grid bulk selection: drop any deleted ids from the checked set.
  const selection = useSelectionStore.getState()
  const checked = Array.from(selection.selectedIds).filter((id) => !ids.has(id))
  if (checked.length !== selection.selectedIds.size) {
    selection.setSelection(checked)
  }

  // Resume-last-session pointer: clear if it points at a deleted book.
  try {
    const last = localStorage.getItem(LAST_BOOK_KEY)
    if (last && ids.has(last)) localStorage.removeItem(LAST_BOOK_KEY)
  } catch {
    /* localStorage unavailable (e.g. strict mode) — nothing to do */
  }
}
