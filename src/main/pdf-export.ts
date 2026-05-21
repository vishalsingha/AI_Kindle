import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { PDFDocument, rgb, StandardFonts, BlendMode, type PDFPage } from 'pdf-lib'
import { getAnnotations, getBooks } from './database'

// ─── Annotation shape (matches what the renderer/store sends) ────────
interface Annotation {
  id: string
  bookId: string
  type: 'highlight' | 'comment' | 'text_note' | 'underline'
  page: number
  content: string
  selectedText: string
  color: string
  rects: Array<{ x: number; y: number; width: number; height: number }>
  createdAt: string
}

// ─── Color helpers ───────────────────────────────────────────────────
/**
 * Parse a `#rrggbb` / `#rgb` hex color into a normalized [0..1] RGB triple.
 * Falls back to a sensible yellow when the input is malformed so we never
 * abort an export over a bad value in the DB.
 */
function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = (hex || '').trim().replace(/^#/, '')
  if (h.length === 3) {
    h = h.split('').map((c) => c + c).join('')
  }
  if (!/^[0-9a-f]{6}$/i.test(h)) {
    return { r: 0.98, g: 0.75, b: 0.14 } // amber-400-ish
  }
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255
  }
}

/**
 * Convert one normalized annotation rect (top-left origin, [0..1]) into
 * PDF user-space coordinates (bottom-left origin) for the supplied page.
 */
function normalizedRectToPdf(
  rect: { x: number; y: number; width: number; height: number },
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  const x = rect.x * pageWidth
  const width = rect.width * pageWidth
  const height = rect.height * pageHeight
  // Annotation y is measured from the top, but PDF y grows upward from
  // the bottom, so flip the origin and account for the box height.
  const y = pageHeight - (rect.y + rect.height) * pageHeight
  return { x, y, width, height }
}

// ─── Drawing primitives ───────────────────────────────────────────────
function drawHighlight(
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  color: { r: number; g: number; b: number }
): void {
  // `Multiply` blend mode keeps glyph pixels readable: the highlight
  // tint multiplies with the (white) page background but barely changes
  // the (near-black) text — visually identical to a real highlighter.
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: rgb(color.r, color.g, color.b),
    opacity: 0.4,
    blendMode: BlendMode.Multiply,
    borderWidth: 0
  })
}

function drawUnderline(
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  color: { r: number; g: number; b: number }
): void {
  // 1.2pt rule sitting at the baseline of the rect (which is `rect.y`
  // in PDF coords because we flipped origin in normalizedRectToPdf).
  page.drawLine({
    start: { x: rect.x, y: rect.y + 1 },
    end: { x: rect.x + rect.width, y: rect.y + 1 },
    thickness: 1.2,
    color: rgb(color.r, color.g, color.b),
    opacity: 0.95
  })
}

/**
 * Draw a small numbered "sticky note" pin at the annotation anchor. The
 * full comment text goes into the appended notes section, indexed by the
 * same number — this keeps the page clean while still being scannable.
 */
function drawCommentMarker(
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  color: { r: number; g: number; b: number },
  index: number,
  font: import('pdf-lib').PDFFont
): void {
  const size = 12
  // Anchor in the top-left of the rect (slightly inset). We use the top
  // edge in PDF coordinates: rect.y + rect.height.
  const cx = rect.x + 1
  const cy = rect.y + rect.height - size + 1
  page.drawRectangle({
    x: cx,
    y: cy,
    width: size,
    height: size,
    color: rgb(color.r, color.g, color.b),
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.4,
    opacity: 0.95
  })
  const label = String(index)
  const fontSize = 8
  const labelWidth = font.widthOfTextAtSize(label, fontSize)
  page.drawText(label, {
    x: cx + (size - labelWidth) / 2,
    y: cy + (size - fontSize) / 2 + 1,
    size: fontSize,
    font,
    color: rgb(0, 0, 0)
  })
}

// ─── Notes appendix ───────────────────────────────────────────────────
/**
 * Wrap arbitrary text into an array of lines whose rendered width never
 * exceeds `maxWidth`. We measure with the supplied font so the output
 * lines up perfectly when drawn, and we hard-break absurdly long
 * "words" (URLs, base64) so they can't overflow the page.
 */
