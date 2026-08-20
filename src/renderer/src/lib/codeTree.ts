import type { Code } from '@shared/types'

// Grupo nao e um campo no banco: e a propriedade derivada de um codigo ter
// filhos. O atomo -- o unico nivel que recebe citacao -- e o codigo sem filhos.
export function groupIds(codes: Code[]): Set<number> {
  const ids = new Set<number>()
  for (const code of codes) {
    if (code.parentId != null) ids.add(code.parentId)
  }
  return ids
}

// Codigos que podem ser aplicados a um trecho: os que nao sao grupo.
export function applicableCodes<T extends Code>(codes: T[]): T[] {
  const groups = groupIds(codes)
  return codes.filter((code) => !groups.has(code.id))
}

// O ATLAS.ti e o nosso modelo param em dois niveis: um codigo so pode receber
// filhos se ele mesmo nao for filho de ninguem.
export function canReceiveChild(code: Code): boolean {
  return code.parentId == null
}
