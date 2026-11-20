import { diffChars, diffLines } from 'diff'

export interface AdjustableCoding {
  id: number
  startPos: number
  endPos: number
}

export interface CodingUpdate {
  id: number
  startPos: number
  endPos: number
}

export interface AdjustResult {
  updates: CodingUpdate[]
  removeIds: number[]
}

export interface TextDiff {
  changeStart: number
  oldChangeEnd: number
  delta: number
}

export function diffText(oldText: string, newText: string): TextDiff | null {
  if (oldText === newText) return null
  const oldLen = oldText.length
  const newLen = newText.length
  const minLen = Math.min(oldLen, newLen)

  let prefix = 0
  while (prefix < minLen && oldText[prefix] === newText[prefix]) prefix++

  let suffix = 0
  while (
    suffix < minLen - prefix &&
    oldText[oldLen - 1 - suffix] === newText[newLen - 1 - suffix]
  ) {
    suffix++
  }

  return {
    changeStart: prefix,
    oldChangeEnd: oldLen - suffix,
    delta: newLen - oldLen
  }
}

type DiffPart = { value: string; added?: boolean; removed?: boolean }
type TextEdit = TextDiff & { uncertain?: true; block?: TextDiff }

function changedRanges(parts: DiffPart[], offset: number): TextEdit[] {
  const edits: TextEdit[] = []
  let oldPosition = offset
  let current: TextDiff | undefined
  for (const part of parts) {
    if (!part.added && !part.removed) {
      current = undefined
      oldPosition += part.value.length
      continue
    }
    if (!current) {
      current = { changeStart: oldPosition, oldChangeEnd: oldPosition, delta: 0 }
      edits.push(current)
    }
    if (part.removed) {
      oldPosition += part.value.length
      current.oldChangeEnd = oldPosition
      current.delta -= part.value.length
    } else {
      current.delta += part.value.length
    }
  }
  return edits
}

// Offsets no texto original, em UTF-16. Se o diff ultrapassar o limite,
// mantenha apenas as bordas conhecidas e o deslocamento total do bloco.
function findTextEdits(oldText: string, newText: string): TextEdit[] {
  const outer = diffText(oldText, newText)
  if (!outer) return []
  const { changeStart, oldChangeEnd, delta } = outer
  const oldPart = oldText.slice(changeStart, oldChangeEnd)
  const newPart = newText.slice(changeStart, oldChangeEnd + delta)
  if (!oldPart || !newPart) return [outer]

  const lines = diffLines(oldPart, newPart, { maxEditLength: 512 })
  if (!lines) return [{ ...outer, uncertain: true }]
  const result: TextEdit[] = []
  let shift = 0
  for (const edit of changedRanges(lines, changeStart)) {
    const oldBlock = oldText.slice(edit.changeStart, edit.oldChangeEnd)
    const newStart = edit.changeStart + shift
    const newBlock = newText.slice(newStart, edit.oldChangeEnd + shift + edit.delta)
    shift += edit.delta
    if (!oldBlock || !newBlock) {
      result.push(edit)
      continue
    }
    // A delimitação por linhas mantém juntas as ocorrências de linhas
    // repetidas. Dentro de cada bloco, refine a posição dos trechos.
    const inner = diffText(oldBlock, newBlock)
    if (!inner) continue
    const from = oldBlock.slice(inner.changeStart, inner.oldChangeEnd)
    const to = newBlock.slice(inner.changeStart, inner.oldChangeEnd + inner.delta)
    const start = edit.changeStart + inner.changeStart
    const refined = { changeStart: start, oldChangeEnd: edit.changeStart + inner.oldChangeEnd, delta: inner.delta }
    if (!from || !to) {
      result.push(refined)
      continue
    }
    const chars = from.length + to.length <= 128 * 1024
      ? diffChars(from, to, { maxEditLength: 512 })
      : undefined
    if (chars) result.push(...changedRanges(chars, start).map((range) => ({ ...range, block: refined })))
    else result.push({ ...refined, uncertain: true })
  }
  return result
}

class TextAdjustmentLimitError extends Error {
  constructor() {
    super('A edição é extensa demais para reposicionar as marcações. Salve as alterações em etapas.')
  }
}

