# Syncing across devices

AI Kindle has no built-in sync server. But because the user-data directory is a **self-contained, portable folder** (since v1.2.0), moving your library between devices is straightforward.

The two practical options:

1. **Manual transfer** — pack as a tar, upload to Google Drive / iCloud / a USB drive / `scp`, restore on the other side. Best for one-shot migrations.
2. **Continuous sync** — point both devices' data dirs at the same Syncthing / Dropbox folder. Best for "I want my annotations on every machine."

[[toc]]

## Why it works

Since v1.2.0, AI Kindle stores every PDF filepath in the database as just the **filename**, not an absolute path. At read time the filename is resolved against the *current* machine's library directory. The same DB row points to:

| Machine | Resolved path |
|---|---|
| macOS | `~/Library/Application Support/ai-kindle/library/abc123.pdf` |
| Linux | `~/.config/ai-kindle/library/abc123.pdf` |
| Windows | `%APPDATA%\ai-kindle\library\abc123.pdf` |

Copy the `library/` folder + the `ai-kindle.db` file between machines and every annotation, conversation, and note resolves correctly on the other side.

::: tip
If you're upgrading from a pre-v1.2.0 install, the migration runs automatically on first launch and rewrites any absolute paths to basenames. Idempotent — runs once and is a no-op after.
:::

## Option 1: Manual transfer (one-shot)

Best for "I'm setting up my new Ubuntu machine and want my existing Mac library."

### On the source machine

Quit AI Kindle, checkpoint the SQLite write-ahead log, and pack everything into a single tar.gz:

::: code-group

```bash [macOS source]
osascript -e 'quit app "AI Kindle"' 2>/dev/null
sleep 2

SRC="$HOME/Library/Application Support/ai-kindle"
sqlite3 "$SRC/ai-kindle.db" "PRAGMA wal_checkpoint(TRUNCATE);"
tar -czf ~/Desktop/ai-kindle-data.tgz \
  -C "$SRC" ai-kindle.db library thumbnails

du -h ~/Desktop/ai-kindle-data.tgz
```

```bash [Linux source]
pkill -f ai-kindle || true
sleep 2

SRC="$HOME/.config/ai-kindle"
sqlite3 "$SRC/ai-kindle.db" "PRAGMA wal_checkpoint(TRUNCATE);"
tar -czf ~/ai-kindle-data.tgz \
  -C "$SRC" ai-kindle.db library thumbnails

du -h ~/ai-kindle-data.tgz
```

:::

You'll get a `~250 MB` tar (for a 222 MB library — PDFs are already pretty compressed). Skipped: Chromium caches, Preferences (Mac-specific window state), the encrypted API key (which is bound to the source OS's keychain anyway).

### Move the archive

Any of:

- Drag into Google Drive's web UI, download on the other side.
- `scp ~/Desktop/ai-kindle-data.tgz user@ubuntu-box:~/`
- USB drive.
- Dropbox / OneDrive shared folder.

### On the target machine

1. Install AI Kindle ([Installation](/guide/installation)).
2. Launch once and close — that creates the empty user-data directory.
3. Extract:

::: code-group

```bash [Linux target]
pkill -f ai-kindle || true
sleep 2

DEST="$HOME/.config/ai-kindle"
mv "$DEST/ai-kindle.db" "$DEST/ai-kindle.db.fresh.bak" 2>/dev/null || true
rm -f "$DEST/ai-kindle.db-wal" "$DEST/ai-kindle.db-shm"

tar -xzf ~/Downloads/ai-kindle-data.tgz -C "$DEST"

ai-kindle
```

```bash [macOS target]
osascript -e 'quit app "AI Kindle"' 2>/dev/null
sleep 2

DEST="$HOME/Library/Application Support/ai-kindle"
mv "$DEST/ai-kindle.db" "$DEST/ai-kindle.db.fresh.bak" 2>/dev/null || true
rm -f "$DEST/ai-kindle.db-wal" "$DEST/ai-kindle.db-shm"

tar -xzf ~/Downloads/ai-kindle-data.tgz -C "$DEST"

open -a "AI Kindle"
```

:::

When the app opens, every book, annotation, conversation, and note is there. The only thing you'll need to redo is **paste your AI API key** — its encrypted blob was OS-specific.

### Re-running the sync

Just repeat the same flow whenever you want to push fresh data: pack on the source, transfer, extract on the target. The extract overwrites the DB, so the target ends up identical to the source.

## Option 2: Continuous sync via Syncthing

Best for "I read on my Mac at home and my Linux laptop at work, and I want annotations made on either to show up on both."

Idea: keep the data dir in a folder that's auto-synced between devices. Symlink AI Kindle's expected user-data path to that folder.

### On every device, after installing AI Kindle once

::: code-group

```bash [macOS device]
# Stop AI Kindle first
osascript -e 'quit app "AI Kindle"' 2>/dev/null
sleep 2

# Move data into Syncthing's shared folder (one device only — copy, then on
# other devices replace instead of move)
mv "$HOME/Library/Application Support/ai-kindle" \
   "$HOME/Sync/ai-kindle"

# Replace the expected path with a symlink
ln -s "$HOME/Sync/ai-kindle" \
      "$HOME/Library/Application Support/ai-kindle"
```

```bash [Linux device]
pkill -f ai-kindle || true
sleep 2

# After the FIRST machine has populated ~/Sync/ai-kindle via Syncthing:
rm -rf "$HOME/.config/ai-kindle"
ln -s "$HOME/Sync/ai-kindle" "$HOME/.config/ai-kindle"
```

:::

Configure Syncthing to share `~/Sync/ai-kindle` between the devices. Now every annotation, conversation, and note made on either machine appears on the other within seconds.

### Important caveats

::: warning One device at a time
**SQLite can corrupt if two processes write to the database concurrently** — even through a sync layer. Don't run AI Kindle on both machines at the same time. Close it on machine A before opening it on machine B.
:::

::: tip Other sync tools
You can use Dropbox, iCloud Drive (Mac-only), Resilio Sync, Nextcloud, rclone bisync, or anything else that gives you a shared folder. Syncthing is recommended because it's peer-to-peer (no cloud middleman), free, and works on every desktop OS.
:::

### Disabling

To stop syncing on one device, remove the symlink and move the data back to the canonical path:

```bash
# Linux example
rm "$HOME/.config/ai-kindle"   # remove the symlink, not the contents
cp -r "$HOME/Sync/ai-kindle" "$HOME/.config/ai-kindle"
```

The other devices keep using the shared folder. The detached device now has its own independent copy.

## What about the API key?

The AI provider key is encrypted with each OS's native secrets store (Keychain / DPAPI / libsecret) and **cannot** decrypt on a different machine, even of the same OS. After any cross-machine transfer, just pop open the AI panel and re-paste it once.

The clear key never touches disk — only the encrypted blob lives in `ai-kindle.db`. You can verify this:

```bash
sqlite3 ~/.config/ai-kindle/ai-kindle.db \
  "SELECT key, length(value) FROM settings WHERE key LIKE 'ai.apiKey%';"
```

You'll see the encrypted length but no usable plaintext.
