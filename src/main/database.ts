import Database from 'better-sqlite3'
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'

let db: Database.Database

// ─── Portable filepath storage ────────────────────────────────────────────
//
// We store only the basename of each PDF in the DB and resolve it against
// the current user's library directory at read time. This makes the data
// directory portable across machines and operating systems:
//
//   • Mac: ~/Library/Application Support/ai-kindle/library/<id>.pdf
//   • Linux: ~/.config/ai-kindle/library/<id>.pdf
//   • Windows: %APPDATA%/ai-kindle/library/<id>.pdf
//
// As long as the user copies the library folder + db together, the same
// rows resolve to the right file on every device.

function libraryDirAbsolute(): string {
  return join(app.getPath('userData'), 'library')
}

function extractBasename(p: string): string {
  if (!p) return ''
  // Robust against both / and \ so that data created on Windows still
  // normalizes correctly when opened on macOS or Linux.
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

function toStoredFilepath(filepath: string): string {
  return extractBasename(filepath)
}

function toResolvedFilepath(stored: string): string {
  if (!stored) return ''
  // Self-healing: re-extract the basename on every read so a legacy
  // absolute path that escaped the one-time migration still resolves
  // to the current machine's library directory.
  return join(libraryDirAbsolute(), extractBasename(stored))
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'ai-kindle.db')
  db = new Database(dbPath)
  // Crash-safety + speed:
  //   WAL: writers don't block readers; atomic commits
  //   synchronous=NORMAL: fsync on checkpoint (safe) but not on every write
  //   busy_timeout: avoid "database is locked" errors during bursts
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')

  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      page_count INTEGER DEFAULT 0,
      current_page INTEGER DEFAULT 1,
      status TEXT DEFAULT 'todo',
      tags TEXT DEFAULT '[]',
      date_added TEXT NOT NULL,
      last_read TEXT
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      type TEXT NOT NULL,
      page INTEGER NOT NULL,
      content TEXT DEFAULT '',
      selected_text TEXT DEFAULT '',
      color TEXT DEFAULT '#FBBF24',
      rects TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT DEFAULT 'New Chat',
      created_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_notes (
      book_id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    -- Multi-note storage per book. \`book_notes\` (above) is the legacy
    -- single-note table; we migrate its non-empty rows into \`notes\` once
    -- on first start so users don't lose their writing.
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Untitled',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
  `)

  // Migration: add `status` column to existing books tables
  const cols = db.prepare("PRAGMA table_info(books)").all() as Array<{ name: string }>
  if (!cols.some(c => c.name === 'status')) {
    db.exec("ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'todo'")
  }

  // Migration: drop legacy UNIQUE constraint on books.hash so users can
  // intentionally re-import the same PDF as a separate entry.
  const hashIndexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='books'"
  ).all() as Array<{ name: string }>
  let hasUniqueHash = false
  for (const idx of hashIndexes) {
    const info = db.prepare(`PRAGMA index_info(${idx.name})`).all() as Array<{ name: string }>
    const idxList = db.prepare(`PRAGMA index_list(books)`).all() as Array<{ name: string; unique: number }>
    const meta = idxList.find(l => l.name === idx.name)
    if (meta?.unique && info.some(i => i.name === 'hash')) { hasUniqueHash = true; break }
  }
  if (hasUniqueHash) {
    // Recreate books table without UNIQUE(hash). SQLite needs this table rebuild.
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE books__new (
        id TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        title TEXT NOT NULL,
        author TEXT DEFAULT '',
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        page_count INTEGER DEFAULT 0,
        current_page INTEGER DEFAULT 1,
        status TEXT DEFAULT 'todo',
        tags TEXT DEFAULT '[]',
        date_added TEXT NOT NULL,
        last_read TEXT
      );
      INSERT INTO books__new SELECT id, hash, title, author, filename, filepath,
        page_count, current_page, status, tags, date_added, last_read FROM books;
      DROP TABLE books;
      ALTER TABLE books__new RENAME TO books;
      COMMIT;
    `)
  }

  // Performance indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_book ON conversations(book_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_books_hash ON books(hash);
    CREATE INDEX IF NOT EXISTS idx_books_last_read ON books(last_read);
    CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id);
  `)

  // One-time migration: collapse any absolute filepaths down to just the
  // basename so the DB becomes machine-portable. New imports already store
  // only the basename (see addBook), so this runs once per legacy install
  // and is a no-op thereafter.
  const absoluteRows = db
    .prepare("SELECT id, filepath FROM books WHERE filepath LIKE '%/%' OR filepath LIKE '%\\%'")
    .all() as Array<{ id: string; filepath: string }>
  if (absoluteRows.length > 0) {
    const updateStmt = db.prepare('UPDATE books SET filepath = ? WHERE id = ?')
    const tx = db.transaction(() => {
      for (const row of absoluteRows) {
        updateStmt.run(extractBasename(row.filepath), row.id)
      }
    })
    tx()
  }

  // One-time migration: if a book had a legacy single note in \`book_notes\`
  // and no rows yet in the new multi-note \`notes\` table, lift it over as
  // the first entry titled "Notes". Idempotent — won't run twice for the
  // same book because the WHERE NOT EXISTS guards repeats.
  const legacyRows = db.prepare(`
    SELECT bn.book_id, bn.content, bn.updated_at
    FROM book_notes bn
    WHERE length(trim(bn.content)) > 0
      AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.book_id = bn.book_id)
  `).all() as Array<{ book_id: string; content: string; updated_at: string }>
  if (legacyRows.length > 0) {
    const insert = db.prepare(`
      INSERT INTO notes (id, book_id, title, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const tx = db.transaction(() => {
      for (const row of legacyRows) {
        insert.run(
          randomUUID().substring(0, 16),
          row.book_id,
          'Notes',
          row.content,
          row.updated_at,
          row.updated_at
        )
      }
    })
    tx()
  }

  // Clean up any orphaned data left over from previous deletes where CASCADE
  // didn't fire. Without this, re-importing a previously deleted PDF would
  // inherit its old annotations.
  db.exec(`
    DELETE FROM messages
    WHERE conversation_id NOT IN (SELECT id FROM conversations);

    DELETE FROM conversations
    WHERE book_id NOT IN (SELECT id FROM books);

    DELETE FROM annotations
    WHERE book_id NOT IN (SELECT id FROM books);

    DELETE FROM book_notes
    WHERE book_id NOT IN (SELECT id FROM books);

    DELETE FROM notes
    WHERE book_id NOT IN (SELECT id FROM books);
  `)
}

export function getBookNote(bookId: string): string {
  const row = db.prepare('SELECT content FROM book_notes WHERE book_id = ?').get(bookId) as
    | { content: string }
    | undefined
  return row?.content ?? ''
}

export function saveBookNote(bookId: string, content: string): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO book_notes (book_id, content, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(book_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `).run(bookId, content, now)
}

