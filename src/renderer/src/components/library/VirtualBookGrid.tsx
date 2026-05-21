import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Book } from '@/stores/library-store'
import { BookCard } from './BookCard'

interface Props {
  books: Book[]
  orderedIds: string[]
}

// Match the Tailwind breakpoints used by the non-virtualized grid so the
// layout transitions smoothly. Pairs of [minWidthPx, columnCount].
const BREAKPOINTS: Array<[number, number]> = [
  [1280, 6], // xl
  [1024, 5], // lg
  [768, 4],  // md
  [640, 3],  // sm
  [0, 2]
]

// Cards have an aspect-[3/4] thumbnail plus a ~56px info block. The row
// height also needs to account for the gap. These numbers mirror the
// `gap-4` + aspect-[3/4] + 3-line info footer of the unvirtualized grid.
const GRID_GAP = 16
const CARD_INFO_HEIGHT = 64

function columnsFor(width: number): number {
  for (const [min, cols] of BREAKPOINTS) {
    if (width >= min) return cols
  }
  return 2
}

/**
 * Virtualized row-based grid. Only rows in the viewport are rendered, so the
 * cost of the library view no longer scales with the number of books. Card
 * dimensions are computed from the container width to match the original
 * responsive `grid-cols-*` layout.
 */
export function VirtualBookGrid({ books, orderedIds }: Props): JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  // Track container width so we can recompute columns on resize.
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    setContainerWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const columns = containerWidth > 0 ? columnsFor(containerWidth) : 4
  const innerWidth = Math.max(0, containerWidth)
  const cardWidth = columns > 0
    ? Math.floor((innerWidth - GRID_GAP * (columns - 1)) / columns)
    : 0
  const thumbHeight = Math.floor(cardWidth * (4 / 3))
  const cardHeight = thumbHeight + CARD_INFO_HEIGHT
  const rowHeight = cardHeight + GRID_GAP

  const rowCount = Math.max(1, Math.ceil(books.length / columns))

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3
  })

  // Force the virtualizer to remeasure when the row height changes (e.g. on
  // window resize).
  useEffect(() => {
    rowVirtualizer.measure()
  }, [rowHeight, rowVirtualizer])

  const renderRow = useCallback((rowIndex: number) => {
    const start = rowIndex * columns
    const end = Math.min(start + columns, books.length)
    const slots = []
    for (let col = 0; col < columns; col++) {
      const i = start + col
      const book = books[i]
      if (!book) {
        // Empty filler cell keeps the last row's remaining columns aligned.
        slots.push(<div key={`empty-${col}`} />)
      } else {
        slots.push(
          <BookCard key={book.id} book={book} viewMode="grid" orderedIds={orderedIds} />
        )
      }
    }
    return slots
  }, [books, columns, orderedIds])

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto p-6"
      style={{ contain: 'strict' as any }}
    >
      {containerWidth > 0 && books.length > 0 && (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              className="absolute left-0 right-0"
              style={{
                top: 0,
                transform: `translateY(${virtualRow.start}px)`,
                height: `${rowHeight}px`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: `${GRID_GAP}px`,
                alignItems: 'start'
              }}
            >
              {renderRow(virtualRow.index)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
