import { app, BrowserWindow, ipcMain, nativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { initDatabase, registerDatabaseHandlers } from './database'
import { registerFileHandlers, ensureLibraryDir } from './file-manager'
import { registerOpenAIHandlers } from './openai'
import { registerWebSearchHandlers } from './web-search'
import { registerPDFExportHandlers } from './pdf-export'

let mainWindow: BrowserWindow | null = null

/**
 * Resolve the path to resources/icon.png in both dev and packaged builds.
 *
 *   - Dev/preview: the compiled main file lives at `out/main/index.js`;
 *     the repo's `resources/` folder is two levels up.
 *   - Packaged: electron-builder copies `resources/icon.png` into the
 *     app's Resources directory via the `extraResources` config, so the
 *     file is available at `process.resourcesPath/icon.png` at runtime.
 */
function resolveIconPath(): string | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'icon.png')]
    : [
        join(__dirname, '../../resources/icon.png'),
        join(process.cwd(), 'resources/icon.png')
      ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function createWindow(): void {
  const iconPath = resolveIconPath()
  // nativeImage tolerates a missing file by returning an empty image, but
  // we still guard with existsSync above so BrowserWindow falls back to
  // Electron's default if the user ever removes resources/icon.png.
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : null

  // Per-platform window chrome:
  //   macOS   → hidden-inset titlebar so the native trafficlight buttons
  //             float over our custom <Titlebar />. Corners are rounded
  //             natively by the OS.
  //   Linux   → no native frame + transparent surface, so CSS in the
  //             renderer can paint rounded corners. Without `transparent`
  //             the renderer's background would fill the corners and
  //             border-radius would be invisible.
  //   Windows → same as Linux for the same reasons.
  const isDarwin = process.platform === 'darwin'
  const platformChrome = isDarwin
    ? ({
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 15, y: 15 },
        backgroundColor: '#FEFCF3'
      } as const)
    : ({
        frame: false,
        transparent: true,
        // No backgroundColor on transparent windows: any non-zero alpha here
        // would paint behind the renderer and defeat the corner rounding.
        hasShadow: true
      } as const)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...(icon && !icon.isEmpty() ? { icon } : {}),
    ...platformChrome,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  })

  // Tell the renderer when the maximized state changes so it can drop
  // the corner rounding while maximized (otherwise the rounded corners
  // get cropped at the screen edges and look broken).
  const sendMaxState = (): void => {
    mainWindow?.webContents.send('window:maximized-changed', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', sendMaxState)
  mainWindow.on('unmaximize', sendMaxState)
  mainWindow.on('enter-full-screen', sendMaxState)
  mainWindow.on('leave-full-screen', sendMaxState)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // DevTools are not opened automatically on startup. Press
    //   macOS:   ⌥⌘I (or View → Toggle Developer Tools)
    //   Windows: Ctrl+Shift+I
    // when you need them.
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // macOS uses a separate Dock icon that must be set explicitly — the
  // BrowserWindow `icon` option alone doesn't update it.
  if (process.platform === 'darwin' && app.dock) {
    const iconPath = resolveIconPath()
    if (iconPath) {
      const dockIcon = nativeImage.createFromPath(iconPath)
      if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon)
    }
  }

  initDatabase()
  await ensureLibraryDir()

  registerDatabaseHandlers()
  registerFileHandlers()
  registerOpenAIHandlers()
  registerWebSearchHandlers()
  registerPDFExportHandlers()

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () =>
    Boolean(mainWindow?.isMaximized() || mainWindow?.isFullScreen())
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
