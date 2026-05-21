import { useState } from 'react'
import { Check, X, Trash2 } from 'lucide-react'
import { useAnnotationStore, type Annotation } from '@/stores/annotation-store'
import { cn } from '@/lib/utils'

interface TextNoteInlineProps {
  annotation: Annotation
}

export function TextNoteInline({ annotation }: TextNoteInlineProps) {
  const { updateAnnotation, removeAnnotation } = useAnnotationStore()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(annotation.content)

  const handleSave = async () => {
    await updateAnnotation(annotation.id, { content: text })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="bg-transparent text-xs border-none outline-none w-40"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') { setText(annotation.content); setEditing(false) }
          }}
        />
        <button onClick={handleSave} className="text-blue-500 hover:text-blue-700">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={() => { setText(annotation.content); setEditing(false) }} className="text-muted-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 text-xs cursor-pointer',
        'hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors group'
      )}
      onClick={() => setEditing(true)}
    >
      📝 {annotation.content}
      <button
        onClick={(e) => { e.stopPropagation(); removeAnnotation(annotation.id) }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
      >
        <Trash2 className="w-2.5 h-2.5" />
      </button>
    </span>
  )
}
