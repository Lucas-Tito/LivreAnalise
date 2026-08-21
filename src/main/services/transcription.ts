import { spawn } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  formatTranscript,
  parseWhisperLine,
  progressFromSegment,
  transcriptPathFor,
  type TranscriptSegment
} from './transcript'
import { probeDuration, resolveFfmpeg, toWav } from './ffmpeg'
import { modelById, modelUrl } from './whisperModels'
import { modelIsReady, modelPath, resolveWhisperBinary } from './whisperBinary'

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
  private child: ReturnType<typeof spawn> | null = null
  private canceled = false
  private workDir: string | null = null

  cancel(): void {
    this.canceled = true
    this.child?.kill('SIGTERM')
  }

  async start(options: TranscriptionOptions, emit: Emit): Promise<void> {
    try {
      if (!existsSync(options.mediaPath)) {
        throw new Error('Arquivo de audio nao encontrado')
      }
      const ffmpeg = resolveFfmpeg()
      if (!ffmpeg) {
        throw new Error(
          'ffmpeg nao encontrado. O binario embutido nao foi localizado e nao ha ffmpeg no sistema.'
        )
      }
      const model = modelById(options.modelId)
      if (!modelIsReady(model.file)) {
        throw new Error(`O modelo ${model.label} ainda nao foi baixado`)
      }
      const binary = resolveWhisperBinary(options.binaryPath)
      if (!binary) {
        throw new Error(
          'Executavel do whisper.cpp nao encontrado. Baixe pelo botao ou informe o caminho em Avancado.'
        )
      }

      emit({ kind: 'phase', phase: 'preparando', detail: 'convertendo o audio' })
      this.workDir = mkdtempSync(join(tmpdir(), 'livreanalise-transcricao-'))
      const wav = join(this.workDir, 'audio.wav')
      toWav(ffmpeg, options.mediaPath, wav)
      if (this.canceled) return emit({ kind: 'canceled' })

      const duration = probeDuration(ffmpeg, options.mediaPath)
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
      await new Promise<void>((resolve, reject) => {
        const child = spawn(binary, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          // o whisper-cli carrega libwhisper e os backends ggml do proprio
          // diretorio: sem isso ele nem inicia
          env: libraryEnv(binary)
        })
        this.child = child
        let buffer = ''
        let stderr = ''

        child.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const segment = parseWhisperLine(line)
            if (!segment) continue
            segments.push(segment)
            emit({
              kind: 'segment',
              segment,
              progress: progressFromSegment(segment.end, duration)
            })
          }
        })
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString()
        })
        child.on('error', reject)
        child.on('close', (code) => {
          if (this.canceled) return resolve()
          if (code !== 0) {
            reject(new Error(`whisper terminou com codigo ${code}: ${stderr.slice(-400)}`))
            return
          }
          resolve()
        })
      })

      if (this.canceled) return emit({ kind: 'canceled' })

      const outputPath = transcriptPathFor(options.mediaPath)
      writeFileSync(outputPath, formatTranscript(segments), 'utf-8')
      emit({ kind: 'done', outputPath, segments: segments.length })
    } catch (error) {
      if (this.canceled) emit({ kind: 'canceled' })
      else emit({ kind: 'error', message: (error as Error).message })
    } finally {
      // cancelar descarta tudo: nao fica wav nem txt parcial
      if (this.workDir) rmSync(this.workDir, { recursive: true, force: true })
      this.workDir = null
      this.child = null
    }
  }
}

export function modelDownloadUrl(modelId: string): string {
  return modelUrl(modelById(modelId))
}
