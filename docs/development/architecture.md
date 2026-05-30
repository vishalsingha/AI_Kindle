# Architecture

A tour of how AI Kindle is built. Aimed at contributors and curious hackers.

[[toc]]

## Layout

```text
src/
├── main/                 Electron main process (Node)
│   ├── index.ts          BrowserWindow + lifecycle + IPC registration
│   ├── database.ts       SQLite schema, migrations, queries
│   ├── file-manager.ts   PDF import / delete / thumbnail storage
│   ├── openai.ts         Streaming OpenAI / Azure client + encrypted key
│   ├── pdf-export.ts     pdf-lib-based annotated-PDF export
│   └── web-search.ts     Optional web-search context for AI chat
├── preload/              Typed IPC bridge (contextBridge)
│   ├── index.ts          Exposes `window.api` to the renderer
│   └── index.d.ts        Shared types
└── renderer/src/         React UI
    ├── components/       reader, library, AI, notes, command palette
    ├── stores/           Zustand stores (one per domain)
    ├── hooks/            useImporter, useAnnotations, …
    └── lib/              pdf-setup, thumbnail renderer, rect merging
```

The three classic Electron process tiers — **main** (Node), **preload** (sandboxed Node), and **renderer** (Chromium) — are kept strictly separate. The renderer never imports `electron` directly; everything goes through `window.api` defined in preload, with types in `preload/index.d.ts`.

## Storage layout

Two stores, used for what they're good at:

- **SQLite (WAL mode)** for all structured data — books, annotations, conversations, messages, notes, settings.
- **Filesystem** for binary blobs — PDFs (`library/<id>.pdf`) and thumbnails (`thumbnails/<hash>.jpg`).

This split keeps the database tiny (a 50-book library is ~400 KB) while allowing the OS's native file caching to handle the heavy stuff. It also makes backups trivial — tar the user-data folder.

### Key tables

```sql
books          (id, hash, title, author, filename, filepath, page_count,
                current_page, status, tags, date_added, last_read)
annotations    (id, book_id, type, page, content, selected_text, color,
                rects, created_at, updated_at)
conversations  (id, book_id, title, created_at)
messages       (id, conversation_id, role, content, created_at)
notes          (id, book_id, title, content, created_at, updated_at)
settings       (key, value, updated_at)
```

`filepath` is **always the basename** (`abc123.pdf`), resolved against the current machine's library dir at read time. That's the portability trick from v1.2.0 — see `toResolvedFilepath` in `src/main/database.ts`.

### Migrations

All run idempotently on every `initDatabase()` call:

1. Add `status` column to `books` if missing (early build → status-aware builds).
2. Drop the legacy `UNIQUE(hash)` constraint so users can intentionally re-import the same PDF as a separate entry.
3. Lift `book_notes` rows (legacy single-note table) into the new multi-note `notes` table.
4. Rewrite any absolute `books.filepath` values down to basenames (portable-paths migration).
5. Cleanup pass: delete orphaned `messages`, `conversations`, `annotations`, `book_notes`, `notes` whose owner book no longer exists.

## Key design choices

### Virtualized everything

- **Library grid** — `@tanstack/react-virtual` renders only the rows that intersect the viewport. A library of 1000 books and one of 10 cost the same.
- **PDF pages** — the reader holds placeholders of the correct height for every page, but only rasterizes pages near the viewport via `react-pdf`. Scroll height stays stable; memory and CPU stay flat regardless of book length.

### Content-hash dedup at import time

Every imported file gets a SHA-256. If a same-content book already exists, the user is asked explicitly: skip, replace, or import as a separate copy. If the title (but not the content) collides, they're asked to rename. Both dialogs surface intent rather than silently picking a side.

### Pinch-to-zoom: CSS transform during the gesture, pdf.js re-render on commit

A two-finger pinch zoom would re-rasterize through pdf.js dozens of times per second — far too slow for a smooth gesture. AI Kindle:

1. Captures the gesture and applies a GPU-accelerated `transform: scale(x)` to the current pages.
2. When the gesture stops, schedules a pdf.js re-render at the new scale.
3. Swaps the new raster in when ready.

