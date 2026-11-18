import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  formatTranscript,
  createTranscriptStream,
  progressFromSegment,
  transcriptPathFor,
  type TranscriptSegment
} from './transcript'
import { probeDuration, resolveFfmpeg, toWav } from './ffmpeg'
import { modelById, modelUrl } from './whisperModels'
import { modelIsReady, modelPath, resolveWhisperBinary } from './whisperBinary'
import { writeUniqueTextFile } from './atomicFile'
import { runProcess } from './process'

export interface TranscriptionOptions {
  mediaPath: string
  modelId: string
  language: string | null
  binaryPath?: string | null
}

export type TranscriptionEvent =
  | { kind: 'phase'; phase: 'preparando' | 'transcrevendo'; detail?: string }
  | { kind: 'segment'; segment: TranscriptSegment; progress: number }
  | { kind: 'done'; outputPath: string; segments: number }
  | { kind: 'error'; message: string }
  | { kind: 'canceled' }

type Emit = (event: TranscriptionEvent) => void

export function ffmpegAvailable(): boolean {
  return resolveFfmpeg() !== null
}

// Garante que o binario ache as bibliotecas que vieram junto com ele.
function libraryEnv(binary: string): NodeJS.ProcessEnv {
  const dir = dirname(binary)
  const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH'
  if (process.platform === 'win32') return { ...process.env }
  const existing = process.env[key]
  return {
    ...process.env,
    [key]: existing ? `${dir}:${existing}` : dir
  }
}

export class TranscriptionRun {
  private controller = new AbortController()
  private workDir: string | null = null

  cancel(): void {
    this.controller.abort()
  }

  async start(options: TranscriptionOptions, emit: Emit): Promise<void> {
    const signal = this.controller.signal
    try {
      if (!existsSync(options.mediaPath)) {
        throw new Error('Arquivo de áudio não encontrado')
      }
      const ffmpeg = resolveFfmpeg()
      if (!ffmpeg) {
        throw new Error(
          'ffmpeg não encontrado. O binário embutido não foi localizado e não há ffmpeg no sistema.'
        )
      }
      const model = modelById(options.modelId)
      if (!(await modelIsReady(model.file, signal))) {
        throw new Error(`O modelo ${model.label} está ausente ou não passou na verificação. Baixe o modelo novamente.`)
      }
      const binary = resolveWhisperBinary(options.binaryPath)
      if (!binary) {
        throw new Error(
          'Executável do whisper.cpp não encontrado. Baixe pelo botão ou informe o caminho em Avançado.'
        )
      }

      emit({ kind: 'phase', phase: 'preparando', detail: 'convertendo o áudio' })
      this.workDir = mkdtempSync(join(tmpdir(), 'livreanalise-transcricao-'))
      const wav = join(this.workDir, 'audio.wav')
      await toWav(ffmpeg, options.mediaPath, wav, signal)
      signal.throwIfAborted()

      const duration = await probeDuration(ffmpeg, options.mediaPath, signal)
      emit({ kind: 'phase', phase: 'transcrevendo' })

      // As flags booleanas do whisper-cli nao levam valor: passar
      // "--no-timestamps false" ligaria a flag e trataria "false" como arquivo.
      // Os defaults ja sao os que queremos (timestamps ligados, cores off).
      const args = [
        '-m', modelPath(model.file),
        '-f', wav,
        '--beam-size', '5',
        '-l', options.language ?? 'auto'
      ]

      const segments: TranscriptSegment[] = []
      const stream = createTranscriptStream((segment) => {
        segments.push(segment)
        emit({ kind: 'segment', segment, progress: progressFromSegment(segment.end, duration) })
      })
      const result = await runProcess(binary, args, {
        signal, env: libraryEnv(binary), onStdout: stream.push
      })
      signal.throwIfAborted()
      if (result.code !== 0) throw new Error(`whisper terminou com código ${result.code}: ${result.stderr.slice(-400)}`)
      stream.end()

      const outputPath = writeUniqueTextFile(transcriptPathFor(options.mediaPath), formatTranscript(segments))
      emit({ kind: 'done', outputPath, segments: segments.length })
    } catch (error) {
      if (signal.aborted) emit({ kind: 'canceled' })
      else emit({ kind: 'error', message: (error as Error).message })
    } finally {
      // cancelar descarta tudo: nao fica wav nem txt parcial
      if (this.workDir) rmSync(this.workDir, { recursive: true, force: true })
      this.workDir = null
    }
  }
}

export function modelDownloadUrl(modelId: string): string {
  return modelUrl(modelById(modelId))
}
