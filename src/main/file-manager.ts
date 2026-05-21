import { app, dialog, shell, ipcMain } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { readFile, writeFile, copyFile, mkdir, unlink, readdir, stat, rename } from 'fs/promises'
import { join, basename, extname } from 'path'
import { existsSync } from 'fs'
import { addBook, getBooks, deleteBookFromDB, findBooksByHash, findBooksByTitle } from './database'

let libraryDir: string
let thumbnailDir: string

export function getLibraryDir(): string {
  if (!libraryDir) {
    libraryDir = join(app.getPath('userData'), 'library')
  }
  return libraryDir
}

export function getThumbnailDir(): string {
  if (!thumbnailDir) {
    thumbnailDir = join(app.getPath('userData'), 'thumbnails')
  }
  return thumbnailDir
}

export async function ensureLibraryDir(): Promise<void> {
  const dir = getLibraryDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  const tdir = getThumbnailDir()
  if (!existsSync(tdir)) {
    await mkdir(tdir, { recursive: true })
  }
}

async function hashFile(filePath: string): Promise<string> {
  const buffer = await readFile(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

type InspectResult = {
  filePath: string
  filename: string
  suggestedTitle: string
  hash: string
  duplicateByHash: any | null
  duplicateByTitle: any | null
}

async function inspectFile(filePath: string): Promise<InspectResult> {
  const hash = await hashFile(filePath)
  const filename = basename(filePath)
  const suggestedTitle = filename.replace(/\.pdf$/i, '')
  const byHash = findBooksByHash(hash)
  const byTitle = findBooksByTitle(suggestedTitle)
  return {
    filePath,
    filename,
    suggestedTitle,
    hash,
    duplicateByHash: byHash.length > 0 ? byHash[0] : null,
    duplicateByTitle: byTitle.length > 0 ? byTitle[0] : null
  }
}

type ImportOptions = { title?: string }

async function doImport(filePath: string, opts: ImportOptions = {}): Promise<any | null> {
  try {
    const hash = await hashFile(filePath)
    const filename = basename(filePath)
    const ext = extname(filePath) || '.pdf'
    // Use a unique id so multiple imports of the same content can coexist.
    const id = randomUUID().replace(/-/g, '').substring(0, 16)
    const destPath = join(getLibraryDir(), `${id}${ext}`)

    // Copy the source file atomically: copy to tmp, then rename into place.
    // If the app crashes mid-copy the library directory is never left with a
    // half-written target file.
    const tmpPath = destPath + '.tmp'
    await copyFile(filePath, tmpPath)
    try {
      await rename(tmpPath, destPath)
    } catch {
      await copyFile(tmpPath, destPath)
      try { await unlink(tmpPath) } catch { /* ignore */ }
    }

    const book = {
      id,
      hash,
      title: opts.title?.trim() || filename.replace(/\.pdf$/i, ''),
      author: '',
      filename,
      filepath: destPath,
      pageCount: 0,
      currentPage: 1,
      status: 'todo' as const,
      tags: [],
      dateAdded: new Date().toISOString(),
      lastRead: null
    }

    addBook(book)
    return book
  } catch (err) {
    console.error('Failed to import PDF:', filePath, err)
    return null
  }
}

// Present a native OS file picker and return file paths (no import yet).
async function pickPDFFiles(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  })
  if (result.canceled) return []
  return result.filePaths
}

async function pickFolderPDFs(): Promise<string[]> {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return []
  return scanFolderForPDFs(result.filePaths[0])
}

/**
 * Walk a directory tree and return absolute paths of every `.pdf` file
 * found beneath it. Hidden directories (`.git`, `.DS_Store` style) are
 * skipped to avoid sweeping in caches/git checkouts when the user drops
 * a parent folder onto the library.
 *
 * Bounded by `maxFiles` so a worst-case drop on `/` can't hang the UI
 * forever — we'll just import the first N PDFs we find.
 */
async function scanFolderForPDFs(folder: string, maxFiles = 5000): Promise<string[]> {
  const out: string[] = []

  const walk = async (dir: string): Promise<void> => {
    if (out.length >= maxFiles) return
    let entries: import('fs').Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      // Permission denied, broken symlink, etc. — skip silently.
      return
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return
      // Don't descend into hidden directories — common practice for
      // file pickers, and keeps `node_modules`/`.git` etc. out of the
      // import queue when users drop project folders.
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        out.push(full)
      }
    }
  }

  await walk(folder)
  return out
}

/**
 * Take a mixed list of paths (files and/or directories) and resolve them
 * down to a flat list of PDF file paths — used by the library
 * drag-and-drop handler. Files that aren't PDFs are dropped silently;
 * directories are walked recursively.
 */
