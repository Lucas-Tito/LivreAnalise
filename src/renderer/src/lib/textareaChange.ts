import { diffText } from '@shared/editAdjust'

// O textarea expõe LF mesmo quando recebeu CRLF. Preserva os bytes fora da
// edição para não transformar a normalização do navegador em edição de âncoras.
export function applyTextareaChange(previous: string, value: string): string {
  const normalized = previous.replace(/\r\n?/g, '\n')
  const next = value.replace(/\r\n?/g, '\n')
  const diff = diffText(normalized, next)
  if (!diff) return previous
  const offset = (position: number): number => {
    let raw = 0
    for (let i = 0; i < position; i++, raw++) {
      if (previous[raw] === '\r' && previous[raw + 1] === '\n') raw++
    }
    return raw
  }
  const inserted = next.slice(diff.changeStart, diff.oldChangeEnd + diff.delta)
  const lineEnding = previous.includes('\r\n') ? '\r\n' : '\n'
  return previous.slice(0, offset(diff.changeStart)) +
    inserted.replace(/\n/g, lineEnding) + previous.slice(offset(diff.oldChangeEnd))
}
