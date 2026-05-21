import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Tag as TagIcon, Plus, Loader2 } from 'lucide-react'
import { useLibraryStore, normalizeTag, type Book } from '@/stores/library-store'
import { cn } from '@/lib/utils'

interface Props {
  book: Book
  onClose: () => void
}

/**
 * Modal for editing the tag list on a single book.
 *
 * - Tags are normalized (lowercase, trimmed, deduped) before save.
 * - Suggestions surface tags already used elsewhere in the library so
 *   users converge on a small canonical vocabulary instead of typo-ing
 *   variants ("nlp" vs "NLP" vs "natural language processing").
 * - Enter or comma in the input commits the current draft as a chip.
 * - Backspace on an empty input removes the most recent chip.
 * - Esc / outside-click / Cancel closes without saving.
 */
export function TagEditor({ book, onClose }: Props) {
  const allTags = useLibraryStore((s) => s.allTags)
  const updateBookTags = useLibraryStore((s) => s.updateBookTags)

  const [tags, setTags] = useState<string[]>(() => book.tags.map(normalizeTag))
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Esc / outside-click closes (without saving).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    const onPointer = (e: PointerEvent): void => {
      if (!dialogRef.current) return
      if (dialogRef.current.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [onClose])

  const suggestions = useMemo(() => {
    const have = new Set(tags)
    const q = normalizeTag(input)
    return allTags()
      .filter(({ tag }) => !have.has(tag))
      .filter(({ tag }) => !q || tag.includes(q))
      .slice(0, 8)
  }, [allTags, tags, input])

  const addTag = (raw: string): void => {
    const norm = normalizeTag(raw)
    if (!norm) return
    if (tags.includes(norm)) return
    setTags((prev) => [...prev, norm])
    setInput('')
  }

  const removeTag = (tag: string): void => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
      return
    }
    if (e.key === 'Backspace' && input.length === 0 && tags.length > 0) {
      e.preventDefault()
      removeTag(tags[tags.length - 1])
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      // Commit any pending text in the input as a final tag before saving.
      const pending = normalizeTag(input)
      const final =
        pending && !tags.includes(pending) ? [...tags, pending] : tags
      await updateBookTags(book.id, final)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit tags"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={dialogRef}
        className="w-[min(480px,92vw)] bg-popover border border-border rounded-xl shadow-2xl animate-pop-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <TagIcon className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Edit tags</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5 truncate">
              {book.title}
            </p>

            {/* Active chips + inline input */}
            <div
              onClick={() => inputRef.current?.focus()}
              className="flex flex-wrap items-center gap-1.5 min-h-[40px] px-2 py-1.5 bg-secondary/40 border border-border rounded-lg focus-within:ring-1 focus-within:ring-primary/30 focus-within:border-primary/50 transition-colors cursor-text"
            >
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary"
                >
                  {tag}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTag(tag)
                    }}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                    title={`Remove ${tag}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tags.length === 0 ? 'Type a tag and press Enter…' : 'Add another…'}
                className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* Suggestions from existing library tags */}
          {suggestions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Suggestions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map(({ tag, count }) => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                      'border-border bg-secondary/40 text-foreground/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30'
                    )}
                    title={`${count} ${count === 1 ? 'book' : 'books'} tagged ${tag}`}
                  >
                    <Plus className="w-2.5 h-2.5" />
                    {tag}
                    <span className="text-muted-foreground/70">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-sidebar/40 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Save tags
          </button>
        </div>
      </div>
    </div>
  )
}
