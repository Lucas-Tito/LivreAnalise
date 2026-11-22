/** Aplicações repetidas do mesmo código não são uma codificação múltipla. */
export function distinctSegmentCodes<T extends { id: number }>(
  codingIds: number[],
  codingMap: ReadonlyMap<number, { codeId: number }>,
  codeMap: ReadonlyMap<number, T>
): T[] {
  const result = new Map<number, T>()
  for (const id of codingIds) {
    const coding = codingMap.get(id)
    const code = coding && codeMap.get(coding.codeId)
    if (code) result.set(code.id, code)
  }
  return [...result.values()]
}

/** Sequências contíguas com o mesmo conjunto de códigos distintos.
 *
 * Segmentos vizinhos com o mesmo conjunto — mesmo em ordem diferente — formam
 * uma sequência só, para a faixa não reiniciar no meio da linha. Segmentos de
 * um código só ou vazios ficam de fora; a ordem das cores segue o primeiro
 * segmento da sequência.
 */
export function groupCodeRuns<C extends { id: number; color: string }>(
  segments: Array<{ start: number; end: number; codingIds: number[] }>,
  codingMap: ReadonlyMap<number, { codeId: number }>,
  codeMap: ReadonlyMap<number, C>,
  hoverCodingIds: number[] = []
): Array<{ start: number; end: number; colors: string[] }> {
  const runs: Array<{ start: number; end: number; key: string; colors: string[] }> = []
  for (const seg of segments) {
    // O hover usa uma faixa sólida no próprio span, só na citação apontada.
    if (seg.codingIds.some((id) => hoverCodingIds.includes(id))) continue
    const runCodes = distinctSegmentCodes(seg.codingIds, codingMap, codeMap)
    if (runCodes.length < 2) continue
    const key = runCodes
      .map((code) => code.id)
      .sort((a, b) => a - b)
      .join(',')
    const lastRun = runs[runs.length - 1]
    if (lastRun && lastRun.key === key && seg.start === lastRun.end) lastRun.end = seg.end
    else runs.push({ start: seg.start, end: seg.end, key, colors: runCodes.map((code) => code.color) })
  }
  return runs.map(({ start, end, colors }) => ({ start, end, colors }))
}

/** A etiqueta pode reunir citações; apenas seus trechos recebem a sua cor. */
export function hoveredSegmentColor(
  codingIds: number[],
  hover: { codingIds: number[]; color: string } | null
): string | undefined {
  return hover && codingIds.some((id) => hover.codingIds.includes(id)) ? hover.color : undefined
}

/**
 * Fixa um ponto no centro da linha visual mais próxima (desempate para cima).
 *
 * O meio exato de um trecho de 2 linhas cai no vão entre elas: um marcador
 * posicionado ali flutua sem tocar nenhuma e parece torto. Retorna null sem
 * linhas para o chamador filtrar a âncora sem geometria.
 */
export function snapToLine(centers: number[]): number | null {
  if (centers.length === 0) return null
  const sorted = [...centers].sort((a, b) => a - b)
  const mid = (sorted[0] + sorted[sorted.length - 1]) / 2
  let best = sorted[0]
  for (const center of sorted) {
    if (Math.abs(center - mid) < Math.abs(best - mid) - 1e-9) best = center
  }
  return best
}
/** Faixas repetidas mantêm todas as cores visíveis, mesmo em trechos curtos. */
export function multipleCodeUnderline(colors: string[], bandPx = 12, bandHeight = CODE_BAND_HEIGHT) {
  if (colors.length < 2) return {}
  const stops = colors.map((color, i) => `${color} ${i * bandPx}px ${(i + 1) * bandPx}px`)
  return {
    backgroundImage: `repeating-linear-gradient(to right, ${stops.join(', ')})`,
    backgroundSize: `100% ${bandHeight}px`,
    backgroundPosition: 'left bottom',
    backgroundRepeat: 'no-repeat',
    boxDecorationBreak: 'clone' as const,
    WebkitBoxDecorationBreak: 'clone' as const
  }
}

/** Altura da faixa de códigos múltiplos, no texto e no overlay. */
export const CODE_BAND_HEIGHT = 3

export interface LineBand {
  left: number
  top: number
  width: number
}

/** Funde os retângulos de uma linha visual numa faixa contínua.
 *
 * O gradiente reiniciado por span fatiava trechos curtos e escondia as cores
 * do meio; fundindo os fragmentos contíguos da linha, cada linha tem uma
 * faixa só, com todas as cores. Quebra de linha ou vão horizontal abrem uma
 * faixa nova. Retângulos de largura zero não geram faixa.
 */
export function mergeLineBands(
  rects: Array<{ left: number; top: number; right: number; bottom: number }>,
  bandHeight = CODE_BAND_HEIGHT
): LineBand[] {
  const ordered = [...rects].sort((a, b) => a.top - b.top || a.left - b.left)
  const open: Array<{ left: number; right: number; top: number; bottom: number }> = []
  for (const rect of ordered) {
    const last = open[open.length - 1]
    if (
      last &&
      Math.abs(rect.top - last.top) < 1 &&
      rect.left - last.right < 2
    ) {
      last.right = Math.max(last.right, rect.right)
      last.bottom = Math.max(last.bottom, rect.bottom)
    } else {
      open.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })
    }
  }
  return open
    .filter((band) => band.right - band.left > 0)
    .map((band) => ({ left: band.left, top: band.bottom - bandHeight, width: band.right - band.left }))
}

/**
 * Pontilhado do comentário num nível próprio, abaixo da faixa dos códigos.
 *
 * A faixa dos códigos ocupa os 2-3px junto à base do texto (`box-shadow inset`
 * ou `multipleCodeUnderline`). Com o mesmo `textUnderlineOffset: 3` dos trechos
 * sem código, o pontilhado caía em cima das cores e a interface ficava
 * poluída. Com código, o pontilhado desce para 6px: mesma seleção exata,
 * sem sobrepor a faixa. O hover troca o pontilhado por traço contínuo em
 * todos os segmentos da nota, revelando a extensão total do comentário.
 */
export function noteUnderlineStyle(hasNote: boolean, hasCodes: boolean, isHover = false) {
  if (!hasNote) return {}
  return {
    textDecorationLine: 'underline',
    textDecorationStyle: isHover ? ('solid' as const) : ('dotted' as const),
    textUnderlineOffset: hasCodes ? 6 : 3
  }
}

/** Fundo do segmento codificado, com prioridade que preserva cada camada.
 *
 * No caso múltiplo o flood da busca nem entra no `boxShadow`: sem a
 * prioridade da busca aqui, o hover da nota apagaria a distinção entre a
 * ocorrência atual e as demais. O hover continua visível pelo sublinhado.
 */
export function codedSegmentBackground(fill: {
  isFlash: boolean
  isMultiple: boolean
  ehHit: boolean
  ehHitAtual: boolean
  isNoteHover: boolean
  isCodingHover?: boolean
  base: string
}): string {
  if (fill.isFlash) return 'rgba(250, 204, 21, 0.35)'
  if (fill.isCodingHover) return fill.base
  if (fill.isMultiple && fill.ehHit) return `rgba(250, 204, 21, ${fill.ehHitAtual ? '0.45' : '0.2'})`
  if (fill.isNoteHover) return 'rgba(250, 204, 21, 0.18)'
  return fill.base
}