/**
 * Reposiciona codificacoes apos uma edicao de texto livre.
 * - Codificacoes inteiramente antes da regiao editada: inalteradas.
 * - Codificacoes inteiramente depois: deslocadas por `delta`.
 * - Edicao totalmente contida dentro de uma codificacao: a codificacao tem o fim ajustado por `delta`.
 * - Codificacoes que cruzam parcialmente a borda da regiao editada: removidas.
 */
export function adjustCodings(
  codings: AdjustableCoding[],
  oldText: string,
  newText: string
): AdjustResult {
  const updates: CodingUpdate[] = []
  const removeIds: number[] = []
  if (!codings.length) return { updates, removeIds }
  const edits = findTextEdits(oldText, newText)

  for (const c of codings) {
    const { id, startPos: a, endPos: b } = c
    let start = a
    let end = b
    for (const { changeStart, oldChangeEnd, delta, uncertain, block } of edits) {
      if (b <= changeStart) break
      if (a >= oldChangeEnd) {
        start += delta
        end += delta
      } else if (a <= changeStart && b >= oldChangeEnd &&
                 (!block || (a <= block.changeStart && b >= block.oldChangeEnd))) {
        // Fragmentos iguais dentro de um bloco podem preservar uma âncora
        // intacta. Se a âncora foi editada e o bloco passa da sua borda,
        // não a estenda usando uma mistura de fragmentos e texto novo.
        end += delta
      } else {
        if (uncertain) throw new TextAdjustmentLimitError()
        end = start
        break
      }
    }
    if (end <= start) removeIds.push(id)
    else if (start !== a || end !== b) updates.push({ id, startPos: start, endPos: end })
  }

  return { updates, removeIds }
}

export function applyCodingAdjustments<T extends AdjustableCoding>(
  codings: T[],
  oldText: string,
  newText: string
): T[] {
  let adjusted: AdjustResult
  try {
    adjusted = adjustCodings(codings, oldText, newText)
  } catch (error) {
    if (error instanceof TextAdjustmentLimitError) return []
    throw error
  }
  const { updates, removeIds } = adjusted
  const removeSet = new Set(removeIds)
  const updateMap = new Map(updates.map((u) => [u.id, u]))

  return codings
    .filter((c) => !removeSet.has(c.id))
    .map((c) => {
      const update = updateMap.get(c.id)
      return update ? { ...c, startPos: update.startPos, endPos: update.endPos } : c
    })
}

/**
 * Tamanho minimo do trecho para ele poder ser reencontrado automaticamente.
 * Casar por texto e heuristica: "sim" aparece uma vez sozinha em algum lugar
 * que nao tem nada a ver com a marcacao original.
 */
export const MIN_RELOCALIZE_LEN = 20

export interface Relocalizacao {
  startPos: number
  endPos: number
}

function ocorrencias(agulha: string, palheiro: string, limite: number): number[] {
  const achados: number[] = []
  let i = palheiro.indexOf(agulha)
  // avanca de 1 em 1 para contar tambem ocorrencias sobrepostas: duas e
  // ambiguo de qualquer jeito, e parar no limite evita varrer texto enorme
  while (i !== -1 && achados.length < limite) {
    achados.push(i)
    i = palheiro.indexOf(agulha, i + 1)
  }
  return achados
}

/**
 * Procura no texto novo o trecho que a edicao destruiu.
 *
 * Mover um paragrafo de lugar apaga as posicoes mas preserva o texto; antes
 * disto a citacao era apagada e a nota desvinculada, mesmo com o trecho
 * inteiro ainda ali. So vale quando ha UMA ocorrencia: duas nao da para
 * escolher sem perguntar, e perguntar no meio de uma edicao atrapalha mais do
 * que ajuda -- nesse caso a oferta manual continua valendo.
 */
export function relocalizarTrecho(
  trecho: string,
  textoNovo: string,
  minimo: number = MIN_RELOCALIZE_LEN
): Relocalizacao | null {
  // conta caractere util: em transcricao um trecho pode ter 30 caracteres e
  // quase todos serem quebra de linha, e aí ele nao distingue nada
  if (trecho.replace(/\s+/g, '').length < minimo) return null
  const achados = ocorrencias(trecho, textoNovo, 2)
  if (achados.length !== 1) return null
  return { startPos: achados[0], endPos: achados[0] + trecho.length }
}
