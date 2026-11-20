import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'path'
import { closeDatabase } from './db'
import { registerIpcHandlers } from './ipc'
import { IPC } from '@shared/ipc'
import icon from '../../resources/icon.png?asset'
import { cancelTranscriptionOperations, hasTranscriptionOperation } from './ipc/transcription'

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

const FONT_ITEM = {
  sans: 'view-font-sans',
  serif: 'view-font-serif',
  dyslexic: 'view-font-dyslexic'
} as const

// O renderer avisa a fonte guardada ao iniciar e a cada troca; sem isto o menu
// abria sempre com os tres radios apagados.
ipcMain.on(IPC.view.fontChanged, (_e, font: string) => {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  for (const [chave, id] of Object.entries(FONT_ITEM)) {
    const item = menu.getMenuItemById(id)
    if (item) item.checked = chave === font
  }
})

// Texto do documento em edição e ainda não salvo (#31). Só com isto ligado o
// fechar da janela vira pergunta: sem pendência ele segue direto, e um renderer
// travado nunca deixa a janela impossível de fechar.
let textoPendente = false
let notasPendentes = false
let memoPendente = false
let quitting = false
ipcMain.on(IPC.app.notesDirty, (_e, dirty: boolean) => {
  notasPendentes = dirty
})
ipcMain.on(IPC.app.textDirty, (_e, dirty: boolean) => {
  textoPendente = dirty
})
ipcMain.on(IPC.app.memoDirty, (_e, dirty: boolean) => { memoPendente = dirty })
ipcMain.on(IPC.app.confirmClose, (e) => {
  textoPendente = false
  notasPendentes = false
  memoPendente = false
  if (quitting) app.quit()
  else BrowserWindow.fromWebContents(e.sender)?.close()
})
ipcMain.on(IPC.app.cancelClose, () => { quitting = false })

const isDev = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'LivreAnalise',
    // No Linux o ícone da janela não vem do pacote: o AppImage não instala um
    // .desktop, e sem isto a barra de tarefas mostra um ícone genérico (#40).
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  let stoppingOperation = false
  mainWindow.on('close', (e) => {
    if (textoPendente || notasPendentes || memoPendente) {
      e.preventDefault()
      mainWindow.webContents.send(IPC.app.closeRequested)
      return
    }
    if (!hasTranscriptionOperation()) return
    e.preventDefault()
    if (stoppingOperation) return
    stoppingOperation = true
    void (async () => {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: 'question', title: 'Operação em andamento',
        message: 'Cancelar a transcrição ou download antes de sair?',
        detail: 'O processamento será interrompido. Áudio temporário será removido; downloads parciais poderão ser retomados.',
        buttons: ['Continuar trabalhando', 'Cancelar operação e sair'], defaultId: 0, cancelId: 0
      })
      if (answer.response !== 1) { quitting = false; return }
      await cancelTranscriptionOperations()
      if (quitting) app.quit()
      else mainWindow.close()
    })().catch((error) => {
      quitting = false
      dialog.showErrorBox('Não foi possível sair', String(error))
    }).finally(() => { stoppingOperation = false })
  })
  mainWindow.webContents.on('render-process-gone', () => {
    textoPendente = false
    notasPendentes = false
    memoPendente = false
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalLink(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    openExternalLink(url)
  })

  // Resolve a janela na hora do clique: capturar `mainWindow` fazia o menu
  // sobreviver ao fechamento dela no macOS (onde o app segue no Dock) e o
  // proximo clique lancava "Object has been destroyed" no processo principal.
  const send = (channel: string): void => {
    const alvo = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!alvo || alvo.isDestroyed()) return
    alvo.webContents.send(channel, channel)
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [{ role: 'appMenu' as const }, { role: 'editMenu' as const }]
        : []),
      {
        label: 'Exibir',
        submenu: [
          { label: 'Ampliar', accelerator: 'CmdOrCtrl+Plus', click: () => send(IPC.view.zoomIn) },
          { label: 'Reduzir', accelerator: 'CmdOrCtrl+-', click: () => send(IPC.view.zoomOut) },
          { label: 'Restaurar zoom', accelerator: 'CmdOrCtrl+0', click: () => send(IPC.view.resetZoom) },
          { type: 'separator' },
          // `checked` vem do renderer (IPC.view.fontChanged): o main nao tem
          // acesso ao localStorage onde a escolha fica guardada, e sem isso os
          // radios nunca marcavam -- o menu mentia sobre o proprio estado.
          { id: FONT_ITEM.sans, label: 'Fonte sem serifa', type: 'radio', click: () => send(IPC.view.fontSans) },
          { id: FONT_ITEM.serif, label: 'Fonte com serifa', type: 'radio', click: () => send(IPC.view.fontSerif) },
          { id: FONT_ITEM.dyslexic, label: 'Fonte para dislexia (OpenDyslexic)', type: 'radio', click: () => send(IPC.view.fontDyslexic) }
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

function openExternalLink(url: string): void {
  try {
    if (!['https:', 'http:'].includes(new URL(url).protocol)) return
    void shell.openExternal(url).catch((error) => console.error('Não foi possível abrir o link:', error))
  } catch {
    // URLs inválidas e protocolos locais nunca são enviados ao sistema.
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
  quitting = true
})

app.on('will-quit', () => {
  closeDatabase()
})
