import { downloadFile, fetchRemoteInfo, type DownloadProgress } from './download'

export interface WhisperModelOption {
  id: string
  label: string
  file: string
  // tamanho medido no content-length; serve para exibir antes de baixar
  approxBytes: number
  multilingual: boolean
  sha256: string
}

// Revisão e SHA-256 do repositório upstream, conferidos em 2026-10-15.
const BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1'

// O transcrever.py usa medium com compute_type int8, entao o equivalente fiel
// aqui e o medium quantizado -- nao o fp16, que e tres vezes maior.
export const DEFAULT_MODEL_ID = 'medium-q5_0'

export const WHISPER_MODELS: WhisperModelOption[] = [
  { id: 'tiny', label: 'Tiny', file: 'ggml-tiny.bin', approxBytes: 77_691_713, multilingual: true, sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21' },
  { id: 'base', label: 'Base', file: 'ggml-base.bin', approxBytes: 147_951_465, multilingual: true, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe' },
  { id: 'small', label: 'Small', file: 'ggml-small.bin', approxBytes: 487_601_967, multilingual: true, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' },
  {
    id: 'medium-q5_0',
    sha256: '19fea4b380c3a618ec4723c3eef2eb785ffba0d0538cf43f8f235e7b3b34220f',
    label: 'Medium quantizado (recomendado)',
    file: 'ggml-medium-q5_0.bin',
    approxBytes: 539_212_467,
    multilingual: true
  },
  {
    id: 'medium-q8_0',
    sha256: '42a1ffcbe4167d224232443396968db4d02d4e8e87e213d3ee2e03095dea6502',
    label: 'Medium quantizado (q8)',
    file: 'ggml-medium-q8_0.bin',
    approxBytes: 823_255_651,
    multilingual: true
  },
  {
    id: 'medium',
    sha256: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208',
    label: 'Medium completo',
    file: 'ggml-medium.bin',
    approxBytes: 1_533_763_059,
    multilingual: true
  },
  {
    id: 'large-v3-turbo-q5_0',
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
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
  signal: AbortSignal,
  sha256?: string
): Promise<void> {
  return downloadFile(url, dest, onProgress, signal, sha256)
}

export type { DownloadProgress }
