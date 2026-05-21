export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Merge overlapping or adjacent rectangles that share the same visual line.
 * This fixes the "multi-line highlights have darker middle lines" problem
 * caused by getClientRects() returning 2+ overlapping rects per line
 * (e.g. ascender/descender boundaries).
 *
 * Algorithm:
 *   1. Sort rects top-to-bottom
 *   2. Group rects whose vertical centers are within a small threshold
 *   3. For each group, compute the union bounding box
 */
export function mergeLineRects(rects: Rect[], lineThreshold = 0.008): Rect[] {
  if (rects.length <= 1) return rects

  // Sort by vertical center
  const sorted = [...rects].sort(
    (a, b) => a.y + a.height / 2 - (b.y + b.height / 2)
  )

  const lines: Rect[][] = []
  for (const rect of sorted) {
    const center = rect.y + rect.height / 2
    let placed = false
    for (const line of lines) {
      const lineCenter =
        line.reduce((sum, r) => sum + r.y + r.height / 2, 0) / line.length
      if (Math.abs(center - lineCenter) < lineThreshold) {
        line.push(rect)
        placed = true
        break
      }
    }
    if (!placed) lines.push([rect])
  }

  return lines.map(line => {
    const left = Math.min(...line.map(r => r.x))
    const top = Math.min(...line.map(r => r.y))
    const right = Math.max(...line.map(r => r.x + r.width))
    const bottom = Math.max(...line.map(r => r.y + r.height))
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    }
  })
}

/** Union bounding box of an array of rects. Returns `null` for empty input. */
export function boundingBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let left = rects[0].x
  let top = rects[0].y
  let right = rects[0].x + rects[0].width
  let bottom = rects[0].y + rects[0].height
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i]
    if (r.x < left) left = r.x
    if (r.y < top) top = r.y
    if (r.x + r.width > right) right = r.x + r.width
    if (r.y + r.height > bottom) bottom = r.y + r.height
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Intersection-over-union of two rectangles (0–1). Useful for detecting
 * that a new selection effectively covers the same region as an existing
 * highlight even when the rect coordinates differ by a few sub-pixels.
 */
export function iou(a: Rect, b: Rect): number {
  const ix = Math.max(a.x, b.x)
  const iy = Math.max(a.y, b.y)
  const iright = Math.min(a.x + a.width, b.x + b.width)
  const ibottom = Math.min(a.y + a.height, b.y + b.height)
  const iw = Math.max(0, iright - ix)
  const ih = Math.max(0, ibottom - iy)
  const inter = iw * ih
  if (inter === 0) return 0
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}
