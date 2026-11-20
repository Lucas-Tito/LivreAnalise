import { EventEmitter } from 'events'
import { beforeEach, expect, it, vi } from 'vitest'
import { IPC } from '../src/shared/ipc'

const state = vi.hoisted(() => ({
  windows: [] as any[], app: null as any, ipc: null as any,
  closeDb: vi.fn(), active: false, cancel: vi.fn(), confirm: vi.fn(), openExternal: vi.fn(async () => {})
}))
vi.mock('../resources/icon.png?asset', () => ({ default: '' }))
vi.mock('../src/main/db', () => ({ closeDatabase: state.closeDb }))
vi.mock('../src/main/ipc', () => ({ registerIpcHandlers: vi.fn() }))
vi.mock('../src/main/ipc/transcription', () => ({
  hasTranscriptionOperation: () => state.active, cancelTranscriptionOperations: state.cancel
}))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('events')
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true, whenReady: () => Promise.resolve(), quit: vi.fn(), commandLine: { appendSwitch: vi.fn() }
  })
  const ipcMain = new EventEmitter()
  state.app = app; state.ipc = ipcMain
  class Window extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { send: vi.fn(), setWindowOpenHandler: vi.fn() })
    close = vi.fn()
    show = vi.fn()
    loadFile = vi.fn()
    options: any
    constructor(options: any) { super(); this.options = options; state.windows.push(this) }
    static fromWebContents() { return state.windows[0] }
    static getAllWindows() { return state.windows }
  }
  return {
    app, ipcMain, BrowserWindow: Window,
    Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() }, shell: { openExternal: state.openExternal },
    dialog: { showMessageBox: state.confirm, showErrorBox: vi.fn() }
  }
})

beforeEach(async () => {
  vi.clearAllMocks()
  if (state.windows.length === 0) await import('../src/main/index')
  state.active = false
  state.ipc.emit(IPC.app.textDirty, {}, false)
  state.ipc.emit(IPC.app.notesDirty, {}, false)
  state.ipc.emit(IPC.app.cancelClose)
})

it('keeps the database open during quit confirmation and closes only on will-quit', () => {
  state.ipc.emit(IPC.app.notesDirty, {}, true)
  state.app.emit('before-quit')
  const preventDefault = vi.fn()
  state.windows[0].emit('close', { preventDefault })
  expect(preventDefault).toHaveBeenCalled()
  expect(state.closeDb).not.toHaveBeenCalled()
  expect(state.windows[0].webContents.send).toHaveBeenCalledWith(IPC.app.closeRequested)
  state.ipc.emit(IPC.app.confirmClose, { sender: {} })
  expect(state.app.quit).toHaveBeenCalled()
  state.app.emit('will-quit')
  expect(state.closeDb).toHaveBeenCalledTimes(1)
})

it('waits for process cleanup before closing a window with an active operation', async () => {
  state.active = true
  state.confirm.mockResolvedValue({ response: 1 })
  let finish!: () => void
  state.cancel.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
  state.windows[0].emit('close', { preventDefault: vi.fn() })
  await vi.waitFor(() => expect(state.cancel).toHaveBeenCalled())
  expect(state.windows[0].close).not.toHaveBeenCalled()
  state.active = false
  finish()
  await vi.waitFor(() => expect(state.windows[0].close).toHaveBeenCalled())
})

it('keeps the preload sandboxed and does not navigate to remote content', () => {
  expect(state.windows[0].options.webPreferences.sandbox).toBe(true)
  expect(state.app.commandLine.appendSwitch).not.toHaveBeenCalledWith('no-sandbox')
  expect(state.app.commandLine.appendSwitch).not.toHaveBeenCalledWith('disable-setuid-sandbox')
  const preventDefault = vi.fn()
  state.windows[0].webContents.emit('will-navigate', { preventDefault }, 'https://example.org')
  expect(preventDefault).toHaveBeenCalled()
  expect(state.openExternal).toHaveBeenCalledWith('https://example.org')
})

it('does not send local or executable URL schemes to the operating system', () => {
  const preventDefault = vi.fn()
  state.windows[0].webContents.emit('will-navigate', { preventDefault }, 'file:///etc/passwd')
  state.windows[0].webContents.emit('will-navigate', { preventDefault }, 'javascript:alert(1)')
  expect(state.openExternal).not.toHaveBeenCalled()
})
