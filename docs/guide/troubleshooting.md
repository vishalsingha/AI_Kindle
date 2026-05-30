# Troubleshooting

Quick fixes for the most common problems. If none of these match, open an issue at [github.com/vishalsingha/AI_Kindle/issues](https://github.com/vishalsingha/AI_Kindle/issues) with:

- Your OS and AI Kindle version (`ai-kindle --version` or *About* in the menu)
- What you were trying to do
- What happened
- Any error in the DevTools console (`⌘⌥I` / `Ctrl+Shift+I`)

[[toc]]

## Installation issues

### "App doesn't show up in the launcher" (Linux)

You're probably on an older build that shipped a sparse `.desktop` file. Upgrade to **v1.2.3+** and re-install. If it still doesn't appear:

```bash
sudo update-desktop-database /usr/share/applications
sudo gtk-update-icon-cache -f -t /usr/share/icons/hicolor
```

On GNOME Wayland sessions, log out and back in. On X11 you can press `Alt+F2`, type `r`, and press Enter to reload the Shell.

To verify the desktop file is present:

```bash
ls /usr/share/applications/ai-kindle.desktop
cat /usr/share/applications/ai-kindle.desktop
```

### "Double title bar" (Linux/Windows)

Fixed in **v1.2.1**. On older builds, `titleBarStyle: 'hiddenInset'` (a macOS-only option) was silently ignored on Linux, so the desktop environment drew *its* title bar on top of the in-app one. Upgrade.

### "Sharp window corners" (Linux/Windows)

Fixed in **v1.2.2**. The app now creates a transparent frameless window and the renderer paints rounded corners (auto-flat when maximized). Upgrade.

### "Failed to install: package architecture mismatch" (Linux)

The current `.deb` is **amd64 only** — won't run on `arm64` / Raspberry Pi / Apple Silicon Linux. If you need arm64, build from source (see [Build from source](/development/build-from-source)).

### "Operation not permitted" / app won't open on macOS

The build is unsigned, so first launch needs a one-time Gatekeeper override:

1. Right-click `AI Kindle.app` in `/Applications` → **Open**.
2. In the confirmation dialog, click **Open** again.
3. Subsequent launches work normally.

If that doesn't work:

```bash
xattr -dr com.apple.quarantine "/Applications/AI Kindle.app"
```

## Runtime issues

### "Failed to load PDF"

The source PDF was moved or deleted from your library folder, or its filepath in the DB points somewhere that no longer exists.

Diagnose:

```bash
# macOS
ls "$HOME/Library/Application Support/ai-kindle/library/"

# Linux
ls "$HOME/.config/ai-kindle/library/"
```

If the file is missing, re-import the original PDF. AI Kindle will create a fresh entry. If the file is present but the app says it isn't, force the relative-path migration by upgrading to v1.2.0+ — the migration runs once on startup and rewrites any stale absolute paths.

### Library is empty after upgrade / re-install

Your data lives in the user-data directory and is **never** touched by the installer. If it's gone, you probably moved or deleted the directory. Find your most recent backup tar and restore via [Syncing across devices](/guide/syncing#on-the-target-machine).

### App crashes immediately on launch

Usually a corrupt or in-flight SQLite WAL file. Close the app, then:

::: code-group

```bash [Linux]
DEST="$HOME/.config/ai-kindle"
rm -f "$DEST/ai-kindle.db-wal" "$DEST/ai-kindle.db-shm"
ai-kindle
```

```bash [macOS]
DEST="$HOME/Library/Application Support/ai-kindle"
rm -f "$DEST/ai-kindle.db-wal" "$DEST/ai-kindle.db-shm"
open -a "AI Kindle"
```

:::

SQLite will recover from the last committed transaction (you might lose the very last annotation if it was unflushed). If the app still crashes:

1. Rename the entire data directory.
2. Launch — a fresh dir is created.
3. Copy `library/` back into the new dir to recover your PDFs.

### Thumbnails are slow on first library visit

Thumbnails are generated lazily the first time you view each book card, capped at 3 in parallel. For a brand-new library of 100+ books, expect a one-time spin to generate all JPEGs. On subsequent visits they load instantly from disk.

### Zoom looks momentarily blurry after pinching

That's intentional. AI Kindle uses GPU-accelerated CSS transform during the pinch gesture so it stays at 60 fps, then re-rasterizes through pdf.js once you stop. The brief (~100 ms) blur is the previous rasterization being stretched while pdf.js renders at the new scale. Trade-off for smoothness.

### Re-imported PDF has old annotations

Fixed in recent builds. Re-imports now get a fresh id, and orphan-cleanup runs on startup. If you're on an older build, upgrade — or reset by deleting your `ai-kindle.db` (annotations will be lost; PDFs are kept).

## AI panel issues

### "Offline" / red banner after Save & Connect

The validation call to `/v1/models` failed. The banner shows the exact provider error message — read it carefully. Common causes:

| Banner message | Fix |
|---|---|
| `Incorrect API key provided` | Re-copy your key — extra whitespace and quotes are easy to miss |
| `insufficient_quota` | OpenAI account out of credits. Top it up at [platform.openai.com/account/billing](https://platform.openai.com/account/billing) |
| `404 - Resource not found` (Azure) | Wrong endpoint shape or wrong deployment name. The endpoint must be the *resource* URL (`https://your-resource.openai.azure.com/`) with no trailing path |
| `Invalid API version` (Azure) | Copy the exact `api-version` string from Azure Portal → Quotas → API versions |
| `ECONNREFUSED` / `EAI_AGAIN` | Network problem or wrong base URL — verify the URL works in a browser / `curl` |

### Streaming responses cut off mid-sentence

Usually means the provider closed the connection. Common causes:

- **Free OpenRouter models** that throttle aggressively — switch to a paid model.
- **Network proxy / VPN** that buffers SSE then times out.
- **Very long contexts** that exceed the model's max output tokens — try a smaller selection or a model with a bigger context window.

You can resume by typing `continue` in the AI chat — the model picks up where it left off.

### "Model not found" when switching

Each OpenAI account has access to different models. After saving credentials, the dropdown lists *only* the chat-capable models your account can actually use. If a familiar model is missing, your account doesn't have access — request it via OpenAI's dashboard or use a different model.

For Azure, the dropdown lists your **deployment names** (which you set yourself when creating deployments), not OpenAI model IDs.

## Performance issues

### Library scroll is choppy with 500+ books

Not expected — the grid is virtualized. Open the DevTools console (`⌘⌥I` / `Ctrl+Shift+I`) and check for errors. Also try:

```bash
# Clear the Chromium cache
rm -rf "$HOME/.config/ai-kindle/Cache" \
       "$HOME/.config/ai-kindle/Code Cache" \
       "$HOME/.config/ai-kindle/GPUCache" \
       "$HOME/.config/ai-kindle/DawnCache"
```

(macOS equivalent: same names under `~/Library/Application Support/ai-kindle/`.)

### High memory usage when reading a long PDF

Pages are rendered on demand and unmounted when far off-screen, so a 1000-page PDF should use roughly the same memory as a 50-page one. If you see steady growth as you scroll, that's a leak — please open an issue with:

- The book's page count
- Your platform + AI Kindle version
- A snapshot from the DevTools **Memory** tab

## Data and migration

### "I want to move my library to another machine"

See [Syncing across devices](/guide/syncing) — there's a full step-by-step.

### "I want a backup"

When the app is closed:

```bash
DEST="$HOME/.config/ai-kindle"   # or the macOS path
sqlite3 "$DEST/ai-kindle.db" "PRAGMA wal_checkpoint(TRUNCATE);"
tar -czf ~/ai-kindle-backup-$(date +%F).tgz \
  -C "$DEST" ai-kindle.db library thumbnails
```

### "I want to start over"

Quit the app and remove the data directory entirely. Next launch creates a fresh one.

```bash
# Linux
rm -rf "$HOME/.config/ai-kindle"

# macOS
rm -rf "$HOME/Library/Application Support/ai-kindle"
```

Originals of your PDFs are untouched — they're stored outside this directory, only **copies** live in `library/`.

## Still stuck?

Open an issue at [github.com/vishalsingha/AI_Kindle/issues](https://github.com/vishalsingha/AI_Kindle/issues) with your platform, AI Kindle version, what you did, and what happened.