function wrapText(
  text: string,
  font: import('pdf-lib').PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n')
  const lines: string[] = []
  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('')
      continue
    }
    const words = para.split(/\s+/)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      // The single token itself doesn't fit — chop it up by character.
      if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          const next = chunk + ch
          if (font.widthOfTextAtSize(next, fontSize) > maxWidth) {
            lines.push(chunk)
            chunk = ch
          } else {
            chunk = next
          }
        }
        line = chunk
      } else {
        line = word
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

interface NoteEntry {
  index: number
  page: number
  type: Annotation['type']
  selectedText: string
  content: string
}

function drawNotesAppendix(
  pdf: PDFDocument,
  notes: NoteEntry[],
  fonts: { regular: import('pdf-lib').PDFFont; bold: import('pdf-lib').PDFFont; italic: import('pdf-lib').PDFFont }
): void {
  if (notes.length === 0) return

  const margin = 56 // ~0.78"
  // Fall back to US Letter if the source PDF has no pages (we always
  // create at least one notes page either way).
  const firstSourcePage = pdf.getPageCount() > 0 ? pdf.getPage(0) : null
  const baseWidth = firstSourcePage ? firstSourcePage.getWidth() : 612
  const baseHeight = firstSourcePage ? firstSourcePage.getHeight() : 792
  const contentWidth = baseWidth - margin * 2

  let page = pdf.addPage([baseWidth, baseHeight])
  let y = baseHeight - margin

  // Title
  const titleSize = 16
  page.drawText('Annotations', {
    x: margin,
    y: y - titleSize,
    size: titleSize,
    font: fonts.bold,
    color: rgb(0.1, 0.1, 0.1)
  })
  y -= titleSize + 18

  const bodySize = 10
  const lineHeight = bodySize * 1.45

  const moveDown = (delta: number): void => {
    y -= delta
    if (y < margin + lineHeight) {
      page = pdf.addPage([baseWidth, baseHeight])
      y = baseHeight - margin
    }
  }

  for (const note of notes) {
    // Header line: "[N] · Page P · type"
    const header = `[${note.index}]  Page ${note.page}  ·  ${humanType(note.type)}`
    page.drawText(header, {
      x: margin,
      y: y - bodySize,
      size: bodySize,
      font: fonts.bold,
      color: rgb(0.15, 0.15, 0.15)
    })
    moveDown(lineHeight)

    if (note.selectedText) {
      const quoted = `"${note.selectedText.trim()}"`
      const lines = wrapText(quoted, fonts.italic, bodySize, contentWidth)
      for (const line of lines) {
        page.drawText(line, {
          x: margin,
          y: y - bodySize,
          size: bodySize,
          font: fonts.italic,
          color: rgb(0.35, 0.35, 0.35)
        })
        moveDown(lineHeight)
      }
    }

    if (note.content) {
      const lines = wrapText(note.content.trim(), fonts.regular, bodySize, contentWidth)
      for (const line of lines) {
        page.drawText(line, {
          x: margin,
          y: y - bodySize,
          size: bodySize,
          font: fonts.regular,
          color: rgb(0.1, 0.1, 0.1)
        })
        moveDown(lineHeight)
      }
    }

    // Spacer between entries
    moveDown(lineHeight * 0.6)
  }
}

function humanType(t: Annotation['type']): string {
  switch (t) {
    case 'highlight': return 'Highlight'
    case 'underline': return 'Underline'
    case 'comment': return 'Comment'
    case 'text_note': return 'Note'
    default: return 'Annotation'
  }
}

// ─── Main entry point ────────────────────────────────────────────────
async function exportAnnotatedPDF(
  win: BrowserWindow,
  bookId: string
): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }> {
  const book = (getBooks() as any[]).find((b) => b.id === bookId)
  if (!book) return { ok: false, error: 'Book not found.' }
  if (!existsSync(book.filepath)) {
    return { ok: false, error: `Source PDF is missing on disk: ${book.filepath}` }
  }

  const annotations = getAnnotations(bookId) as Annotation[]
  if (annotations.length === 0) {
    return { ok: false, error: 'This book has no annotations to export.' }
  }

  // Read the original PDF and load it with pdf-lib. `ignoreEncryption`
  // lets us still annotate viewer-only encrypted PDFs (we only add
  // overlays; we don't try to crack the contents).
  let pdf: PDFDocument
  try {
    const bytes = await readFile(book.filepath)
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read source PDF: ${(err as Error)?.message ?? err}`
    }
  }

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique)
  }

  // Sort once so the appendix index matches reading order.
  const sorted = [...annotations].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const notes: NoteEntry[] = []
  const totalPages = pdf.getPageCount()

  sorted.forEach((annotation, i) => {
    // 1-indexed page in the DB, 0-indexed in pdf-lib.
    const pageIdx = annotation.page - 1
    if (pageIdx < 0 || pageIdx >= totalPages) {
      // Page got rotated out of existence (e.g. if the file was replaced
      // with a shorter version after annotating). Skip but still surface
      // the note in the appendix so nothing is lost.
      notes.push({
        index: i + 1,
        page: annotation.page,
        type: annotation.type,
        selectedText: annotation.selectedText,
        content: annotation.content
      })
      return
    }

    const page = pdf.getPage(pageIdx)
    const { width: pw, height: ph } = page.getSize()
    const color = parseHex(annotation.color)
    const rects = (annotation.rects || []).map((r) => normalizedRectToPdf(r, pw, ph))

    if (annotation.type === 'highlight') {
      for (const r of rects) drawHighlight(page, r, color)
    } else if (annotation.type === 'underline') {
      for (const r of rects) drawUnderline(page, r, color)
    } else if (annotation.type === 'comment' || annotation.type === 'text_note') {
      const target = rects[0]
      if (target) drawCommentMarker(page, target, color, i + 1, fonts.bold)
    }

    // Always log to the appendix when there's any content / quoted text.
    if (annotation.content?.trim() || annotation.selectedText?.trim()) {
      notes.push({
        index: i + 1,
        page: annotation.page,
        type: annotation.type,
        selectedText: annotation.selectedText,
        content: annotation.content
      })
    }
  })

  drawNotesAppendix(pdf, notes, fonts)

  // Default filename: "<title> (annotated).pdf", with characters that are
  // illegal on the major platforms scrubbed out.
  const safeTitle = (book.title || 'document')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim() || 'document'
  const defaultName = `${safeTitle} (annotated).pdf`

  const result = await dialog.showSaveDialog(win, {
    title: 'Save Annotated PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true }
  }

  try {
    const out = await pdf.save({ useObjectStreams: true })
    await writeFile(result.filePath, Buffer.from(out))
    return { ok: true, path: result.filePath }
  } catch (err) {
    return {
      ok: false,
      error: `Failed to write PDF: ${(err as Error)?.message ?? err}`
    }
  }
}

export function registerPDFExportHandlers(): void {
  ipcMain.handle('pdf:export-annotated', async (event, bookId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: false, error: 'No window found' }
    return exportAnnotatedPDF(win, bookId)
  })
}
