export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

// Mesmo formato do transcrever.py: HH:MM:SS.mmm
export function formatTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = safe % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${secs.toFixed(3).padStart(6, '0')}`
}

const LINE = /^\[(\d+):(\d{2}):(\d{2})[.,](\d{3})\s*-+>\s*(\d+):(\d{2}):(\d{2})[.,](\d{3})\]\s*(.*)$/

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

// O whisper-cli escreve uma linha por segmento:
//   [00:00:00.000 --> 00:00:04.000]   texto
// Linhas de log e progresso do proprio binario nao casam e sao ignoradas.
export function parseWhisperLine(line: string): TranscriptSegment | null {
  const match = LINE.exec(line.trim())
  if (!match) return null
  const text = match[9].trim()
  if (!text) return null
  return {
    start: toSeconds(match[1], match[2], match[3], match[4]),
    end: toSeconds(match[5], match[6], match[7], match[8]),
    text
  }
}

export function formatTranscriptLine(segment: TranscriptSegment): string {
  return `[${formatTimestamp(segment.start)} -> ${formatTimestamp(segment.end)}] ${segment.text}`
}

export function formatTranscript(segments: TranscriptSegment[]): string {
  return segments.map(formatTranscriptLine).join('\n') + (segments.length > 0 ? '\n' : '')
}

// O progresso e em tempo de audio processado, nao em tempo de parede: o
// whisper percorre o audio em ordem, entao o fim do ultimo segmento sobre a
// duracao total e uma fracao real e monotonica.
export function progressFromSegment(
  segmentEnd: number,
  totalDuration: number
): number {
  if (!(totalDuration > 0)) return 0
  return Math.min(1, Math.max(0, segmentEnd / totalDuration))
}

// Nome do arquivo de saida, seguindo o transcrever.py: <base>_transcricao.txt
export function transcriptPathFor(mediaPath: string): string {
  const dot = mediaPath.lastIndexOf('.')
  const slash = Math.max(mediaPath.lastIndexOf('/'), mediaPath.lastIndexOf('\\'))
  const base = dot > slash ? mediaPath.slice(0, dot) : mediaPath
  return `${base}_transcricao.txt`
}
