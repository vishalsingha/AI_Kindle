import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, X } from 'lucide-react'
import { cn, truncate } from '@/lib/utils'

export type ImportDecision =
  | { action: 'skip' }
  | { action: 'import'; title?: string }

export type ImportConflict =
  | {
      kind: 'duplicate-hash'
      filename: string
      existingTitle: string
      suggestedTitle: string
    }
  | {
      kind: 'duplicate-name'
      filename: string
      suggestedTitle: string
      takenTitle: string
    }

interface Props {
  conflict: ImportConflict
  progress: { current: number; total: number }
  onDecide: (decision: ImportDecision) => void
}

export function ImportDialog({ conflict, progress, onDecide }: Props) {
  const [title, setTitle] = useState<string>(
    conflict.kind === 'duplicate-hash'
      ? `copy_of_${conflict.suggestedTitle}`
      : `copy_of_${conflict.suggestedTitle}`
  )

  // Reset title when the dialog swaps to a new conflict.
  useEffect(() => {
    setTitle(`copy_of_${conflict.suggestedTitle}`)
  }, [conflict])

  const importWithTitle = (): void => onDecide({ action: 'import', title: title.trim() || conflict.suggestedTitle })
  const importAsIs = (): void => onDecide({ action: 'import' })
  const skip = (): void => onDecide({ action: 'skip' })

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={skip}
    >
      <div
        className="bg-popover border border-border rounded-2xl shadow-2xl w-[440px] max-w-[90vw] animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-border">
          <div className={cn(
            'shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
            conflict.kind === 'duplicate-hash'
              ? 'bg-amber-500/15 text-amber-600'
              : 'bg-primary/15 text-primary'
          )}>
            {conflict.kind === 'duplicate-hash'
              ? <AlertTriangle className="w-5 h-5" />
              : <FileText className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">
              {conflict.kind === 'duplicate-hash'
                ? 'This PDF is already in your library'
                : 'A book with this title already exists'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {conflict.kind === 'duplicate-hash'
                ? <>The content of <span className="font-medium text-foreground">{truncate(conflict.filename, 40)}</span> matches the existing book <span className="font-medium text-foreground">"{truncate(conflict.existingTitle, 40)}"</span>.</>
                : <>The title <span className="font-medium text-foreground">"{truncate(conflict.takenTitle, 40)}"</span> is used by another book in your library.</>}
            </p>
          </div>
          <button
            onClick={skip}
            className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Title for the new book
          </label>
          <input
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') importWithTitle()
              if (e.key === 'Escape') skip()
            }}
            className="w-full px-3 py-2 bg-secondary/60 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
          <p className="text-[11px] text-muted-foreground">
            {progress.total > 1 && (
              <span className="mr-2 inline-block px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                {progress.current}/{progress.total}
              </span>
            )}
            Press Enter to import, Esc to skip.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={skip}
            className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Skip
          </button>
          {conflict.kind === 'duplicate-hash' && (
            <button
              onClick={importAsIs}
              className="px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Keep original name
            </button>
          )}
          <button
            onClick={importWithTitle}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
