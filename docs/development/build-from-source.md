# Build from source

For Windows users (no prebuilt installer yet), contributors, and anyone who'd rather not run a binary they didn't build.

[[toc]]

## Prerequisites

| Tool | Version | How to get it |
|---|---|---|
| **Node.js** | 18 or later | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| **npm** | Comes with Node | — |
| **git** | Any modern version | Most OSes ship it; on Mac, install via Xcode CLT |
| **Python 3** + a C++ toolchain | For native module compilation (`better-sqlite3`) | See platform notes below |

### Native module toolchain

`better-sqlite3` is a compiled C++ module. `npm install` will compile it locally for your Electron's Node ABI.

::: code-group

```bash [Ubuntu / Debian]
sudo apt install -y build-essential python3
```

```bash [Fedora]
sudo dnf install -y @development-tools python3
```

```bash [macOS]
# Xcode Command Line Tools provide the toolchain
xcode-select --install
```

```bash [Windows]
# Run as Administrator. Installs MSVC build tools + Python.
npm install -g windows-build-tools
```

:::

## Clone and install

```bash
git clone https://github.com/vishalsingha/AI_Kindle.git
cd AI_Kindle
npm install
```

The `postinstall` hook runs `electron-builder install-app-deps`, which rebuilds `better-sqlite3` against Electron's Node ABI. If that step fails, you're missing a toolchain piece — re-check the table above.

## Run in development

```bash
npm run dev
```

This starts:

- The main process via `electron-vite`, with hot-restart on file changes.
- The renderer via Vite with HMR — React component edits hot-swap without losing app state.
- The preload bundle, which reloads when its source changes.

DevTools open with `⌘⌥I` (macOS) or `Ctrl+Shift+I` (Linux/Windows).

The dev build uses the same user-data directory as production (`~/.config/ai-kindle/` etc.), so any books or annotations you make in dev are real and persist. If you'd rather keep them separate, set:

```bash
ELECTRON_RUN_AS_NODE=0 \
  ELECTRON_USER_DATA_OVERRIDE="$HOME/.config/ai-kindle-dev" \
  npm run dev
```

(You'll need to plumb that env var through `src/main/index.ts` first — see the `app.setPath('userData', …)` Electron API.)

## Build a packaged app (no installer)

```bash
npm run pack
```

Output goes to `release/` as an unpacked app directory you can run directly:

::: code-group

```bash [Linux]
./release/linux-unpacked/ai-kindle
```

```bash [macOS]
open "release/mac-arm64/AI Kindle.app"
```

```bash [Windows]
./release/win-unpacked/AI\ Kindle.exe
```

:::

Useful for sanity-checking production builds without the overhead of producing installers.

## Build installers

| Command | What you get |
|---|---|
| `npm run dist` | All targets for your current platform |
| `npm run dist:linux` | `.deb` + `.AppImage` (Linux x64) |
| `npm run dist:mac` | `.dmg` + `.zip` for arm64 *and* x64 |
| `npm run dist:win` | `.exe` NSIS installer + portable build |

::: warning Cross-building has caveats
- **Linux from macOS** — `dpkg` and `fakeroot` aren't installed by default. Easier to let GitHub Actions handle it (see `.github/workflows/build-linux.yml`).
- **macOS from non-macOS** — basically impossible; the toolchain only runs on macOS.
- **Windows from non-Windows** — possible with Wine, but a real Windows VM or GitHub runner is easier.

The CI workflow in this repo builds Linux installers on every `v*` tag push.
:::

## Run the docs site locally

The docs site (this site!) is also in the repo. To work on it:

```bash
npm run docs:dev      # Vite dev server with hot reload
npm run docs:build    # production build to docs/.vitepress/dist
npm run docs:preview  # serve the production build for verification
```

Edit any markdown file under `docs/` and the dev server hot-reloads. The site config lives at `docs/.vitepress/config.ts`.

The docs are deployed to GitHub Pages automatically on every push to `main` via `.github/workflows/deploy-docs.yml`.

## Project structure

See [Architecture](/development/architecture) for a full tour. Quick map:

```text
.
├── src/                  Electron + React app source
│   ├── main/             Node-side: SQLite, file I/O, AI client
│   ├── preload/          contextBridge surface (window.api)
│   └── renderer/         React UI
├── docs/                 VitePress docs site (this site)
├── resources/            App icon, entitlements
├── electron.vite.config.ts  Build config (main / preload / renderer)
├── electron-builder.yml     Installer config (mac / linux / win targets)
└── .github/workflows/    CI for installers and docs
```

## Submitting changes

1. Fork → branch → commit → push.
2. Open a PR against `main`.
3. CI will type-check (`tsc --noEmit`) and run the linux build to catch regressions.
4. Keep commits focused: one logical change per commit, with a descriptive message body explaining the *why*.

There's no formal style guide, but a few notes:

- TypeScript strict mode is on. No `any` unless it's truly justified and commented.
- Components are functional + hooks. State lives in Zustand stores, not prop drills.
- All Electron IPC goes through `preload/index.ts` (typed in `preload/index.d.ts`); never `ipcRenderer` from the renderer.
- Tailwind for styling. Component-scoped CSS only when Tailwind is genuinely insufficient.

## Releasing (maintainers)

1. Bump `package.json` `version`.
2. Commit (`chore: release vX.Y.Z`).
3. Tag (`git tag -a vX.Y.Z -m "..."`).
4. Push tag (`git push origin vX.Y.Z`).
5. GitHub Actions builds the Linux installers and attaches them to a new release at `github.com/vishalsingha/AI_Kindle/releases/tag/vX.Y.Z`.

(macOS installers currently need to be built locally and uploaded by hand — automating that is a future task that requires Apple Developer credentials.)