You get 60 fps during the gesture, with a brief (~100 ms) blur right after as the new sharp render replaces the transformed one. The trade-off is documented in the [Troubleshooting](/guide/troubleshooting#zoom-looks-momentarily-blurry-after-pinching) page.

### Atomic file writes

Every PDF copy on import:

1. Write into `library/<id>.pdf.tmp`.
2. `rename()` over to `library/<id>.pdf` (atomic on POSIX, and on NTFS via `MoveFileEx`).
3. Fallback path for filesystems that don't support atomic rename (rare).

A crash mid-copy leaves no half-written PDF in the library.

### Encrypted API key

AI provider keys are stored in the `settings` table under `ai.apiKey.encrypted`, encrypted via Electron's `safeStorage`:

| OS | Backend |
|---|---|
| macOS | Keychain |
| Windows | DPAPI |
| Linux | `libsecret` or `kwallet` |

On every AI request the key is decrypted in-process for that single HTTPS call. The plaintext never touches disk.

### Lazy-loaded reader bundle

Boot path optimization: opening the library should not pay for pdf.js text-layer, the AI panel, the notes Markdown editor, or KaTeX. All of those are code-split via dynamic `import()` in the renderer, so the library view boots fast and the heavy bundles load on demand.

## State management

**Zustand** — one store per domain, no global root reducer.

| Store | Domain |
|---|---|
| `library-store` | Books, search, sort, status filter, theme |
| `reader-store` | Current book, page, zoom, panel state |
| `annotation-store` | Per-book annotations, selection, color |
| `ai-store` | Config, models, streaming state, conversations |
| `note-store` | Per-book Markdown notes |
| `tabs-store` | Open tabs, secondary-pane book |
| `command-palette-store` | Palette state and recent commands |
| `selection-store` | Bulk selection in the library |
| `ui-store` | Theme, sidebar widths, transient UI |

Each store has its own subscribe-shape, so components subscribe only to what they need and re-render minimally.

## IPC bridge

`src/preload/index.ts` exposes a single `window.api` object via `contextBridge`. All renderer-to-main communication goes through it. Examples:

```ts
window.api.importOne(filePath, opts)     // -> file-manager.ts
window.api.readPDFFile(filepath)         // -> file-manager.ts
window.api.exportAnnotatedPDF(bookId)    // -> pdf-export.ts
window.api.saveAIConfig(cfg)             // -> openai.ts
window.api.streamChat(messages, opts)    // -> openai.ts (streams via 'ai:stream' events)
```

Types live in `src/preload/index.d.ts` and are imported by both preload and renderer for end-to-end safety.

## Build pipeline

[`electron-vite`](https://electron-vite.org) drives the build, with three independent entry points:

- `electron.vite.config.ts` → main process (`src/main/`) bundled with esbuild
- → preload (`src/preload/`) bundled separately to a single file (required by `contextBridge`)
- → renderer (`src/renderer/`) bundled by Vite + React + Tailwind

`npm run dev` runs all three with hot reload — main process restarts, preload reloads, renderer hot-swaps React components.

`npm run build` does the full production build. `electron-builder` then packages it into platform-specific installers (`npm run dist:mac` / `dist:linux` / `dist:win`).

## CI

GitHub Actions workflow at `.github/workflows/build-linux.yml`:

- Triggered by manual dispatch and `v*` tag pushes.
- Runs on `ubuntu-latest` (real Linux toolchain so `better-sqlite3` compiles cleanly).
- `npm ci → npm run build → npx electron-builder --linux deb AppImage`.
- Uploads `.deb` and `.AppImage` as workflow artifacts and (on tag pushes) attaches them to the GitHub Release.

Docs site uses a separate workflow at `.github/workflows/deploy-docs.yml` that builds the VitePress site and deploys to GitHub Pages.

## Why Electron and not Tauri/native?

Electron means a bundled Chromium + a bundled Node, which is heavy. But:

- **pdf.js** is the gold-standard PDF renderer and it's web-native.
- The entire UI is React + Tailwind, which would need rewriting for any non-web stack.
- Native modules we depend on (`better-sqlite3`, `pdf-lib`) all work in Electron without modification.
- Electron's `safeStorage` gives us OS keychain access with one line of code.

Tauri would shave ~150 MB off the install size at the cost of much more glue work (especially for streaming SSE and Keychain access on three OSes). Not worth it for this app's scale.
