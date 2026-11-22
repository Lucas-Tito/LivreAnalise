import { beforeEach, expect, it, vi } from 'vitest'
import { IPC } from '../src/shared/ipc'
import { cancelTranscriptionOperations, hasTranscriptionOperation, registerTranscriptionHandlers } from '../src/main/ipc/transcription'

const { handlers, download, send, resolveBinary } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(), download: vi.fn(), send: vi.fn(), resolveBinary: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: any) => handlers.set(channel, handler) },
  dialog: {}, BrowserWindow: { getAllWindows: () => [{ webContents: { send } }] }
}))
vi.mock('../src/main/services/whisperModels', () => ({
  DEFAULT_MODEL_ID: 'tiny', WHISPER_MODELS: [], downloadModel: download,
  modelById: () => ({ file: 'tiny', sha256: 'hash' }), modelUrl: () => 'url'
}))
vi.mock('../src/main/services/whisperBinary', () => ({
  assetForPlatform: () => null, modelPath: () => 'path', modelIsDownloaded: () => false,
  resolveWhisperBinary: resolveBinary, downloadWhisperBinary: download
}))
vi.mock('../src/main/services/transcription', () => ({ ffmpegAvailable: () => true, TranscriptionRun: class {} }))
beforeEach(() => { vi.clearAllMocks(); registerTranscriptionHandlers() })

it('rejects overlapping downloads and waits for cancellation cleanup', async () => {
  download.mockImplementation(async (_url, _dest, _progress, signal: AbortSignal) => {
    await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
  })
  const first = handlers.get(IPC.transcription.downloadModel)!(null, 'tiny')
  await Promise.resolve()
  await expect(handlers.get(IPC.transcription.downloadBinary)!()).rejects.toThrow('andamento')
  expect(hasTranscriptionOperation()).toBe(true)
  await cancelTranscriptionOperations()
  expect(await first).toBe(false)
  expect(hasTranscriptionOperation()).toBe(false)
  expect(send).toHaveBeenCalledWith(IPC.transcription.event, { kind: 'canceled' })
})

it('validates the manually configured executable in the environment query', async () => {
  resolveBinary.mockReturnValue('/manual/whisper-cli')
  const env = await handlers.get(IPC.transcription.env)!(null, '/manual/whisper-cli')
  expect(resolveBinary).toHaveBeenCalledWith('/manual/whisper-cli')
  expect(env.binaryPath).toBe('/manual/whisper-cli')
})
