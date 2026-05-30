---
layout: home

hero:
  name: AI Kindle
  text: Local-first PDF study companion
  tagline: Highlight, annotate, take notes, and chat with AI — all on your machine. Your PDFs never leave your laptop.
  image:
    src: /screenshots/library.png
    alt: AI Kindle library screenshot
  actions:
    - theme: brand
      text: Get started
      link: /guide/installation
    - theme: alt
      text: Quick start
      link: /guide/quickstart
    - theme: alt
      text: View on GitHub
      link: https://github.com/vishalsingha/AI_Kindle

features:
  - icon: 🔒
    title: Local-first
    details: Every PDF, annotation, note, and AI conversation is stored on your machine in SQLite. No cloud account, no sync server, no telemetry.

  - icon: ⚡
    title: Fast on big libraries
    details: Virtualized library grid, lazy-loaded reader bundle, page-on-demand rendering. 500-page textbooks open instantly.

  - icon: ✏️
    title: Real annotations
    details: Five-color highlights with clean per-line rects, sticky-note comments, inline text notes, and Markdown export of everything.

  - icon: 🤖
    title: Bring-your-own AI
    details: Optional OpenAI or Azure OpenAI integration for summaries, explanations, and chat over your highlights. Your API key is encrypted in the OS keychain.

  - icon: 📚
    title: Multi-book workflows
    details: Tabs, split view, per-book Markdown notes, command palette (⌘K), and full keyboard navigation.

  - icon: 🎨
    title: Beautiful UI
    details: Light and dark themes, rounded windows on Linux/Windows, native title bar on macOS. Polished and quiet, not flashy.
---

<div class="vp-doc" style="max-width: 1000px; margin: 4rem auto 0; padding: 0 1.5rem;">

## Why AI Kindle?

Most desktop PDF readers are either dumb (no notes, no search, no progress tracking) or cloud-bound (Adobe, Kindle, Notion). AI Kindle is built for people who read a lot of PDFs — research papers, textbooks, long-form articles — and want one app that stays out of the way, scales to hundreds of books, and gives them real annotations and optional AI without uploading anything.

## What's in this site

- [**Installation**](/guide/installation) — copy-pasteable install commands for Ubuntu, any Linux, and macOS.
- [**Quick start**](/guide/quickstart) — go from zero to your first highlight in under two minutes.
- [**Configuration**](/guide/configuration) — set up the optional AI provider and find your data directory.
- [**Usage**](/guide/usage) — feature-by-feature walkthrough.
- [**Keyboard shortcuts**](/guide/keyboard-shortcuts) — every shortcut at a glance.
- [**Syncing across devices**](/guide/syncing) — move your library + annotations between Mac and Linux.
- [**Architecture**](/development/architecture) — for hackers and contributors.

## At a glance

- Built on **Electron 28** + **React 18** + **TypeScript** + **Tailwind**.
- Storage is **SQLite (WAL mode)** for metadata and the local filesystem for PDFs and thumbnails.
- AI is optional and uses any **OpenAI-compatible** endpoint — your key is encrypted with Electron's `safeStorage`.
- Source: [github.com/vishalsingha/AI_Kindle](https://github.com/vishalsingha/AI_Kindle)

</div>
