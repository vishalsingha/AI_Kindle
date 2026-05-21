import { useMemo } from 'react'
import { useAnnotationStore, type Annotation } from '@/stores/annotation-store'
import { getHighlightBg } from '@/lib/colors'
import { cn } from '@/lib/utils'
import { mergeLineRects } from '@/lib/rects'

interface HighlightLayerProps {
  annotations: Annotation[]
  pageNumber: number
}

export function HighlightLayer({ annotations, pageNumber }: HighlightLayerProps) {
  const { selectedAnnotation, setSelectedAnnotation } = useAnnotationStore()

  const highlights = useMemo(
    () =>
      annotations
        .filter(a => a.page === pageNumber && (a.type === 'highlight' || a.type === 'underline'))
        .map(a => ({ ...a, rects: mergeLineRects(a.rects) })),
    [annotations, pageNumber]
  )

  const comments = annotations.filter(
    a => a.page === pageNumber && (a.type === 'comment' || a.type === 'text_note')
  )

  if (highlights.length === 0 && comments.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {highlights.map(annotation =>
        annotation.rects.map((rect, i) => (
          <div
            key={`${annotation.id}-${i}`}
            className={cn(
              'absolute pointer-events-auto cursor-pointer transition-opacity',
              selectedAnnotation?.id === annotation.id && 'ring-1 ring-primary'
            )}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              backgroundColor: annotation.type === 'highlight' ? getHighlightBg(annotation.color) : 'transparent',
              borderBottom: annotation.type === 'underline' ? `2px solid ${annotation.color}` : 'none',
              // `darken` keeps each channel of the page as min(page, highlight).
              // Every highlight preset has channels well above typical PDF
              // glyph darkness (≤30), so text pixels end up unchanged while
              // the brighter white background gets painted in the highlight
              // hue — visually, the highlight sits *behind* the text instead
              // of tinting it the way `multiply` does.
              mixBlendMode: 'darken'
            }}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedAnnotation(
                selectedAnnotation?.id === annotation.id ? null : annotation
              )
            }}
            title={annotation.content || annotation.selectedText}
          />
        ))
      )}

      {/* Comment/note indicators */}
      {comments.map(annotation => {
        const rect = annotation.rects[0]
        if (!rect) return null
        return (
          <div
            key={annotation.id}
            className="absolute pointer-events-auto cursor-pointer z-20"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`
            }}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedAnnotation(
                selectedAnnotation?.id === annotation.id ? null : annotation
              )
            }}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md transition-transform hover:scale-110',
                annotation.type === 'comment'
                  ? 'bg-amber-400 text-amber-900'
                  : 'bg-blue-400 text-blue-900'
              )}
            >
              {annotation.type === 'comment' ? '💬' : '📝'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