async function resolveDroppedPaths(paths: string[]): Promise<string[]> {
  const out: string[] = []
  for (const p of paths) {
    try {
      const s = await stat(p)
      if (s.isDirectory()) {
        const found = await scanFolderForPDFs(p)
        out.push(...found)
      } else if (s.isFile() && p.toLowerCase().endsWith('.pdf')) {
        out.push(p)
      }
    } catch {
      // Path no longer exists / unreadable — skip. The renderer logs
      // the IPC error if it cares.
    }
  }
  // De-dupe while preserving the original order so duplicate-import
  // dialogs don't fire twice for the same file.
  const seen = new Set<string>()
  const unique: string[] = []
  for (const p of out) {
    if (!seen.has(p)) {
      seen.add(p)
      unique.push(p)
    }
  }
  return unique
}

async function deleteBook(id: string): Promise<void> {
  const books = getBooks()
  const book = books.find((b: any) => b.id === id)
  if (book && existsSync(book.filepath)) {
    try {
      await unlink(book.filepath)
    } catch {
      // ignore
    }
  }
  if (book?.hash) {
    // Only delete the thumbnail if NO other book is still using this hash.
    const others = findBooksByHash(book.hash).filter((b: any) => b.id !== id)
    if (others.length === 0) {
      const dir = getThumbnailDir()
      const candidates = [
        thumbFilename(book.hash),
        `${book.hash}.jpg`, // pre-v2 legacy
        `${book.hash}.png`  // pre-v2 legacy
      ]
      for (const name of candidates) {
        const thumbPath = join(dir, name)
        if (existsSync(thumbPath)) {
          try { await unlink(thumbPath) } catch { /* ignore */ }
        }
      }
    }
  }
  deleteBookFromDB(id)
}

// Bump when the thumbnail rendering pipeline changes in a way that makes
// previously-cached files look different from freshly-rendered ones, so
// existing libraries pick up the new look without a manual clear.
//   v1: full first page rendered to JPEG
//   v2: top-75% zoomed cover crop, 3:4 aspect
const THUMB_VERSION = 2
const LEGACY_THUMB_SUFFIXES = ['.jpg', '.png'] as const

function thumbFilename(hash: string): string {
  return `${hash}.v${THUMB_VERSION}.jpg`
}

function getThumbnailPath(hash: string): string | null {
  const dir = getThumbnailDir()
  const current = join(dir, thumbFilename(hash))
  if (existsSync(current)) return current
  return null
}

async function saveThumbnail(hash: string, data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data))
  const dir = getThumbnailDir()
  const path = join(dir, thumbFilename(hash))
  // Atomic write: tmp → rename so we never leave a half-written file.
  const tmpPath = path + '.tmp'
  await writeFile(tmpPath, buffer)
  try {
    await rename(tmpPath, path)
  } catch {
    await writeFile(path, buffer)
    try { await unlink(tmpPath) } catch { /* ignore */ }
  }
  // Clean up stale thumbnails from previous versions of the pipeline so
  // we don't double-store. Includes both the bare `{hash}.jpg` / `.png`
  // from pre-v2 and any older versioned file the user might still have.
  for (const suffix of LEGACY_THUMB_SUFFIXES) {
    const legacy = join(dir, `${hash}${suffix}`)
    if (legacy !== path && existsSync(legacy)) {
      try { await unlink(legacy) } catch { /* ignore */ }
    }
  }
  return path
}

async function readPDFFile(filepath: string): Promise<Uint8Array> {
  const buffer = await readFile(filepath)
  const arr = new Uint8Array(buffer.length)
  arr.set(buffer)
  return arr
}

async function getStorageUsage(): Promise<{ totalFiles: number; totalSize: number }> {
  const dir = getLibraryDir()
  if (!existsSync(dir)) return { totalFiles: 0, totalSize: 0 }
  const files = await readdir(dir)
  let totalSize = 0
  for (const file of files) {
    const s = await stat(join(dir, file))
    totalSize += s.size
  }
  return { totalFiles: files.length, totalSize }
}

export function registerFileHandlers(): void {
  ipcMain.handle('file:pick-pdfs', () => pickPDFFiles())
  ipcMain.handle('file:pick-folder-pdfs', () => pickFolderPDFs())
  ipcMain.handle('file:resolve-dropped', (_, paths: string[]) => resolveDroppedPaths(paths))
  ipcMain.handle('file:inspect', (_, filePath: string) => inspectFile(filePath))
  ipcMain.handle('file:import-one', async (_, filePath: string, opts?: ImportOptions) => {
    await ensureLibraryDir()
    return doImport(filePath, opts)
  })
  ipcMain.handle('file:list-books', () => getBooks())
  ipcMain.handle('file:delete-book', (_, id) => deleteBook(id))
  ipcMain.handle('file:read-pdf', (_, filepath) => readPDFFile(filepath))
  ipcMain.handle('file:reveal-in-finder', (_, filepath) => shell.showItemInFolder(filepath))
  ipcMain.handle('file:open-external', (_, url: string) => {
    // Only allow http/https/mailto to prevent weird file:// or custom-protocol abuse.
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
  })
  ipcMain.handle('file:storage-usage', () => getStorageUsage())
  ipcMain.handle('thumbnail:get-path', (_, hash) => getThumbnailPath(hash))
  ipcMain.handle('thumbnail:save', (_, hash, dataUrl) => saveThumbnail(hash, dataUrl))
}
