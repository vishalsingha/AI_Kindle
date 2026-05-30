# Usage

A feature-by-feature reference for everything AI Kindle does. For a 2-minute crash course, see [Quick start](/guide/quickstart).

[[toc]]

## Library

The library is your home screen — a virtualized grid of every PDF you've imported, with covers, status badges, and progress percentages.

![Library view](/screenshots/library.png)

### Status tabs

The tabs at the top filter the grid:

| Tab | What's in it |
|---|---|
| **All** | Every book |
| **To Do** | Books with zero annotations *and* not manually marked Done |
| **In Progress** | Books with at least one annotation |
| **Done** | Books you've manually flagged with the *Mark Done* button |

Progress percentages on in-progress books are derived from your **furthest-annotated page** divided by total pages. AI Kindle deliberately *doesn't* track progress by counting pages scrolled — that turned out to be noisy and didn't reflect real understanding.

### Sort and search

Sort by **Date Added**, **Last Read**, or **Title** via the toggle in the top right. The search bar matches against title, author, and tags. Hit `⌘K` (or `Ctrl+K`) to open the command palette and type the title of any book to jump there directly.

### Continue reading

The teal banner near the top of the library appears when you have an in-progress book. Click **Resume →** to open it exactly where you left off.

### Bulk operations

| Gesture | What it does |
|---|---|
| `⌘`-click (Linux/Win: `Ctrl`-click) | Toggle a single book into selection |
| `Shift`-click | Range-select from the last selected book |
| Checkbox appears on each card | Continue selecting without modifiers |

While in selection mode, an action bar slides up from the bottom with bulk **Mark Done**, **Mark To Do**, **Delete**, and **Tag** options.

### Per-book menu

Hover any book card and click the **⋯** icon for:

- **Mark as Done / To Do** — toggle status
- **Show in Finder / Files** — reveal the underlying PDF
- **Delete** — removes the book, its annotations, conversations, notes, and thumbnail (with confirmation)

## Importing PDFs

| How | What it does |
|---|---|
| **Drag and drop** | Drop one or many PDFs (or folders of them) onto the library window |
| **Import → Import Files** | Multi-file picker |
| **Import → Import Folder** | Recursively scans a folder for PDFs |

Every import goes through:

1. **SHA-256 hash** of the file contents.
2. **Duplicate check** against existing books. If a same-content book exists, you get a dialog: *Skip*, *Keep original name*, or *Import as new copy* (with a pre-filled `copy_of_…` title).
3. **Title check** — if the title is identical to an existing book but the content is different, you're prompted to rename or override.
4. **Atomic copy** — the PDF is copied to a temp file first, then renamed into place. If the app crashes mid-copy, you never see a half-written file in the library.

Originals are never modified. PDFs in the library are renamed to `<random-id>.pdf` to avoid filename collisions.

## Reading a book

Click any cover. The reader has three optional panels.

### Sidebar (`⌘B` / `Ctrl+B`)

Two tabs:

- **Contents** — the PDF's outline (table of contents), if it has one. Click any entry to jump there. Long jumps (5+ pages) scroll instantly; short jumps animate smoothly. The target page is pre-rendered before you arrive.
- **Notes** — every annotation in the current book, grouped by page. Click any entry to jump. Multi-select for AI templates (see [Configuration](/guide/configuration#generate-from-highlights)). The **Export** button downloads all annotations as a Markdown file.

### Center: the document

Virtualized rendering — only pages near the viewport are rasterized. Everything else is a cheap placeholder of the correct size, so scroll height stays stable for the whole document. A 1000-page PDF behaves the same as a 10-page one.

| Action | Gesture |
|---|---|
| **Scroll** | Wheel, trackpad, arrow keys, space |
| **Page navigation** | `PageDown` / `PageUp`, or the bottom controls |
| **Zoom** | Trackpad pinch, `⌘+` / `⌘-`, `Ctrl+scroll`, or click the % in the bottom bar |
| **Reset zoom** | Click the zoom percentage |
| **Jump to first / last** | `Home` / `End` |

### Right panels

Toggle with the buttons in the titlebar:

- **AI panel** (`⌘J` / `Ctrl+J`) — chat about the current book. Each book has its own conversation history.
- **Notes panel** (notebook icon) — full Markdown editor for long-form per-book notes. Live preview, autosave.

## Annotations

Three annotation types, all created by selecting text first:

| Type | What it is |
|---|---|
| **Highlight** | Color the text. Five colors: yellow, green, blue, pink, orange. Multi-line selections render as clean per-line rects, not stacked layers. |
| **Comment** | A sticky note attached to selected text. The text is preserved, your note lives in a popover that opens when you click the highlight. |
| **Text note** | An inline note icon embedded near the selection — click to expand. |

All annotations live in your local SQLite, keyed by the book id and page. The sidebar's **Notes** tab groups them by page with a one-click jump.

### Export

In the sidebar, click **Export** to save every annotation as a Markdown file:

```markdown
# Annotations: <book title>

## Page 12

> Highlighted passage in blockquote form.

**Comment:** Your note here.

## Page 13

> Another passage.
```

This file is yours to keep — feed it back into your second-brain tool of choice, share with collaborators, etc.

## Tabs and split view

- **Tabs** — clicking a different book opens a new tab. Drag to reorder. `×` to close.
- **Split view** — right-click any tab → *Open to the right*. The book opens in a second pane next to the current one.

Great for textbook + cheatsheet, paper + supplementary materials, or two parts of one book you keep flipping between.

## Long-form notes

Each book has a dedicated Markdown editor — open it from the notebook icon in the titlebar. Features:

- Live preview rendered side-by-side with the editor.
- Autosave to the local DB on every keystroke (debounced).
- Standard Markdown plus GFM tables, code fences, and KaTeX for math (`$inline$` and `$$display$$`).
- Multiple named notes per book — create more with the **+** button.

Use it for chapter summaries, cheat sheets, your own running glossary — anything that doesn't belong in marginal highlights.

## Command palette (`⌘K`)

The fastest way to navigate. Start typing to:

- Jump to any book by title.
- Jump to any page (`:123` or "page 123" or just digits while a book is open).
- Run a built-in action (toggle theme, close book, open AI, open notes, mark done, …).

Most reader shortcuts are reachable through the palette too — useful when you can't remember the binding.

## Themes

Light and dark. Toggle with `⌘D` / `Ctrl+D` or the moon/sun icon in the titlebar. The choice persists across launches via the local DB.

## Zoom behavior

Two-finger trackpad pinch (or `Ctrl+scroll`) zooms around the point under your cursor. To keep the gesture at 60 fps, AI Kindle uses GPU-accelerated CSS transform during the pinch and only re-rasterizes through pdf.js once you stop. You'll see a brief (~100 ms) blur as the new sharp render comes in — that's the trade-off for a smooth gesture.