// --- Multi-note storage --------------------------------------------------

interface NoteRow {
  id: string
  bookId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

function formatNote(row: any): NoteRow {
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function listNotes(bookId: string): NoteRow[] {
  return db
    .prepare('SELECT * FROM notes WHERE book_id = ? ORDER BY updated_at DESC')
    .all(bookId)
    .map(formatNote)
}

export function getNote(id: string): NoteRow | null {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as any
  return row ? formatNote(row) : null
}

export function createNote(bookId: string, title?: string): NoteRow {
  const id = randomUUID().substring(0, 16)
  const now = new Date().toISOString()
  const cleanTitle = (title?.trim() || 'Untitled').slice(0, 120)
  db.prepare(`
    INSERT INTO notes (id, book_id, title, content, created_at, updated_at)
    VALUES (?, ?, ?, '', ?, ?)
  `).run(id, bookId, cleanTitle, now, now)
  return { id, bookId, title: cleanTitle, content: '', createdAt: now, updatedAt: now }
}

export function updateNoteContent(id: string, content: string): NoteRow | null {
  const now = new Date().toISOString()
  db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?').run(content, now, id)
  return getNote(id)
}

export function renameNote(id: string, title: string): NoteRow | null {
  const now = new Date().toISOString()
  const clean = title.trim().slice(0, 120) || 'Untitled'
  db.prepare('UPDATE notes SET title = ?, updated_at = ? WHERE id = ?').run(clean, now, id)
  return getNote(id)
}

export function deleteNote(id: string): void {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function getBooks(): any[] {
  // Join with annotations to compute progress info (last-annotated page and
  // annotation count) for each book in a single query.
  const rows = db.prepare(`
    SELECT
      b.*,
      COALESCE((SELECT MAX(page) FROM annotations WHERE book_id = b.id), 0) AS last_annotation_page,
      COALESCE((SELECT COUNT(*) FROM annotations WHERE book_id = b.id), 0) AS annotation_count
    FROM books b
    ORDER BY b.date_added DESC
  `).all()
  return rows.map(formatBook)
}

export function addBook(book: any): any {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO books (id, hash, title, author, filename, filepath, page_count, current_page, status, tags, date_added, last_read)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  stmt.run(
    book.id,
    book.hash,
    book.title,
    book.author,
    book.filename,
    toStoredFilepath(book.filepath),
    book.pageCount,
    book.currentPage,
    book.status || 'todo',
    JSON.stringify(book.tags || []),
    book.dateAdded,
    book.lastRead || null
  )
  return book
}

export function updateBook(id: string, data: any): void {
  const fields: string[] = []
  const values: any[] = []

  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
  if (data.author !== undefined) { fields.push('author = ?'); values.push(data.author) }
  if (data.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(data.tags)) }
  if (data.currentPage !== undefined) { fields.push('current_page = ?'); values.push(data.currentPage) }
  if (data.pageCount !== undefined) { fields.push('page_count = ?'); values.push(data.pageCount) }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status) }
  if (data.lastRead !== undefined) { fields.push('last_read = ?'); values.push(data.lastRead) }

