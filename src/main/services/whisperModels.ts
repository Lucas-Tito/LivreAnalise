import { downloadFile, fetchRemoteInfo, type DownloadProgress } from './download'

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

// O tamanho exato vem do servidor, entao a UI nunca mostra estimativa chutada.
export async function fetchModelSize(url: string): Promise<number | null> {
  return (await fetchRemoteInfo(url)).bytes
}

export async function downloadModel(
  url: string,
  dest: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<void> {
  return downloadFile(url, dest, onProgress, signal)
}

export type { DownloadProgress }
