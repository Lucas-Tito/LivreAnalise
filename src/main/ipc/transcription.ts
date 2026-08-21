import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  TranscriptionEnv,
  TranscriptionModel,
  TranscriptionStartInput
} from '@shared/types'
import {
  DEFAULT_MODEL_ID,
  WHISPER_MODELS,
  downloadModel,
  fetchModelSize,
  modelById,
  modelUrl
} from '../services/whisperModels'
import {
  assetForPlatform,
  downloadWhisperBinary,
  modelIsReady,
  modelPath,
  resolveWhisperBinary
} from '../services/whisperBinary'
import {
  TranscriptionRun,
  ffmpegAvailable,
  type TranscriptionEvent
} from '../services/transcription'

type BroadcastEvent =
  | TranscriptionEvent
  | {
      kind: 'download'
      what: 'modelo' | 'programa'
      receivedBytes: number
      totalBytes: number
    }

let currentRun: TranscriptionRun | null = null
let currentDownload: AbortController | null = null

function broadcast(event: BroadcastEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.transcription.event, event)
  }
}

export function registerTranscriptionHandlers(): void {
  ipcMain.handle(IPC.transcription.env, async (): Promise<TranscriptionEnv> => ({
    ffmpeg: ffmpegAvailable(),
    binaryPath: resolveWhisperBinary(null),
    canDownloadBinary: assetForPlatform() !== null,
    defaultModelId: DEFAULT_MODEL_ID
  }))

  ipcMain.handle(IPC.transcription.models, async (): Promise<TranscriptionModel[]> =>
    WHISPER_MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      approxBytes: model.approxBytes,
      ready: modelIsReady(model.file)
    }))
  )

  ipcMain.handle(IPC.transcription.pickMedia, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar audio ou video',
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio e video',
          extensions: [
            'mp4', 'mp3', 'wav', 'm4a', 'aac', 'ogg',
            'opus', 'flac', 'mkv', 'mov', 'avi', 'webm'
          ]
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // O tamanho exato vem do servidor: a UI pergunta antes de baixar mostrando
  // numero real, nao estimativa.
  ipcMain.handle(IPC.transcription.modelSize, async (_e, modelId: string) => {
    const model = modelById(modelId)
    const size = await fetchModelSize(modelUrl(model))
    return size ?? model.approxBytes
  })

  ipcMain.handle(IPC.transcription.downloadModel, async (_e, modelId: string) => {
    const model = modelById(modelId)
    currentDownload = new AbortController()
    try {
      await downloadModel(
        modelUrl(model),
        modelPath(model.file),
        (progress) => broadcast({ kind: 'download', what: 'modelo', ...progress }),
        currentDownload.signal
      )
      return true
    } finally {
      currentDownload = null
    }
  })

  ipcMain.handle(IPC.transcription.downloadBinary, async () => {
    currentDownload = new AbortController()
    try {
      return await downloadWhisperBinary(
        (progress) => broadcast({ kind: 'download', what: 'programa', ...progress }),
        currentDownload.signal
      )
    } finally {
      currentDownload = null
    }
  })

  ipcMain.handle(
    IPC.transcription.start,
    async (_e, input: TranscriptionStartInput): Promise<void> => {
      if (currentRun) throw new Error('Ja existe uma transcricao em andamento')
      const run = new TranscriptionRun()
      currentRun = run
      try {
        await run.start(input, broadcast)
      } finally {
        currentRun = null
      }
    }
  )

  ipcMain.handle(IPC.transcription.cancel, async () => {
    currentDownload?.abort()
    currentRun?.cancel()
  })
}
