# Installation

AI Kindle ships **prebuilt installers** for Linux and macOS via [GitHub Releases](https://github.com/vishalsingha/AI_Kindle/releases). Pick your platform below.

> **TL;DR**: open a terminal, run two commands, app appears in your launcher. Your data never leaves your machine.

[[toc]]

## System requirements

| Platform | Minimum |
|---|---|
| **macOS** | 11 Big Sur+ (Apple Silicon or Intel) |
| **Linux** | Ubuntu 20.04+ / Debian 11+ / any glibc-based distro for AppImage |
| **Windows** | Currently best installed from source — native installers coming soon |
| **Disk** | ~250 MB for the app, plus space for your PDF library |
| **RAM** | 1 GB available (Electron app); ~2 GB recommended when reading large PDFs |

::: tip Optional
You only need an **OpenAI** or **Azure OpenAI** API key if you want AI summaries / explanations / chat. Reading, annotating, and notes work fully offline without one.
:::

## Ubuntu / Debian (.deb)

The recommended path on Debian-family Linux. Installs system-wide, integrates with your app launcher, and includes a clean `ai-kindle` binary in `PATH`.

```bash
VERSION=1.2.3   # check https://github.com/vishalsingha/AI_Kindle/releases for the latest

wget -O "/tmp/ai-kindle_${VERSION}_amd64.deb" \
  "https://github.com/vishalsingha/AI_Kindle/releases/download/v${VERSION}/ai-kindle_${VERSION}_amd64.deb"

sudo apt install -y "/tmp/ai-kindle_${VERSION}_amd64.deb"
```

After install:

- The app appears in **Activities / app launcher** — search for "AI Kindle" or "PDF".
- Right-click any `.pdf` in Files / Nautilus → **Open With** → **AI Kindle**.
- Launch from a terminal with `ai-kindle`.

::: details Don't see it in the launcher right away?
Force a desktop database refresh:

```bash
sudo update-desktop-database /usr/share/applications
sudo gtk-update-icon-cache -f -t /usr/share/icons/hicolor
```

On Wayland sessions, log out and back in. Make sure you're on v1.2.3+ — older builds shipped a sparse `.desktop` file.
:::

### One-command updates

Drop this script into `~/.local/bin/update-ai-kindle`, make it executable, and you're done:

```bash
#!/usr/bin/env bash
# Install the latest AI Kindle .deb from GitHub releases.
set -euo pipefail
REPO="vishalsingha/AI_Kindle"
ARCH="${ARCH:-amd64}"

TAG=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | sed -nE 's/.*"tag_name": *"(v[^"]+)".*/\1/p' | head -n1)
VERSION="${TAG#v}"

INSTALLED=$(dpkg-query -W -f='${Version}' ai-kindle 2>/dev/null || echo "none")
if [[ "$INSTALLED" == "$VERSION" ]]; then
  echo "Already on $VERSION."; exit 0
fi

DEB="ai-kindle_${VERSION}_${ARCH}.deb"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fL --progress-bar -o "$TMP/$DEB" \
  "https://github.com/$REPO/releases/download/$TAG/$DEB"
sudo apt install -y "$TMP/$DEB"
echo "Now on $(dpkg-query -W -f='${Version}' ai-kindle)."
```

Then upgrades are just:

```bash
chmod +x ~/.local/bin/update-ai-kindle
update-ai-kindle
```

You can wire it into cron for daily checks:

```bash
( crontab -l 2>/dev/null; echo "0 9 * * * $HOME/.local/bin/update-ai-kindle >/dev/null 2>&1" ) | crontab -
```

## Any Linux (AppImage)

If you're not on Debian/Ubuntu, or you want a portable copy that doesn't need root:

```bash
VERSION=1.2.3
mkdir -p ~/Apps

wget -O "$HOME/Apps/AI_Kindle-${VERSION}.AppImage" \
  "https://github.com/vishalsingha/AI_Kindle/releases/download/v${VERSION}/AI%20Kindle-${VERSION}.AppImage"

chmod +x "$HOME/Apps/AI_Kindle-${VERSION}.AppImage"
"$HOME/Apps/AI_Kindle-${VERSION}.AppImage"
```

The AppImage is self-contained — runs on any modern glibc-based distro without installing anything system-wide. To upgrade, download a newer `.AppImage` and overwrite. To uninstall, just delete the file.

::: tip Integrate AppImage with your launcher
Tools like [`appimaged`](https://github.com/probonopd/go-appimage) auto-create desktop entries for AppImages in `~/Applications` so they show up in your app launcher.
:::

## macOS

1. Download the latest `.dmg` from [Releases](https://github.com/vishalsingha/AI_Kindle/releases). Pick:
   - `AI Kindle-{version}-arm64.dmg` for **Apple Silicon** (M1/M2/M3/M4).
   - `AI Kindle-{version}-x64.dmg` for **Intel** Macs.
2. Open the DMG and drag **AI Kindle.app** into `/Applications`.
3. First launch: **right-click → Open → Open** in the confirmation dialog (the build is unsigned, so macOS asks once).
4. Subsequent launches work from Spotlight, Launchpad, or the dock as normal.

::: warning Unsigned build
Until the project is code-signed with an Apple Developer certificate, every fresh download triggers Gatekeeper. The right-click trick is a one-time bypass per `.app` file — it's not insecure, just inconvenient.
:::

To upgrade, drag the new `.app` over the old one in `/Applications`. Your user data in `~/Library/Application Support/ai-kindle/` is untouched.

## Windows

A native `.exe` / NSIS installer is in the project's build config but isn't yet attached to releases. Until that ships, see [Build from source](/development/build-from-source) for running on Windows.

## Build from source

If you'd rather not run a binary you didn't build, or you're on Windows, or you want to hack on AI Kindle yourself — see [Build from source](/development/build-from-source).

## What's next

Once you have it installed:

- **Add some books** → [Quick start](/guide/quickstart) walks through your first import, highlight, and AI chat.
- **Configure AI** (optional) → [Configuration](/guide/configuration) covers OpenAI and Azure setup.
- **Already familiar?** → [Usage](/guide/usage) is the feature-by-feature reference.
