/**
 * Normalize LaTeX delimiter variants to the `$…$` / `$$…$$` form that
 * remark-math understands. The chat system prompt asks the model to use
 * only `$`, but older history turns and occasional drift use `\(…\)` /
 * `\[…\]` — converting here means those render correctly too.
 *
 * This also runs on content pasted into the long-form notes editor so a
 * snippet copied out of any other app (which likely uses `\(` / `\[`) is
 * typeset properly in the preview without the user having to hand-edit.
 *
 * Content inside fenced code blocks and inline backticks is left verbatim
 * so a Markdown cheat-sheet ABOUT LaTeX delimiters still renders as prose
 * rather than being typeset as math.
 */
export function normalizeMathDelimiters(md: string): string {
  const parts: string[] = []
  let i = 0
  while (i < md.length) {
    // Skip fenced code blocks verbatim.
    if (md.startsWith('```', i)) {
      const end = md.indexOf('```', i + 3)
      const stop = end === -1 ? md.length : end + 3
      parts.push(md.slice(i, stop))
      i = stop
      continue
    }
    // Skip inline code spans verbatim.
    if (md[i] === '`') {
      const end = md.indexOf('`', i + 1)
      const stop = end === -1 ? md.length : end + 1
      parts.push(md.slice(i, stop))
      i = stop
      continue
    }
    // Find the next code boundary so we can operate on the prose chunk.
    const nextTick = md.indexOf('`', i)
    const nextFence = md.indexOf('```', i)
    const bound =
      nextFence === -1 && nextTick === -1
        ? md.length
        : Math.min(
            nextFence === -1 ? Number.POSITIVE_INFINITY : nextFence,
            nextTick === -1 ? Number.POSITIVE_INFINITY : nextTick
          )
    const chunk = md.slice(i, bound)
    parts.push(
      chunk
        .replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => `\n$$${inner}$$\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner) => `$${inner}$`)
    )
    i = bound
  }
  return parts.join('')
}
