import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'path'
import { closeDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { IPC } from '@shared/ipc'

// A saida padrao pode estar com o pipe fechado (AppImage aberto pelo menu,
// terminal que ja fechou, saida redirecionada). O proprio Electron faz um
// console.error ao responder um IPC com erro, e esse write com EPIPE virava
// "Uncaught Exception: write EPIPE" com o dialogo "A JavaScript error
// occurred in the main process". Sem listener de 'error' o stream lanca;
// com ele, o EPIPE e ignorado e o resto segue o comportamento padrao.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code !== 'EPIPE') throw err
  })
}

const isDev = !app.isPackaged

// Em desenvolvimento no Linux, o sandbox setuid do Chromium exige que o binario
// chrome-sandbox pertenca ao root (mode 4755). Para evitar a necessidade de sudo
// a cada reinstalacao, desabilitamos o sandbox apenas no modo dev.
if (isDev && process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-setuid-sandbox')
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'LivreAnalise',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const send = (channel: string): void => {
    mainWindow.webContents.send(channel, channel)
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'View',
        submenu: [
          { label: 'Ampliar', accelerator: 'CmdOrCtrl+Plus', click: () => send(IPC.view.zoomIn) },
          { label: 'Reduzir', accelerator: 'CmdOrCtrl+-', click: () => send(IPC.view.zoomOut) },
          { label: 'Restaurar zoom', accelerator: 'CmdOrCtrl+0', click: () => send(IPC.view.resetZoom) },
          { type: 'separator' },
          { label: 'Fonte sem serifa', type: 'radio', click: () => send(IPC.view.fontSans) },
          { label: 'Fonte com serifa', type: 'radio', click: () => send(IPC.view.fontSerif) },
          { label: 'Fonte para dislexia (OpenDyslexic)', type: 'radio', click: () => send(IPC.view.fontDyslexic) }
        ]
      }
    ])
  )

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})
