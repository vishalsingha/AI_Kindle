import { useEffect, useRef, useState } from 'react'
import {
  Eye, Pencil, Columns, Download, Save, Loader2, Check,
  ChevronDown, Plus, Trash2, FileText, StickyNote
} from 'lucide-react'
import { useNoteStore } from '@/stores/note-store'
import { useReaderStore } from '@/stores/reader-store'
import { NotesMarkdown } from './NotesMarkdown'
import { cn } from '@/lib/utils'

type Mode = 'edit' | 'preview' | 'split'

export function MarkdownEditor() {
  const { currentBook } = useReaderStore()
  const {
    bookId, notes, activeNoteId, content, status,
    loadNotes, selectNote, createNote, setContent,
    renameNote, deleteNote, flush
  } = useNoteStore()
  const [mode, setMode] = useState<Mode>('split')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showList, setShowList] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const listPopoverRef = useRef<HTMLDivElement>(null)
  const listToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (currentBook && currentBook.id !== bookId) {
      void loadNotes(currentBook.id)
    }
  }, [currentBook, bookId, loadNotes])

  useEffect(() => {
    return () => {
      void useNoteStore.getState().flush()
    }
  }, [])

  // Close the notes popover when the user clicks outside it (or hits Esc).
  useEffect(() => {
    if (!showList) return

    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as Node | null
      if (!target) return
      if (listPopoverRef.current?.contains(target)) return
      if (listToggleRef.current?.contains(target)) return
      setShowList(false)
      setRenamingId(null)
      setRenameDraft('')
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowList(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [showList])

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  const handleExport = (): void => {
    if (!currentBook || !activeNote) return
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentBook.title} — ${activeNote.title}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key.toLowerCase() === 's') {
      e.preventDefault()
      void flush()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const { selectionStart, selectionEnd, value } = ta
      const next = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd)
      setContent(next)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = selectionStart + 2
      })
    }
  }

  const handleCreateNote = async (): Promise<void> => {
    await createNote('Untitled')
    setShowList(false)
  }

  const beginRename = (id: string, currentTitle: string): void => {
    setRenamingId(id)
    setRenameDraft(currentTitle)
  }

  const cancelRename = (): void => {
    setRenamingId(null)
    setRenameDraft('')
  }

  const commitRename = async (id: string): Promise<void> => {
    const next = renameDraft.trim()
    if (next) await renameNote(id, next)
    cancelRename()
  }

  if (!currentBook) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        {/* Left cluster: notes selector */}
        <div className="flex items-center gap-1 min-w-0">
          <button
            ref={listToggleRef}
            onClick={() => setShowList((s) => !s)}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium max-w-[180px] transition-colors',
              showList
                ? 'bg-secondary text-foreground'
                : 'text-foreground/90 hover:bg-secondary'
            )}
            title="Show all notes for this book"
          >
            <StickyNote className="w-3.5 h-3.5 shrink-0 text-primary/70" />
            <span className="truncate">{activeNote?.title ?? 'No note'}</span>
            <ChevronDown
              className={cn('w-3 h-3 shrink-0 transition-transform', showList && 'rotate-180')}
            />
          </button>
          <button
            onClick={handleCreateNote}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="New note"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right cluster: mode + save/export */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 bg-secondary/40 p-0.5 rounded-md">
            <ModeButton icon={<Pencil className="w-3 h-3" />} label="Edit" active={mode === 'edit'} onClick={() => setMode('edit')} />
            <ModeButton icon={<Columns className="w-3 h-3" />} label="Split" active={mode === 'split'} onClick={() => setMode('split')} />
            <ModeButton icon={<Eye className="w-3 h-3" />} label="Preview" active={mode === 'preview'} onClick={() => setMode('preview')} />
          </div>
          <SaveIndicator status={status} />
          <button
            onClick={() => void flush()}
            disabled={!activeNote}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Save now (⌘S)"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleExport}
            disabled={!activeNote}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="Export as Markdown"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Notes list popover */}
      {showList && (
        <div
          ref={listPopoverRef}
          className="border-b border-border bg-sidebar/60 max-h-56 overflow-auto"
        >
          {notes.length === 0 ? (
            <div className="px-3 py-3 text-[11px] text-muted-foreground">
              No notes yet for this book. Click the + above to create one.
            </div>
          ) : (
            notes.map((n) => {
              const isRenaming = renamingId === n.id
              const isActive = n.id === activeNoteId
              const handlePick = (): void => {
                if (isRenaming) return
                void selectNote(n.id)
                setShowList(false)
              }
              return (
                <div
                  key={n.id}
                  className={cn(
                    'group flex items-center gap-1 px-3 py-1.5 hover:bg-secondary/60 transition-colors',
                    isActive && 'bg-primary/5'
                  )}
                >
                  <FileText className="w-3 h-3 shrink-0 text-muted-foreground/70" />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          commitRename(n.id)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelRename()
                        }
                      }}
                      onBlur={() => commitRename(n.id)}
                      className="flex-1 bg-secondary/80 border border-primary/40 rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/30"
                      maxLength={120}
                    />
                  ) : (
                    <button
                      onClick={handlePick}
                      title="Open note"
                      className="flex-1 text-left text-xs truncate cursor-pointer"
                    >
                      {n.title}
                    </button>
                  )}
                  {isRenaming ? (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); commitRename(n.id) }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Save name"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); beginRename(n.id, n.title) }}
                      className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Rename note"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); void deleteNote(n.id) }}
                    className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Delete note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )
            })
          )}
          <button
            onClick={handleCreateNote}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 border-t border-border transition-colors"
          >
            <Plus className="w-3 h-3" />
            New note
          </button>
        </div>
      )}

      {/* Editor surface */}
      <div className={cn('flex-1 min-h-0 flex', mode === 'split' ? 'divide-x divide-border' : '')}>
        {!activeNote ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <StickyNote className="w-10 h-10 text-primary/30" />
            <p className="text-sm font-medium">No note yet for this book</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Keep multiple long-form notes per PDF. Switch between them with
              the selector above.
            </p>
            <button
              onClick={handleCreateNote}
              className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first note
            </button>
          </div>
        ) : (
          <>
            {(mode === 'edit' || mode === 'split') && (
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`# ${activeNote.title}\n\nWrite your long-form thoughts about this book here.\n\n- Use **markdown**\n- Lists, quotes, code — all supported\n- Auto-saves as you type`}
                className={cn(
                  'flex-1 min-w-0 resize-none bg-background text-foreground',
                  'p-4 text-sm leading-relaxed font-mono outline-none',
                  'placeholder:text-muted-foreground/50'
                )}
                spellCheck
              />
            )}
            {(mode === 'preview' || mode === 'split') && (
              <div className="flex-1 min-w-0 overflow-auto p-4 text-sm leading-relaxed">
                {content.trim()
                  ? <NotesMarkdown content={content} />
                  : <p className="text-muted-foreground/60">Preview appears here…</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ModeButton({
  icon, label, active, onClick
}: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function SaveIndicator({ status }: { status: 'idle' | 'loading' | 'saving' | 'saved' | 'dirty' }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving
      </span>
    )
  }
  if (status === 'dirty') {
    return <span className="text-[10px] text-muted-foreground">Unsaved</span>
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
        <Check className="w-3 h-3" />
        Saved
      </span>
    )
  }
  return null
}
