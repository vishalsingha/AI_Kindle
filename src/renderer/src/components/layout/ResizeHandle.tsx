import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  /** Current width of the panel being resized (in px). */
  width: number
  /** Called with the new width while dragging (already clamped). */
  onResize: (next: number) => void
  /** Called on double-click to reset to a default. Optional. */
  onReset?: () => void
  /** Whether the panel lives on the right (handle on left edge, drag-left widens). */
  side: 'right' | 'left'
  min: number
  max: number
}

/**
 * Vertical drag handle for resizing a side panel.
 *
 * - Pointer events so it works with mouse + trackpad + touch
 * - Captures the pointer so dragging outside the 1px strip still works
 * - Applies `user-select: none` + the `col-resize` cursor to <body> during
 *   a drag so text selection in the document doesn't flash on-drag
 * - Double-click reset to default width
 * - Keyboard a11y: arrow keys nudge the panel ±16px (shift = ±64)
 */
export function ResizeHandle({ width, onResize, onReset, side, min, max }: Props): JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)
  const startWRef = useRef(0)

  const apply = useCallback(
    (px: number) => {
      const clamped = Math.max(min, Math.min(max, px))
      onResize(clamped)
    },
    [min, max, onResize]
  )

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startXRef.current = e.clientX
    startWRef.current = width
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!dragging) return
    const dx = e.clientX - startXRef.current
    // Panel on the right: dragging LEFT (negative dx) should increase width.
    const delta = side === 'right' ? -dx : dx
    apply(startWRef.current + delta)
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    if (!dragging) return
    setDragging(false)
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  // While dragging, lock the cursor and block text selection across the app
  // so the user doesn't accidentally select PDF text at the edge of the drag.
  useEffect(() => {
    if (!dragging) return
    const prevCursor = document.body.style.cursor
    const prevSelect = document.body.style.userSelect
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevSelect
    }
  }, [dragging])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 64 : 16
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      apply(width + (side === 'right' ? step : -step))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      apply(width + (side === 'right' ? -step : step))
    } else if (e.key === 'Home') {
      e.preventDefault()
      apply(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      apply(max)
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      title="Drag to resize · Double-click to reset"
      className={cn(
        'group relative w-1 shrink-0 cursor-col-resize select-none',
        'hover:bg-primary/30 focus:bg-primary/40 focus:outline-none transition-colors',
        dragging && 'bg-primary/50'
      )}
    >
      {/* Wider invisible hit area so the 1px strip is easier to grab. */}
      <div
        className={cn(
          'absolute inset-y-0 -mx-2',
          side === 'right' ? 'right-0' : 'left-0',
          'w-5'
        )}
      />
      {/* Visible grip indicator on hover. */}
      <div
        className={cn(
          'absolute top-1/2 -translate-y-1/2 h-10 w-0.5 rounded-full bg-primary/0 group-hover:bg-primary/60 transition-colors',
          side === 'right' ? 'right-[1px]' : 'left-[1px]',
          dragging && 'bg-primary/80'
        )}
      />
    </div>
  )
}
