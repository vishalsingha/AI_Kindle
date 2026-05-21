// Highlight alphas are kept modest on purpose. The layer uses
// `mix-blend-mode: multiply`, which tints *every* underlying pixel by the
// highlight color — including the near-black (but not pure black) glyphs
// that most PDFs use. Too high an alpha tints the text noticeably,
// making it read as dull/muddy. ~0.24 gives a clearly visible highlight
// on the white page background while leaving the text almost untouched.
export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#FBBF24', bg: 'rgba(255, 192, 33, 0.24)' },
  { name: 'Green', value: '#34D399', bg: 'rgba(52, 211, 153, 0.24)' },
  { name: 'Blue', value: '#60A5FA', bg: 'rgba(96, 165, 250, 0.24)' },
  { name: 'Pink', value: '#F472B6', bg: 'rgba(244, 114, 182, 0.24)' },
  { name: 'Orange', value: '#FB923C', bg: 'rgba(251, 146, 60, 0.24)' }
] as const

export const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLORS[0].value

export function getHighlightBg(color: string): string {
  const found = HIGHLIGHT_COLORS.find(c => c.value === color)
  // `color + 3D` ≈ 24% alpha in hex — matches the presets above for
  // any custom color the user might set.
  return found?.bg ?? `${color}3D`
}
