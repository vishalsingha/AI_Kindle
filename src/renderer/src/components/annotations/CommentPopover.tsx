import { useState } from 'react'
import { Trash2, Check, X } from 'lucide-react'
import { useAnnotationStore, type Annotation } from '@/stores/annotation-store'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface CommentPopoverProps {
  annotation: Annotation
  onClose: () => void
}

export function CommentPopover({ annotation, onClose }: CommentPopoverProps) {
  const { updateAnnotation, removeAnnotation } = useAnnotationStore()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(annotation.content)

  const handleSave = async () => {
    await updateAnnotation(annotation.id, { content: text })
    setEditing(false)
  }

  const handleDelete = async () => {
    await removeAnnotation(annotation.id)
    onClose()
  }

  return (
    <div className="bg-popover border border-border rounded-xl shadow-xl p-3 w-72 animate-pop-in">
      {/* Selected text preview */}
      {annotation.selectedText && (
        <div className="mb-2 p-2 bg-secondary/60 rounded-lg">
          <p className="text-xs text-muted-foreground italic line-clamp-3">
            "{annotation.selectedText}"
          </p>
        </div>
      )}

      {/* Comment content */}
      {editing ? (
        <div>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-20 p-2 bg-secondary/60 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <div className="flex justify-end gap-1.5 mt-2">
            <button
              onClick={() => { setText(annotation.content); setEditing(false) }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleSave}
              className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div>
          {annotation.content && (
            <p
              className="text-sm cursor-pointer hover:bg-secondary/60 rounded p-1 -m-1 transition-colors"
              onClick={() => setEditing(true)}
            >
              {annotation.content}
            </p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <span className="text-[10px] text-muted-foreground">
          {formatDate(annotation.createdAt)}
        </span>
        <button
          onClick={handleDelete}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete annotation"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
