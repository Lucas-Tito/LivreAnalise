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
  const diff = diffText(oldText, newText)
  const updates: CodingUpdate[] = []
  const removeIds: number[] = []
  if (!diff) return { updates, removeIds }

  const { changeStart: cs, oldChangeEnd: ce, delta } = diff
  const newLen = newText.length

  for (const c of codings) {
    const { id, startPos: a, endPos: b } = c

    if (b <= cs) {
      continue
    }

    if (a >= ce) {
      updates.push({ id, startPos: a + delta, endPos: b + delta })
      continue
    }

    if (a <= cs && b >= ce) {
      const newEnd = b + delta
      if (newEnd - a <= 0) {
        removeIds.push(id)
      } else {
        updates.push({
          id,
          startPos: a,
          endPos: Math.min(newEnd, newLen)
        })
      }
      continue
    }

    removeIds.push(id)
  }

  return { updates, removeIds }
}

export function applyCodingAdjustments<T extends AdjustableCoding>(
  codings: T[],
  oldText: string,
  newText: string
): T[] {
  const { updates, removeIds } = adjustCodings(codings, oldText, newText)
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
