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
