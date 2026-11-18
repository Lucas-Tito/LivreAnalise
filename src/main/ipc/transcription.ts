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
  modelIsDownloaded,
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
let currentTask: Promise<unknown> | null = null

export function hasTranscriptionOperation(): boolean {
  return currentTask !== null
}

export async function cancelTranscriptionOperations(): Promise<void> {
  currentDownload?.abort()
  currentRun?.cancel()
  await currentTask?.catch(() => undefined)
}

async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  if (currentTask) throw new Error('Há uma transcrição ou download em andamento. Aguarde sua conclusão.')
  const task = Promise.resolve().then(operation)
  currentTask = task
  try { return await task } finally { currentTask = null }
}

function broadcast(event: BroadcastEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.transcription.event, event)
  }
}

export function registerTranscriptionHandlers(): void {
  ipcMain.handle(IPC.transcription.env, async (_e, configuredPath?: string | null): Promise<TranscriptionEnv> => ({
    ffmpeg: ffmpegAvailable(),
    binaryPath: resolveWhisperBinary(configuredPath),
    canDownloadBinary: assetForPlatform() !== null,
    defaultModelId: DEFAULT_MODEL_ID
  }))

  ipcMain.handle(IPC.transcription.models, async (): Promise<TranscriptionModel[]> =>
    WHISPER_MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      approxBytes: model.approxBytes,
      ready: modelIsDownloaded(model.file)
    }))
  )

  ipcMain.handle(IPC.transcription.pickMedia, async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar áudio ou vídeo',
      properties: ['openFile'],
      filters: [
        {
          name: 'Áudio e vídeo',
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

  ipcMain.handle(IPC.transcription.downloadModel, (_e, modelId: string) => exclusive(async () => {
    const model = modelById(modelId)
    currentDownload = new AbortController()
    try {
      await downloadModel(
        modelUrl(model),
        modelPath(model.file),
        (progress) => broadcast({ kind: 'download', what: 'modelo', ...progress }),
        currentDownload.signal,
        model.sha256
      )
      return true
    } catch (error) {
      if (!currentDownload.signal.aborted) throw error
      broadcast({ kind: 'canceled' })
      return false
    } finally {
      currentDownload = null
    }
  }))

  ipcMain.handle(IPC.transcription.downloadBinary, () => exclusive(async () => {
    currentDownload = new AbortController()
    try {
      return await downloadWhisperBinary(
        (progress) => broadcast({ kind: 'download', what: 'programa', ...progress }),
        currentDownload.signal
      )
    } catch (error) {
      if (!currentDownload.signal.aborted) throw error
      broadcast({ kind: 'canceled' })
      return null
    } finally {
      currentDownload = null
    }
  }))

  ipcMain.handle(
    IPC.transcription.start,
    (_e, input: TranscriptionStartInput) => exclusive(async (): Promise<void> => {
      if (currentRun) throw new Error('Já existe uma transcrição em andamento')
      const run = new TranscriptionRun()
      currentRun = run
      try {
        await run.start(input, broadcast)
      } finally {
        currentRun = null
      }
    })
  )

  ipcMain.handle(IPC.transcription.cancel, cancelTranscriptionOperations)
}
