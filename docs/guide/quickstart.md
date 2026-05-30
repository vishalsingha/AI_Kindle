# Quick start

Five steps. About two minutes. By the end you'll have a PDF imported, an annotation made, and (optionally) the AI assistant answering questions about your book.

[[toc]]

## 1. Launch the app

After [installing](/guide/installation):

::: code-group

```bash [Linux]
ai-kindle
# Or click the icon in your app launcher.
```

```bash [macOS]
open -a "AI Kindle"
# Or click the icon in Launchpad / dock.
```

:::

You'll land on the empty library:

![Empty library](/screenshots/library.png)

## 2. Import a PDF

Three ways to add books:

1. **Drag and drop** — drop one or more `.pdf` files (or a whole folder of them) anywhere on the library window.
2. **File picker** — click the orange **Import** button in the top right → *Import Files*.
3. **Folder picker** — same menu → *Import Folder* to bulk-import every PDF under a directory.

Duplicate detection runs automatically (SHA-256 of the file contents). If you try to import a PDF that's already in your library, you'll be prompted to skip, replace, or keep both.

::: tip
Your original files are never modified. AI Kindle copies them into its own library folder so it owns its workspace.
:::

## 3. Open the book

Click any cover in the grid. The reader opens at page 1 with three optional panels:

- **Left**: table of contents and annotation list (toggle with `⌘B` / `Ctrl+B`).
- **Center**: the document itself, with smooth virtualized scrolling.
- **Right**: AI assistant or per-book Markdown notes (toggle with `⌘J` / `Ctrl+J`).

Scroll with your mouse / trackpad as you would any document.

## 4. Make your first highlight

1. **Select text** by clicking and dragging across a passage.
2. A floating toolbar appears with five colors (yellow, green, blue, pink, orange) and action icons.
3. **Click a color** to highlight. The selection becomes a clean per-line rect, not a stacked blob.

You can also click the **comment** icon in that toolbar to attach a sticky-note. Or the **text-note** icon for an inline note that lives alongside the page.

::: tip
All annotations land in your local SQLite database, keyed by the book. Open the sidebar (`⌘B`) and switch to the **Notes** tab to see them grouped by page, with a one-click jump to each.
:::

When you're done reading, click **Mark Done** in the titlebar — the book moves to the *Done* tab in the library.

## 5. (Optional) Ask the AI

Skip this step entirely if you just want a PDF reader — every other feature works without any AI configuration.

1. Open the AI panel: `⌘J` (Mac) or `Ctrl+J` (Linux/Windows). Or click the brain icon in the titlebar.
2. Pick **OpenAI** or **Azure OpenAI**.
3. Paste your API key. Get one at:
   - OpenAI → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Azure OpenAI → [Azure Portal](https://portal.azure.com/) → your OpenAI resource → Keys
4. Click **Save & Connect**. The validation hits the provider's `/models` endpoint.
5. Now you can:
   - **Select text** → click the sparkle icon to summarize.
   - **Select text** → click the brain icon for a plain-English explanation.
   - **Open the AI panel** → ask free-form questions about the current book.
   - **Annotation sidebar** → multi-select highlights and pick a template (study notes, flashcards, themes, quiz).

Responses stream token-by-token. Conversations are saved per book in the local DB.

## What's next

- **[Configuration](/guide/configuration)** — deeper dive into AI provider setup, custom OpenAI-compatible endpoints (LiteLLM, vLLM, OpenRouter), and where your data lives.
- **[Usage](/guide/usage)** — feature-by-feature reference: tabs, split view, command palette, bulk operations.
- **[Keyboard shortcuts](/guide/keyboard-shortcuts)** — full shortcut tables.
- **[Syncing across devices](/guide/syncing)** — move your library between Mac and Linux.
