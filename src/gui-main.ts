import { app, BrowserWindow, ipcMain, shell, IpcMainInvokeEvent, nativeTheme } from 'electron'
import * as path from 'path'
import { applyPatch, getApplicationSnapshot, restoreOriginal } from './application'
import { findInstalls } from './locator'
import { GuiAction, GuiActionResult, GuiResponse, GuiState } from './gui-contract'

const REPOSITORY_URL = 'https://github.com/PhonetoFR/githubdesktop-zh'
let mainWindow: BrowserWindow | null = null
let operationRunning = false

function getGuiState(): GuiState {
  const { installs } = findInstalls()
  return {
    ...getApplicationSnapshot(installs),
    toolVersion: app.getVersion(),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  return mainWindow !== null &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame
}

function registerIpc(): void {
  ipcMain.handle('app:get-state', (event): GuiResponse<GuiState> => {
    if (!isTrustedSender(event)) {return { ok: false, error: '已拒绝非界面来源的请求。' }}
    try {
      return { ok: true, data: getGuiState() }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(
    'app:run-action',
    (event, action: GuiAction, version: string): GuiResponse<GuiActionResult> => {
      if (!isTrustedSender(event)) {
        return { ok: false, error: '已拒绝非界面来源的请求。' }
      }
      if ((action !== 'patch' && action !== 'restore') ||
        typeof version !== 'string' || version.length === 0) {
        return { ok: false, error: '无效的操作请求。' }
      }
      if (operationRunning) {
        return { ok: false, error: '已有操作正在进行，请稍候。' }
      }

      operationRunning = true
      try {
        const { installs } = findInstalls()
        let message: string
        if (action === 'patch') {
          applyPatch(installs, version)
          message = `GitHub Desktop v${version} 汉化完成。`
        } else {
          restoreOriginal(installs, version)
          message = `GitHub Desktop v${version} 已还原为英文。`
        }
        return {
          ok: true,
          data: { message, state: getGuiState() },
        }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      } finally {
        operationRunning = false
      }
    }
  )

  ipcMain.handle('app:open-repository', async (event): Promise<void> => {
    if (!isTrustedSender(event)) {throw new Error('已拒绝非界面来源的请求。')}
    await shell.openExternal(REPOSITORY_URL)
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 980,
    height: 650,
    minWidth: 820,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f3f6fa',
    title: 'GitHub Desktop 汉化补丁',
    icon: path.join(__dirname, '..', 'gui', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f3f6fa',
      symbolColor: '#1f2328',
      height: 48,
    },
    webPreferences: {
      preload: path.join(__dirname, 'gui-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) {mainWindow = null}
  })

  function updateOverlay() {
    if (!window || window.isDestroyed()) {return}
    const dark = nativeTheme.shouldUseDarkColors
    window.setTitleBarOverlay({
      color: dark ? '#0d1117' : '#f3f6fa',
      symbolColor: dark ? '#e6edf3' : '#1f2328',
      height: 48,
    })
    window.setBackgroundColor(dark ? '#0d1117' : '#f3f6fa')
  }

  updateOverlay()
  nativeTheme.on('updated', updateOverlay)
  window.on('closed', () => { nativeTheme.off('updated', updateOverlay) })

  void window.loadFile(path.join(__dirname, '..', 'gui', 'index.html'))
  mainWindow = window
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {return}
    if (mainWindow.isMinimized()) {mainWindow.restore()}
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    registerIpc()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {createWindow()}
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {app.quit()}
  })
}
