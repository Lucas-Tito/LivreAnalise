import type { Code, Collection, CollectionMember } from '@shared/types'

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

export interface CodeNode<T extends Code = Code> {
  code: T
  children: Array<CodeNode<T>>
}

export interface CollectionNode<T extends Code = Code> {
  collection: Collection
  children: Array<CodeNode<T>>
}

export interface LibraryTree<T extends Code = Code> {
  collections: Array<CollectionNode<T>>
  loose: Array<CodeNode<T>>
}

function codeNode<T extends Code>(
  code: T,
  byParent: Map<number, T[]>
): CodeNode<T> {
  return {
    code,
    children: (byParent.get(code.id) ?? []).map((child) =>
      codeNode(child, byParent)
    )
  }
}

// Monta coleção -> grupo -> código. Um código aparece direto na coleção apenas
// quando o grupo dele nao esta na mesma coleção: o ATLAS.ti escreve o grupo e
// os codigos dele como membros do mesmo Set, e mostrar os dois repetiria a
// mesma informacao em dois niveis.
export function buildLibraryTree<T extends Code>(
  codes: T[],
  collections: Collection[],
  members: CollectionMember[]
): LibraryTree<T> {
  const byParent = new Map<number, T[]>()
  for (const code of codes) {
    if (code.parentId == null) continue
    const siblings = byParent.get(code.parentId) ?? []
    siblings.push(code)
    byParent.set(code.parentId, siblings)
  }
  const codeById = new Map(codes.map((c) => [c.id, c]))

  const memberIdsByCollection = new Map<number, Set<number>>()
  for (const member of members) {
    const set = memberIdsByCollection.get(member.collectionId) ?? new Set()
    set.add(member.codeId)
    memberIdsByCollection.set(member.collectionId, set)
  }

  const placed = new Set<number>()
  const collectionNodes = collections.map((collection) => {
    const memberIds = memberIdsByCollection.get(collection.id) ?? new Set()
    const children: Array<CodeNode<T>> = []
    for (const id of memberIds) {
      const code = codeById.get(id)
      if (!code) continue
      if (code.parentId != null && memberIds.has(code.parentId)) continue
      children.push(codeNode(code, byParent))
      placed.add(code.id)
      for (const descendant of byParent.get(code.id) ?? []) {
        placed.add(descendant.id)
      }
    }
    return { collection, children }
  })

  const loose = codes
    .filter((code) => code.parentId == null && !placed.has(code.id))
    .map((code) => codeNode(code, byParent))

  return { collections: collectionNodes, loose }
}
