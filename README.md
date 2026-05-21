# AI Kindle

**A fast, local, privacy-first PDF study companion for your desktop.**

AI Kindle lets you keep a searchable library of PDFs, annotate them with highlights and notes, write long-form Markdown notes alongside each book, open two books side-by-side, and ask a local AI to summarize, explain, or chat about what you're reading — all without uploading your documents to anyone's server.

---

## Table of contents

- [What it is](#what-it-is)
- [Feature overview](#feature-overview)
- [Screenshots / concepts](#screenshots--concepts)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [First-run walkthrough](#first-run-walkthrough)
- [How to use everything](#how-to-use-everything)
  - [Library](#library)
  - [Importing PDFs](#importing-pdfs)
  - [Reading a book](#reading-a-book)
  - [Zoom](#zoom)
  - [Table of contents](#table-of-contents)
  - [Annotations](#annotations)
  - [Long-form notes](#long-form-notes)
  - [Progress tracking and status](#progress-tracking-and-status)
  - [Tabs and split view](#tabs-and-split-view)
  - [AI assistant](#ai-assistant)
  - [Command palette](#command-palette)
  - [Bulk selection](#bulk-selection)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Where your data lives](#where-your-data-lives)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Development](#development)
- [Build for production](#build-for-production)

---

## What it is

AI Kindle is an Electron desktop app built for focused reading sessions. It is:

- **Local-first** — every PDF, annotation, note, and AI conversation is stored on your machine in SQLite. Nothing is sent to a cloud.
- **Fast on big libraries** — the library view is virtualized, thumbnails are cached as JPEGs, and the reader only renders pages that are about to be visible.
- **Fast on big PDFs** — 500-page books open without allocating 500 canvases. Jumping to any page from the table of contents is near-instant.
- **AI-capable** — integration with the OpenAI API for summaries, plain-English explanations, and document Q&A. Bring your own API key; it's encrypted and stored locally.

---

## Feature overview

| Area | What you get |
|---|---|
| **Library** | Grid and list views, search, sort by Date Added / Last Read / Title, status tabs (All / To Do / In Progress / Done), drag-and-drop import, "Continue Reading" banner for your last session |
| **Import** | File picker or bulk folder import, duplicate-content detection (SHA-256), duplicate-title warning with pre-filled `copy_of_` rename, atomic file copy so crashes never leave half-imported files |
| **Reader** | Virtualized page rendering, pinch-to-zoom with anchor preservation, smooth / instant scroll (instant for long TOC jumps), selectable text, table of contents sidebar, progress bar, page counter |
| **Annotations** | 5-color highlights with clean per-line rects, sticky-note comments, inline text notes, annotation sidebar grouped by page, Markdown export |
| **Notes** | Per-book Markdown editor with live preview and autosave |
| **Tabs & split view** | Keep multiple books open; open a second book in a right-hand pane to read side-by-side |
| **AI** | OpenAI-powered summarize / explain / chat with streaming responses, conversation history per book |
| **Themes** | Light and dark |
| **Productivity** | Command palette (⌘K), keyboard shortcuts, bulk select with shift / ⌘-click, recents, resume-last-session |

---

## Screenshots / concepts

```
 ┌───────────────────────────────────────────────────────────┐
 │  ⌘K  Library                                       🌙     │
 ├───────────────────────────────────────────────────────────┤
 │  [Continue Reading]  Deep Learning · Page 184  →          │
 ├───────────────────────────────────────────────────────────┤
 │  All  [To Do 12]  [In Progress 3]  [Done 7]     Import ▼  │
 ├───────────────────────────────────────────────────────────┤
 │  [▓▓▓] [▓▓▓] [▓▓▓] [▓▓▓] [▓▓▓]                            │
 │  [▓▓▓] [▓▓▓] [▓▓▓] [▓▓▓] [▓▓▓]  ← grid of PDF thumbnails  │
 └───────────────────────────────────────────────────────────┘
```

```
 ┌──────────┬───────────────────────────────┬────────────────┐
 │ TOC      │    Page 42 of 312             │   AI Assistant │
 │ Notes    │                               │                │
 │ ─────    │    ┌───────────────────┐      │  > What is     │
 │ ▸ Ch 1   │    │                   │      │    chapter 3   │
 │ ▾ Ch 2   │    │  Rendered page    │      │    about?      │
 │   § 2.1  │    │   with                  │                │
 │   § 2.2  │    │  highlights       │      │  Chapter 3     │
 │ ▸ Ch 3   │    │                   │      │  covers…       │
 │          │    └───────────────────┘      │                │
 └──────────┴───────────────────────────────┴────────────────┘
```

---

## Requirements

- **macOS, Linux, or Windows** (Electron app)
- **Node.js 18+** and npm (for running / building from source)
- **Optional: an [OpenAI API key](https://platform.openai.com/api-keys)** — only required for AI features

---

## Quick start

```bash
# 1. Clone and install
git clone <this repo>
cd AI_Kindle
npm install

# 2. Run the app
npm run dev

# 3. (Optional) Enable AI features
#    Open the AI panel in the app (brain icon) and paste your OpenAI API key.
#    Get one at https://platform.openai.com/api-keys
```

The Electron window opens and your empty library is ready. Click **Import** or drag a PDF onto the window.

---

## First-run walkthrough

1. **Import a PDF** — drag a `.pdf` from Finder / Explorer onto the library window, or click **Import → Import Files**.
2. **Click the cover** — the book opens at page 1.
3. **Highlight a sentence** — click-and-drag across text. A floating toolbar appears with five colors and AI actions.
4. **Mark it done** — click the "Mark Done" button in the titlebar when you've finished reading.
5. **Come back tomorrow** — the "Continue Reading" banner will resume you exactly where you left off.

---

## How to use everything

### Library

The library is your home screen. It shows all PDFs you've imported as a responsive grid (or a compact list). Every book has:

- A thumbnail (generated from page 1, cached as JPEG)
- A status badge — **To Do**, **In Progress**, or **Done**
- A progress percentage (derived from your last annotation) when in progress
- A hover menu (⋯) with **Mark as Done / To Do**, **Show in Finder**, and **Delete**

**Status tabs** at the top filter the grid: **All**, **To Do**, **In Progress**, **Done**. Search filters across title, author, and tags. Sort by **Date Added**, **Last Read**, or **Title**.

The **Continue Reading** card at the top (shown when there is a relevant book) resumes your most recent in-progress reading with one click.

### Importing PDFs

- Click **Import → Import Files** for a multi-file picker
- Click **Import → Import Folder** to bulk import every PDF in a folder
- Or **drag-and-drop** any number of PDFs onto the library

AI Kindle computes a SHA-256 of each file before copying it. If you try to import a PDF that already exists (same content), you'll see a dialog offering to **Skip**, **Keep original name**, or import as a new copy with a pre-filled `copy_of_…` title. If the title (but not the content) already exists, you'll be prompted to rename.

PDFs are copied into the app's user-data directory; your originals are never modified.

### Reading a book

Click any book cover to open the reader. Or use **Cmd+K** then type the title.

The reader has three optional panels:
- **Left (sidebar)** — table of contents and annotation list
- **Center** — the document
- **Right** — AI assistant / notes / secondary pane

Scroll with the mouse / trackpad as you would any document. Pages only render as they approach the viewport; everything else is a cheap placeholder of the correct size so scroll height stays stable.

At the top-right of the titlebar:
- **Mark Done** — flips the book between To Do/In Progress and Done
- **Sidebar toggle**
- **AI panel toggle**
- **Theme toggle** (light / dark)

At the bottom, the **page controls** show your current page, total pages, and zoom level.

### Zoom

- **Trackpad pinch** — two-finger pinch zooms the PDF around the point under your cursor. During the gesture, zoom is handled by GPU-accelerated CSS transform for zero lag; once you stop pinching the PDF silently re-rasterizes at the final size for crisp text.
- **Cmd+Scroll** — same behavior, for mice with a wheel
- **Cmd + / Cmd -** — zoom in / out by one step
- **Reset** — click the zoom percentage in the bottom bar

### Table of contents

Open the sidebar (⌘B). The **Contents** tab shows the PDF's outline when available — click any entry to jump. Long jumps scroll instantly; short jumps (< 5 pages) animate smoothly. The target page is pre-rendered before you arrive so it's ready on landing.

### Annotations

**Highlight** — select text and pick a color from the floating toolbar.
- 5 colors: yellow, green, blue, pink, orange
- Multi-line highlights render as clean per-line rectangles, not stacked blotchy layers

**Comment** — select text and click the comment icon. A popover appears to type your note. Comments stay attached to the highlighted text even if you later re-arrange pages in the reader.

**Text note** — same flow; appears as an inline sticky-note icon you can expand.

**Annotation sidebar** (⌘B → Notes tab) — lists all annotations in the current book, grouped by page. Click any entry to jump to its page. The **Export** button downloads the annotations as a Markdown file (one section per page, with highlighted text as blockquotes and your notes below them).

All annotations are saved in local SQLite, keyed by the book. Your progress percentage is derived from your furthest-annotated page.

### Long-form notes

Click the notebook icon (or open the right-side notes panel) to get a full Markdown editor attached to the current book. Live preview, autosave, keyboard-focused workflow. Perfect for chapter summaries that don't belong in marginalia.

### Progress tracking and status

AI Kindle does **not** track progress by counting pages scrolled (that was found to be noisy). Instead:

- Any PDF you haven't annotated is **To Do**
- A PDF with at least one annotation is **In Progress**; progress = last annotation page ÷ total pages
- A PDF you manually flag with **Mark Done** is **Done** (always 100%)

You can flip Done → To Do at any time. Deleting a book removes its annotations and thumbnail too.

### Tabs and split view

- Click a book from the library → opens in a new tab (or reuses one)
- Right-click a tab → "Open to the right" puts the book in a secondary pane
- Drag tabs to reorder them
- Close a tab with its ×

Split view is great for reference: keep a textbook on the left and your notes or cheat-sheet PDF on the right.

### AI assistant

AI features use any OpenAI-compatible API. AI Kindle supports two provider shapes out of the box:

- **OpenAI cloud** — `https://api.openai.com/v1`. Bring your own API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- **Azure OpenAI** — your own Azure deployment. Requires an endpoint, API version, one or more deployment names, and an Azure API key.

**First-time setup:**
1. Open the AI panel with ⌘J (or click the brain icon in the titlebar).
2. Pick **OpenAI** or **Azure OpenAI** from the provider tabs.
3. Fill in the appropriate fields:
   - **OpenAI** → just paste your API key (`sk-…`). The base URL defaults to `api.openai.com/v1` but can be changed for proxies or compatible endpoints.
   - **Azure OpenAI** → paste your Azure key, endpoint (e.g. `https://your-resource.openai.azure.com/`), API version (e.g. `2024-12-01-preview`), and one or more deployment names (e.g. `gpt-4.1`).
4. Click **Save & Connect**. AI Kindle validates the credentials by calling the provider's `/models` endpoint.
5. Your key is encrypted via Electron's `safeStorage` (uses the OS keychain / DPAPI / kwallet) and stored in the local SQLite database. It never leaves your machine except on outbound requests to the provider you configured.

**For Azure users**, the "model" dropdown shows your deployment names instead of OpenAI model IDs, and each request is routed to `{endpoint}/openai/deployments/{deployment}/chat/completions?api-version=…` with the `api-key` header.

**Usage:**
- **Summarize** — select some text and click the sparkle icon in the selection toolbar
- **Explain** — select some text and click the brain-circuit icon for a plain-English breakdown
- **Chat** — open the AI panel and ask free-form questions about the current book
- **Generate from highlights** — in the annotations sidebar, multi-select highlights and pick a template (study notes, flashcards, themes, quiz, etc.)

The panel streams responses token-by-token. Your prompt plus the PDF/highlight context is sent directly to the provider you configured — OpenAI or Azure. Conversation history is saved per book, locally.

**Changing providers / keys / models:**
- Click the gear icon next to the status dot in the AI panel header to switch between OpenAI and Azure, update keys, or add/remove Azure deployments.
- For OpenAI, the model dropdown lists every chat-capable model your account has access to. `gpt-4o-mini` is a fast, cheap default that works well for most queries.
- For Azure, the dropdown lists the deployment names you entered in settings.

**Compatible endpoints** — under the OpenAI provider you can change the base URL to any OpenAI-compatible endpoint (LiteLLM, local vLLM, OpenRouter, etc.).

### Command palette

**⌘K** anywhere opens the command palette. Start typing to:
- Jump to any book in your library
- Jump to any page (`:123` or "page 123")
- Run an action (toggle theme, close book, open AI, open notes, …)

It's the fastest way to navigate once you have a few books.

### Bulk selection

In the library:
- **⌘-click** a book to toggle it into selection
- **Shift-click** extends the selection to that book
- While in selection mode, a checkbox appears on each card so you can continue without modifiers

Selected books can be deleted / marked done / untagged in bulk via the action bar that appears at the bottom.

---

## Keyboard shortcuts

### Global
| Shortcut | Action |
|---|---|
| `⌘K` | Command palette |
| `⌘D` | Toggle dark mode |
| `Esc` | Back to library (from reader) |

### Reader
| Shortcut | Action |
|---|---|
| `Space`, `↑`, `↓`, mouse wheel | Natural scroll |
| `PageDown` / `PageUp` | Jump to next / previous page |
| `⌘→` / `⌘←` | Jump to next / previous page |
| `Home` / `End` | Jump to first / last page |
| `⌘+` / `⌘-` | Zoom in / out |
| `⌘B` | Toggle sidebar (TOC / annotations) |
| `⌘J` | Toggle AI panel |

### Import dialog
| Shortcut | Action |
|---|---|
| `Enter` | Confirm import with the shown title |
| `Esc` | Skip this file |

### Library
| Shortcut | Action |
|---|---|
| Type anything | Focuses the search bar |
| `Shift`-click | Range-select books |
| `⌘`-click | Toggle individual book selection |

---

## Where your data lives

Everything is stored under Electron's user-data directory for the app:

- **macOS** — `~/Library/Application Support/ai-kindle/`
- **Windows** — `%APPDATA%\ai-kindle\`
- **Linux** — `~/.config/ai-kindle/`

Inside:

| Path | Contents |
|---|---|
| `ai-kindle.db` | SQLite database: books, annotations, conversations, messages |
| `ai-kindle.db-wal` / `-shm` | Write-ahead log (managed by SQLite; do not delete while the app is running) |
| `library/` | Copies of your imported PDFs (`<id>.pdf`) |
| `thumbnails/` | JPEG thumbnails, one per book hash |

Safe to back up any of these while the app is closed. To reset everything, quit the app and delete the whole folder.

---

## Privacy

AI Kindle has no telemetry, no account, no sync, and no background network activity. It reads local files, writes to local SQLite, and only talks to the internet when you actively use AI features — at which point it sends your prompt + the current PDF context to whichever provider you've configured (OpenAI, Azure OpenAI, or any compatible endpoint you point it at). Your API key is encrypted on disk via Electron's `safeStorage` (OS keychain on macOS, DPAPI on Windows, kwallet / libsecret on Linux). Electron's `webSecurity` is disabled only so the renderer can load local `file://` PDFs from your library directory; external URLs are never loaded by the renderer itself.

---

## Troubleshooting

**"Failed to load PDF"**
- The file may have been moved or deleted from your library folder. Re-import it.
- Check the DevTools console for a specific pdf.js error (open with Cmd+Option+I in dev mode).

**AI panel says "Offline"**
- Open the AI panel (⌘J or brain icon), pick your provider, and paste your credentials.
- If "Not configured" stays red after saving, the validation call failed — the red banner will show the provider's exact reason (invalid key, insufficient_quota, wrong endpoint, wrong deployment, etc.).
- For Azure: double-check the `api-version` and deployment name exactly as they appear in Azure Portal. The endpoint must be the resource URL with no trailing path (e.g. `https://your-resource.openai.azure.com/`), not a deployment-specific URL.

**Thumbnails are slow on first library visit**
- Thumbnails are generated lazily the first time you view a book card. On subsequent visits they load instantly from disk. For a brand-new library of 100+ books, expect a one-time spin to generate all JPEGs (capped at 3 in parallel).

**Re-imported PDF has old annotations**
- This was fixed: re-imports now get a fresh ID and no prior annotations. If you're on an older build, upgrade or delete `ai-kindle.db` to reset.

**Zoom looks blurry briefly after pinching**
- The blur is the old rasterization being stretched for the first ~100ms after you stop pinching, while pdf.js re-renders at the new scale. This is intentional — it's the trade-off that keeps the pinch gesture at 60fps.

**App won't open / crashes immediately**
- Delete the `ai-kindle.db-wal` file (only when the app is closed) and relaunch. It will safely recover from the last committed transaction.

---

## Architecture

```
src/
├── main/                 # Electron main process (Node)
│   ├── index.ts          # Window, lifecycle, IPC registration
│   ├── database.ts       # SQLite schema, migrations, queries
│   ├── file-manager.ts   # Import, delete, thumbnail storage
│   └── openai.ts         # OpenAI streaming client + encrypted key storage
├── preload/              # Secure bridge between main and renderer
├── renderer/src/         # React UI
│   ├── components/       # Reader, library, AI, notes, command palette
│   ├── stores/           # Zustand stores (library, reader, annotations, AI, notes, tabs, selection, command palette)
│   ├── hooks/            # useImporter, useAnnotations, …
│   └── lib/              # Utilities (pdf-setup, thumbnail renderer, rect merging, …)
```

**Key design choices:**

- **SQLite (WAL mode)** for all structured data — fast, atomic, crash-safe
- **File system for binary data** (PDFs and thumbnails) — avoids bloating the DB
- **Content-hash-based dedup** at import time — users decide explicitly whether duplicates should coexist
- **Virtualized library grid** and **virtualized PDF pages** — memory and render cost stay flat regardless of library / book size
- **CSS-transform zoom during pinch, then committed pdf.js re-render on release** — smooth UX without sacrificing sharpness
- **Lazy-loaded reader bundle** — the library view boots without paying for pdf.js text-layer, AI panel, notes editor, etc.

---

## Development

```bash
npm install        # install dependencies
npm run dev        # launch Electron with hot-reload and DevTools
```

The app uses:
- **Electron** + **electron-vite** for the main/preload/renderer build
- **React 18** + **TypeScript** + **Tailwind CSS**
- **Zustand** for app state
- **better-sqlite3** for embedded storage
- **react-pdf** wrapping **pdf.js** for rendering
- **@tanstack/react-virtual** for the library grid
- **OpenAI API** (external) for AI — configurable base URL for compatible endpoints

To enable strict production checks before a release:

```bash
npm run build      # type-check + bundle everything
npm run preview    # run the production build
```

### Code style

- Prefer small, focused components; state lives in Zustand stores, not prop drills
- All Electron IPC goes through `preload/index.ts` (typed in `preload/index.d.ts`); never use `ipcRenderer` directly from the renderer
- All heavy PDF work happens in the renderer via `pdf.js` — the main process only moves bytes and hits SQLite

---

## Build for production

```bash
npm run build
```

Outputs to `out/`. To create a distributable installer you can use [electron-builder](https://www.electron.build) or the target of your choice — this repo doesn't ship a release config by default.

---

## License

Personal use. No warranty. If you want to redistribute or adapt, open an issue or send a note first.
