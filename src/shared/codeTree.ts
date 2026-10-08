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

// Validação central do movimento de códigos (usada no renderer e no main).
// Regras: alvo existe (ou null), nunca self, sem ciclo, sem 3º nível.
export function validateParentChange(
  codes: Code[],
  id: number,
  newParentId: number | null
): void {
  if (newParentId == null) return
  if (id === newParentId) {
    throw new Error('Um código não pode ficar dentro dele mesmo.')
  }
  const byId = new Map(codes.map((c) => [c.id, c]))
  const moving = byId.get(id)
  const target = byId.get(newParentId)
  if (!moving) throw new Error('Código a mover não encontrado.')
  if (!target) throw new Error('Grupo de destino não encontrado.')
  // Destino precisa ser raiz (sem 3º nível).
  if (target.parentId != null) {
    throw new Error('O destino precisa ser um grupo de 1º nível (sem criar 3º nível).')
  }
  // Código com filhos não pode descer para dentro de outro.
  const hasChildren = codes.some((c) => c.parentId === id)
  if (hasChildren) {
    throw new Error('Um grupo não pode ser movido para dentro de outro grupo.')
  }
  // Sem ciclo: sobe a cadeia do alvo.
  let cursor: Code | undefined = target
  while (cursor) {
    if (cursor.parentId == null) break
    if (cursor.parentId === id) {
      throw new Error('Este movimento criaria um ciclo na hierarquia.')
    }
    cursor = byId.get(cursor.parentId)
  }
}

// Destinos válidos para "Mover para grupo…": 1º nível que já tem filhos.
export function groupDestinations(codes: Code[]): Code[] {
  const groups = groupIds(codes)
  return codes.filter((c) => c.parentId == null && groups.has(c.id))
}

// Compara por ponto de código, que é a ordem em que o SQLite compara os bytes
// do UTF-8 no ORDER BY name. A comparação nativa de string do JS é por unidade
// de código UTF-16 e diverge da codepoint a partir do primeiro caractere fora do
// BMP (emoji, por exemplo).
function compareCodePoints(a: string, b: string): number {
  if (a === b) return 0
  const left = Array.from(a)
  const right = Array.from(b)
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i].codePointAt(0) as number
    const y = right[i].codePointAt(0) as number
    if (x !== y) return x < y ? -1 : 1
  }
  return left.length === right.length ? 0 : left.length < right.length ? -1 : 1
}

// Ordem dos irmãos dentro de um mesmo pai: sort_order primeiro (é o que o
// arrasto reescreve) e o nome como desempate para os códigos que nunca foram
// movidos — todos nascem com sort_order 0.
// O desempate tem que ser a comparação de ponto de código, e não
// localeCompare: é o que o SQLite faz no ORDER BY name (colação BINARY) que a
// lista da CodesPanel mostra. Divergir daqui fazia um arrasto real ser tratado
// como "já está aqui" e descartado.
export function siblingOrder(a: Code, b: Code): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return compareCodePoints(a.name, b.name)
}

export interface MovePlacement {
  parentId: number | null
  anchorId?: number | null
  position?: 'before' | 'after' | 'end'
}

export interface MoveOrder<T extends Code = Code> {
  moving: T[]
  staying: T[]
  // Ordem final dos irmãos do destino, arrastados já incluídos no lugar.
  ordered: T[]
  // Âncora efetiva depois de descartar quem também está sendo arrastado.
  anchorId: number | null
}

// Traduz (destino, âncora, posição) na ordem final dos irmãos do destino.
// Fonte única da conta que o moveCodes do main aplica: uma âncora que também
// está sendo arrastada não pode virar referência, então ela sai da lista e o
// vizinho real do destino passa a ser o antigo antecessor (sem âncora válida
// o bloco vai para o fim).
export function computeMoveOrder<T extends Code>(
  codes: T[],
  ids: number[],
  parentId: number | null,
  anchorId?: number | null,
  position?: 'before' | 'after' | 'end'
): MoveOrder<T> {
  const unique = [...new Set(ids)]
  const anchor =
    anchorId != null && !unique.includes(anchorId) ? anchorId : null
  const moving = unique
    .map((id) => codes.find((c) => c.id === id))
    .filter((c): c is T => c != null)
    .sort(siblingOrder)
  const staying = codes
    .filter((c) => c.parentId === parentId && !unique.includes(c.id))
    .sort(siblingOrder)
  const at = anchor == null ? -1 : staying.findIndex((c) => c.id === anchor)
  const index = at === -1 ? staying.length : at + (position === 'after' ? 1 : 0)
  const ordered = [
    ...staying.slice(0, index),
    ...moving,
    ...staying.slice(index)
  ]
  return { moving, staying, ordered, anchorId: anchor }
}

// True quando o movimento não mudaria nada: soltar a linha no vizinho
// imediato que já é a posição dela, ou escolher no diálogo "Mover para grupo…"
// o grupo (ou o 1º nível) onde o código já está. Não é erro, é ausência de
// movimento.
// O teste é aritmético, não de ordem: o que o moveCodes grava ao final é
// `sortOrder = posição` para cada irmão do destino. Então é no-op quando cada
// código já está com exatamente esse par (parentId, sortOrder). Comparar a
// ordem re-ordenada com a ordem atual não serviria: ela dependeria de um
// desempate por nome que precisa concordar com o ORDER BY do SQLite, e uma
// divergência ali descartaria arrastos reais.
// (Soltar a linha em cima dela mesma o arrasto trata à parte, porque ali a
// âncora é o próprio arrastado e seria descartada pela regra do computeMoveOrder.)
export function isNoopMove(
  codes: Code[],
  ids: number[],
  placement: MovePlacement
): boolean {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return true
  const byId = new Map(codes.map((c) => [c.id, c]))
  const moving = unique.map((id) => byId.get(id))
  // Código que não existe na lista: não dá para saber, então não é no-op.
  if (moving.some((c) => c == null)) return false
  const { ordered } = computeMoveOrder(
    codes,
    unique,
    placement.parentId,
    placement.anchorId,
    placement.position
  )
  return ordered.every((code, position) => {
    const before = byId.get(code.id) as Code
    return (
      before.parentId === placement.parentId && before.sortOrder === position
    )
  })
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
    children.sort((a, b) => siblingOrder(a.code, b.code))
    return { collection, children }
  })

  const loose = codes
    .filter((code) => code.parentId == null && !placed.has(code.id))
    .map((code) => codeNode(code, byParent))

  return { collections: collectionNodes, loose }
}

// Chaves recolhiveis da arvore, no mesmo esquema do estado `collapsed` da
// CodesPanel (`col-<id>` para colecoes, `<path>/<id>` para codigos). So entra
// no conjunto quem tem filhos -- e quem o "Recolher tudo" precisa fechar.
export function collectCollapsibleKeys<T extends Code>(
  tree: LibraryTree<T>
): Set<string> {
  const keys = new Set<string>()
  const walk = (node: CodeNode<T>, path: string): void => {
    if (node.children.length === 0) return
    const key = `${path}/${node.code.id}`
    keys.add(key)
    for (const child of node.children) walk(child, key)
  }
  for (const col of tree.collections) {
    const key = `col-${col.collection.id}`
    keys.add(key)
    for (const child of col.children) walk(child, key)
  }
  for (const node of tree.loose) walk(node, 'loose')
  return keys
}
