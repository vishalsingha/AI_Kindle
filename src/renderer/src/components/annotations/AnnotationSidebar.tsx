import { useEffect, useMemo, useState } from 'react'
import {
  Highlighter, MessageSquare, StickyNote, Trash2, Download, FileText,
  Check, Sparkles, X, Loader2
} from 'lucide-react'
import { useAnnotationStore, type Annotation } from '@/stores/annotation-store'
import { useReaderStore } from '@/stores/reader-store'
import { useAIStore } from '@/stores/ai-store'
import { cn, formatDate, truncate } from '@/lib/utils'
import { getHighlightBg } from '@/lib/colors'

export function AnnotationSidebar() {
  const { currentBook, setPage, aiPanelOpen, toggleAIPanel } = useReaderStore()
  const { annotations, loadAnnotations, removeAnnotation, selectedAnnotation, setSelectedAnnotation, exportAnnotations } = useAnnotationStore()
  const { generateFromAnnotations, isConfigured, selectedModel, isStreaming } = useAIStore()

  const [exporting, setExporting] = useState(false)
  // Multi-select state for "Generate from selection". Tracked locally to
  // the sidebar since it isn't needed elsewhere.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    if (currentBook) {
      loadAnnotations(currentBook.id)
    }
  }, [currentBook, loadAnnotations])

  // Reset multi-selection when the book changes so stale ids don't leak.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [currentBook?.id])

  const handleExport = async (): Promise<void> => {
    if (!currentBook) return
    setExporting(true)
    try {
      const markdown = await exportAnnotations(currentBook.id)
      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentBook.title}-annotations.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
    setExporting(false)
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = (): void => {
    setSelectedIds(new Set(annotations.map(a => a.id)))
  }

  const clearSelection = (): void => {
    setSelectedIds(new Set())
  }

  const handleAnnotationClick = (annotation: Annotation): void => {
    // In selection mode, clicking the row toggles instead of jumping.
    if (selectedIds.size > 0) {
      toggleSelect(annotation.id)
      return
    }
    setPage(annotation.page)
    setSelectedAnnotation(
      selectedAnnotation?.id === annotation.id ? null : annotation
    )
  }

  const handleGenerate = async (): Promise<void> => {
    const selected = annotations.filter(a => selectedIds.has(a.id))
    if (selected.length === 0) return
    if (!isConfigured) {
      alert('OpenAI API key is not configured. Open the AI panel and paste your key to enable generation.')
      return
    }
    if (!selectedModel) {
      alert('No model selected. Pick a model in the AI panel first.')
      return
    }

    setGenerating(true)
    // Make sure the AI panel is open so the user can see the stream.
    if (!aiPanelOpen) toggleAIPanel()

    try {
      await generateFromAnnotations(selected)
    } catch (err) {
      console.error('Generate failed:', err)
    } finally {
      setGenerating(false)
      // Leave the selection in place so the user can re-run if they want.
      // They can press Clear when done.
    }
  }

  const groupedByPage = annotations.reduce<Record<number, Annotation[]>>((acc, ann) => {
    if (!acc[ann.page]) acc[ann.page] = []
    acc[ann.page].push(ann)
    return acc
  }, {})

  const typeIcon = (type: string): JSX.Element => {
    switch (type) {
      case 'highlight': return <Highlighter className="w-3 h-3" />
      case 'comment':   return <MessageSquare className="w-3 h-3" />
      case 'text_note': return <StickyNote className="w-3 h-3" />
      default:          return <Highlighter className="w-3 h-3" />
    }
  }

  const hasSelection = selectedIds.size > 0
  const allSelected = annotations.length > 0 && selectedIds.size === annotations.length
  const canGenerate = hasSelection && isConfigured && !!selectedModel && !isStreaming && !generating

  // Memoize the sorted/grouped entries so React doesn't rebuild them on
  // every keystroke of the selection state.
  const pageGroups = useMemo(
    () => Object.entries(groupedByPage).sort(([a], [b]) => Number(a) - Number(b)),
    [groupedByPage]
  )

  if (annotations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
        <FileText className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm text-center">No annotations yet</p>
        <p className="text-xs text-center mt-1 opacity-60">
          Select text to highlight or add notes
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground font-medium">
          {hasSelection
            ? `${selectedIds.size} of ${annotations.length}`
            : `${annotations.length} ${annotations.length === 1 ? 'note' : 'notes'}`}
        </span>
        <div className="flex items-center gap-0.5">
          {hasSelection ? (
            <>
              <button
                onClick={allSelected ? clearSelection : selectAll}
                className="focus-ring px-1.5 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title={allSelected ? 'Deselect all' : 'Select all'}
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <button
                onClick={clearSelection}
                className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Clear selection (Esc)"
                aria-label="Clear annotation selection"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="focus-ring p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Export annotations as Markdown"
              aria-label="Export annotations as Markdown"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Generate-from-selection action bar */}
      {hasSelection && (
        <div className="px-3 py-2 border-b border-border bg-primary/5 animate-pop-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-[11px] font-medium text-foreground flex-1">
              Generate from {selectedIds.size} {selectedIds.size === 1 ? 'note' : 'notes'}
            </span>
            <button
              onClick={() => void handleGenerate()}
              disabled={!canGenerate}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                canGenerate
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-secondary text-muted-foreground cursor-not-allowed'
              )}
              title={
                !isConfigured
                  ? 'Add your OpenAI API key in the AI panel'
                  : !selectedModel
                    ? 'No model selected'
                    : 'Generate study notes from the selection'
              }
            >
              {generating || isStreaming
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />}
              Generate
            </button>
          </div>
          {!isConfigured && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Add your OpenAI API key in the AI panel to enable generation.
            </p>
          )}
          {isConfigured && !selectedModel && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Open the AI panel and pick a model first.
            </p>
          )}
        </div>
      )}

      {/* Annotations list */}
      <div className="flex-1 overflow-auto">
        {pageGroups.map(([page, pageAnnotations]) => (
          <div key={page}>
            <div className="sticky top-0 px-3 py-1.5 bg-sidebar/90 backdrop-blur-sm border-b border-border">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Page {page}
              </span>
            </div>

            {pageAnnotations.map(annotation => {
              const isChecked = selectedIds.has(annotation.id)
              return (
                <div
                  key={annotation.id}
                  onClick={() => handleAnnotationClick(annotation)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-secondary/60 transition-colors group cursor-pointer',
                    selectedAnnotation?.id === annotation.id && !hasSelection && 'bg-primary/5 border-l-2 border-l-primary',
                    isChecked && 'bg-primary/10'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {/* Selection checkbox — visible on hover, or always
                        when any other note is already selected. */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleSelect(annotation.id) }}
                      aria-pressed={isChecked}
                      title={isChecked ? 'Deselect' : 'Select'}
                      className={cn(
                        'mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center rounded border transition-all',
                        isChecked
                          ? 'bg-primary border-primary text-primary-foreground opacity-100'
                          : 'bg-background border-border opacity-0 group-hover:opacity-100 hover:border-primary/60',
                        hasSelection && !isChecked && 'opacity-100'
                      )}
                    >
                      {isChecked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                    </button>

                    <div
                      className="mt-0.5 p-1 rounded shrink-0"
                      style={{
                        backgroundColor: annotation.type === 'highlight'
                          ? getHighlightBg(annotation.color)
                          : undefined
                      }}
                    >
                      {typeIcon(annotation.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      {annotation.selectedText && (
                        <p className="text-xs italic text-muted-foreground line-clamp-2 mb-0.5">
                          "{truncate(annotation.selectedText, 80)}"
                        </p>
                      )}
                      {annotation.content && (
                        <p className="text-xs font-medium line-clamp-2">{annotation.content}</p>
                      )}
                      <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                        {formatDate(annotation.createdAt)}
                      </span>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); removeAnnotation(annotation.id) }}
                      className="focus-ring opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all shrink-0"
                      title="Delete annotation"
                      aria-label="Delete annotation"
                    >
                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
