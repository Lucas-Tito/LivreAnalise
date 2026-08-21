import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { unlink } from 'fs/promises'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { dirname } from 'path'

export interface WhisperModelOption {
  id: string
  label: string
  file: string
  // tamanho medido no content-length; serve para exibir antes de baixar
  approxBytes: number
  multilingual: boolean
}

const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

// O transcrever.py usa medium com compute_type int8, entao o equivalente fiel
// aqui e o medium quantizado -- nao o fp16, que e tres vezes maior.
export const DEFAULT_MODEL_ID = 'medium-q5_0'

export const WHISPER_MODELS: WhisperModelOption[] = [
  { id: 'tiny', label: 'Tiny', file: 'ggml-tiny.bin', approxBytes: 77_691_713, multilingual: true },
  { id: 'base', label: 'Base', file: 'ggml-base.bin', approxBytes: 147_951_465, multilingual: true },
  { id: 'small', label: 'Small', file: 'ggml-small.bin', approxBytes: 487_601_967, multilingual: true },
  {
    id: 'medium-q5_0',
    label: 'Medium quantizado (recomendado)',
    file: 'ggml-medium-q5_0.bin',
    approxBytes: 539_212_467,
    multilingual: true
  },
  {
    id: 'medium-q8_0',
    label: 'Medium quantizado (q8)',
    file: 'ggml-medium-q8_0.bin',
    approxBytes: 823_255_651,
    multilingual: true
  },
  {
    id: 'medium',
    label: 'Medium completo',
    file: 'ggml-medium.bin',
    approxBytes: 1_533_763_059,
    multilingual: true
  },
  {
    id: 'large-v3-turbo-q5_0',
    label: 'Large v3 turbo quantizado',
    file: 'ggml-large-v3-turbo-q5_0.bin',
    approxBytes: 574_041_195,
    multilingual: true
  }
]

export function modelById(id: string): WhisperModelOption {
  return WHISPER_MODELS.find((m) => m.id === id) ?? WHISPER_MODELS[3]
}

export function modelUrl(model: WhisperModelOption): string {
  return `${BASE_URL}/${model.file}`
}

export interface DownloadProgress {
  receivedBytes: number
  totalBytes: number
}

// O tamanho exato vem do servidor, entao a UI nunca mostra estimativa chutada.
export async function fetchModelSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    const length = res.headers.get('content-length')
    return length ? Number(length) : null
  } catch {
    return null
  }
}

// Baixa para <dest>.part e so renomeia no fim: um download interrompido nunca
// e confundido com um modelo completo. Se o .part existir, retoma por Range.
export async function downloadModel(
  url: string,
  dest: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const partial = `${dest}.part`
  const already = existsSync(partial) ? statSync(partial).size : 0

  const res = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: already > 0 ? { Range: `bytes=${already}-` } : {}
  })
  if (!res.ok && res.status !== 206) {
    throw new Error(`Falha ao baixar o modelo (HTTP ${res.status})`)
  }
  if (!res.body) throw new Error('Resposta sem corpo ao baixar o modelo')

  const resuming = res.status === 206
  const remaining = Number(res.headers.get('content-length') ?? 0)
  const totalBytes = resuming ? already + remaining : remaining
  let receivedBytes = resuming ? already : 0

  if (!resuming && already > 0) await unlink(partial).catch(() => undefined)

  const file = createWriteStream(partial, { flags: resuming ? 'a' : 'w' })
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  body.on('data', (chunk: Buffer) => {
    receivedBytes += chunk.length
    onProgress({ receivedBytes, totalBytes })
  })
  await pipeline(body, file)

  // um download truncado gera um modelo corrompido que falha de forma
  // esquisita muito depois; melhor recusar aqui
  const finalSize = statSync(partial).size
  if (totalBytes > 0 && finalSize !== totalBytes) {
    throw new Error(
      `Download incompleto: ${finalSize} de ${totalBytes} bytes. Tente novamente.`
    )
  }
  renameSync(partial, dest)
}