  if (fields.length === 0) return
  values.push(id)
  db.prepare(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function setBookStatus(id: string, status: 'todo' | 'done'): void {
  db.prepare('UPDATE books SET status = ?, last_read = ? WHERE id = ?').run(status, new Date().toISOString(), id)
}

export function markBookOpened(id: string): void {
  db.prepare('UPDATE books SET last_read = ? WHERE id = ?').run(new Date().toISOString(), id)
}

export function findBooksByHash(hash: string): any[] {
  const rows = db.prepare(`
    SELECT b.*,
      COALESCE((SELECT MAX(page) FROM annotations WHERE book_id = b.id), 0) AS last_annotation_page,
      COALESCE((SELECT COUNT(*) FROM annotations WHERE book_id = b.id), 0) AS annotation_count
    FROM books b WHERE hash = ?`).all(hash)
  return rows.map(formatBook)
}

export function findBooksByTitle(title: string): any[] {
  const rows = db.prepare(`
    SELECT b.*,
      COALESCE((SELECT MAX(page) FROM annotations WHERE book_id = b.id), 0) AS last_annotation_page,
      COALESCE((SELECT COUNT(*) FROM annotations WHERE book_id = b.id), 0) AS annotation_count
    FROM books b WHERE LOWER(title) = LOWER(?)`).all(title)
  return rows.map(formatBook)
}

export function deleteBookFromDB(id: string): void {
  // Explicit cleanup of EVERY piece of data tied to this book so a re-import
  // of the same file never inherits stale history. ON DELETE CASCADE is
  // declared in the schema but doesn't fire reliably depending on how the
  // tables were first created (pragma state, older installs, etc.), so we
  // issue an explicit DELETE for each dependent table inside a single
  // transaction.
  const tx = db.transaction((bookId: string) => {
    // Chat history
    db.prepare(`
      DELETE FROM messages
      WHERE conversation_id IN (SELECT id FROM conversations WHERE book_id = ?)
    `).run(bookId)
    db.prepare('DELETE FROM conversations WHERE book_id = ?').run(bookId)
    // Highlights, comments, inline text notes
    db.prepare('DELETE FROM annotations WHERE book_id = ?').run(bookId)
    // Long-form markdown note(s)
    db.prepare('DELETE FROM book_notes WHERE book_id = ?').run(bookId)
    db.prepare('DELETE FROM notes WHERE book_id = ?').run(bookId)
    // The book itself (also drops status + reading-progress)
    db.prepare('DELETE FROM books WHERE id = ?').run(bookId)
  })
  tx(id)
}

function formatBook(row: any): any {
  return {
    ...row,
    // Always resolve filepath against the current machine's library dir,
    // so the renderer (which expects absolute paths for the PDF viewer)
    // gets a working path regardless of where the DB originated.
    filepath: toResolvedFilepath(row.filepath),
    pageCount: row.page_count,
    currentPage: row.current_page,
    dateAdded: row.date_added,
    lastRead: row.last_read,
    status: row.status || 'todo',
    lastAnnotationPage: row.last_annotation_page ?? 0,
    annotationCount: row.annotation_count ?? 0,
    tags: JSON.parse(row.tags || '[]')
  }
}

export function getAnnotations(bookId: string): any[] {
  return db.prepare('SELECT * FROM annotations WHERE book_id = ? ORDER BY page ASC, created_at ASC').all(bookId).map(formatAnnotation)
}

export function saveAnnotation(annotation: any): any {
  const now = new Date().toISOString()
  const tx = db.transaction((ann: any) => {
    const existing = db.prepare('SELECT id FROM annotations WHERE id = ?').get(ann.id)
    if (existing) {
      db.prepare(`
        UPDATE annotations SET content = ?, selected_text = ?, color = ?, rects = ?, updated_at = ?
        WHERE id = ?
      `).run(ann.content, ann.selectedText, ann.color, JSON.stringify(ann.rects), now, ann.id)
    } else {
      const id = ann.id || randomUUID().substring(0, 16)
      db.prepare(`
        INSERT INTO annotations (id, book_id, type, page, content, selected_text, color, rects, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, ann.bookId, ann.type, ann.page, ann.content || '', ann.selectedText || '', ann.color, JSON.stringify(ann.rects || []), now, now)
      ann.id = id
      ann.createdAt = now
      ann.updatedAt = now
    }
  })
  tx(annotation)
  return annotation
}

export function deleteAnnotation(id: string): void {
  db.prepare('DELETE FROM annotations WHERE id = ?').run(id)
}

function formatAnnotation(row: any): any {
  return {
    id: row.id,
    bookId: row.book_id,
    type: row.type,
    page: row.page,
    content: row.content,
    selectedText: row.selected_text,
    color: row.color,
    rects: JSON.parse(row.rects || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function exportAnnotationsAsMarkdown(bookId: string): string {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as any
  const annotations = getAnnotations(bookId)
  const title = book?.title || 'Unknown'

  let md = `# Annotations: ${title}\n\n`
  let currentPage = -1

  for (const ann of annotations) {
    if (ann.page !== currentPage) {
      currentPage = ann.page
      md += `## Page ${currentPage}\n\n`
    }
    if (ann.type === 'highlight' && ann.selectedText) {
      md += `> ${ann.selectedText}\n`
      if (ann.content) md += `\n**Note:** ${ann.content}\n`
      md += '\n'
    } else if (ann.type === 'comment') {
      md += `**Comment:** ${ann.content}\n\n`
    } else if (ann.type === 'text_note') {
      md += `**Note:** ${ann.content}\n\n`
    }
  }
  return md
}

export function getConversations(bookId: string): any[] {
  return db.prepare('SELECT * FROM conversations WHERE book_id = ? ORDER BY created_at DESC').all(bookId).map(row => ({
    id: (row as any).id,
    bookId: (row as any).book_id,
    title: (row as any).title,
    createdAt: (row as any).created_at
  }))
}

export function createConversation(bookId: string): any {
  const id = randomUUID().substring(0, 16)
  const now = new Date().toISOString()
  db.prepare('INSERT INTO conversations (id, book_id, title, created_at) VALUES (?, ?, ?, ?)').run(id, bookId, 'New Chat', now)
  return { id, bookId, title: 'New Chat', createdAt: now }
}

export function getMessages(conversationId: string): any[] {
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId).map(row => ({
    id: (row as any).id,
    conversationId: (row as any).conversation_id,
    role: (row as any).role,
    content: (row as any).content,
    createdAt: (row as any).created_at
  }))
}

export function addMessage(conversationId: string, role: string, content: string): any {
  const id = randomUUID().substring(0, 16)
  const now = new Date().toISOString()
  db.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run(id, conversationId, role, content, now)
  return { id, conversationId, role, content, createdAt: now }
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
}

export function renameConversation(id: string, title: string): any {
  // Trim + cap length so a runaway paste doesn't blow out the UI.
  const clean = title.trim().slice(0, 120) || 'Untitled Chat'
  db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(clean, id)
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
    | { id: string; book_id: string; title: string; created_at: string }
    | undefined
  if (!row) return null
  return {
    id: row.id,
    bookId: row.book_id,
    title: row.title,
    createdAt: row.created_at
  }
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now)
}

export function deleteSetting(key: string): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key)
}

export function registerDatabaseHandlers(): void {
  ipcMain.handle('db:get-annotations', (_, bookId) => getAnnotations(bookId))
  ipcMain.handle('db:save-annotation', (_, annotation) => saveAnnotation(annotation))
  ipcMain.handle('db:delete-annotation', (_, id) => deleteAnnotation(id))
  ipcMain.handle('db:export-annotations', (_, bookId) => exportAnnotationsAsMarkdown(bookId))
  ipcMain.handle('db:set-status', (_, bookId, status) => setBookStatus(bookId, status))
  ipcMain.handle('db:update-book', (_, id, data) => updateBook(id, data))
  ipcMain.handle('db:mark-opened', (_, id) => markBookOpened(id))
  ipcMain.handle('db:find-by-hash', (_, hash) => findBooksByHash(hash))
  ipcMain.handle('db:find-by-title', (_, title) => findBooksByTitle(title))
  ipcMain.handle('db:get-conversations', (_, bookId) => getConversations(bookId))
  ipcMain.handle('db:create-conversation', (_, bookId) => createConversation(bookId))
  ipcMain.handle('db:get-messages', (_, conversationId) => getMessages(conversationId))
  ipcMain.handle('db:add-message', (_, conversationId, role, content) => addMessage(conversationId, role, content))
  ipcMain.handle('db:delete-conversation', (_, id) => deleteConversation(id))
  ipcMain.handle('db:rename-conversation', (_, id, title) => renameConversation(id, title))
  ipcMain.handle('db:get-book-note', (_, bookId) => getBookNote(bookId))
  ipcMain.handle('db:save-book-note', (_, bookId, content) => saveBookNote(bookId, content))
  ipcMain.handle('db:list-notes', (_, bookId) => listNotes(bookId))
  ipcMain.handle('db:get-note', (_, id) => getNote(id))
  ipcMain.handle('db:create-note', (_, bookId, title) => createNote(bookId, title))
  ipcMain.handle('db:update-note-content', (_, id, content) => updateNoteContent(id, content))
  ipcMain.handle('db:rename-note', (_, id, title) => renameNote(id, title))
  ipcMain.handle('db:delete-note', (_, id) => deleteNote(id))
}
