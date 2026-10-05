import { describe, expect, it } from 'vitest'
import {
  applicableCodes,
  buildLibraryTree,
  canReceiveChild,
  collectCollapsibleKeys,
  computeMoveOrder,
  groupDestinations,
  groupIds,
  isNoopMove,
  siblingOrder,
  validateParentChange
} from '../src/shared/codeTree'
import type { Code, Collection, CollectionMember } from '../src/shared/types'

function code(id: number, parentId: number | null = null): Code {
  return {
    id,
    guid: `g${id}`,
    name: `code ${id}`,
    color: '#000',
    description: null,
    parentId,
    sortOrder: 0,
    createdAt: ''
  }
}

describe('groupIds', () => {
  it('treats a code with children as a group', () => {
    expect([...groupIds([code(1), code(2, 1)])]).toEqual([1])
  })

  it('finds no group in a flat list', () => {
    expect(groupIds([code(1), code(2)]).size).toBe(0)
  })
})

describe('applicableCodes', () => {
  it('keeps every code when none has children', () => {
    expect(applicableCodes([code(1), code(2)]).map((c) => c.id)).toEqual([1, 2])
  })

  // O bug: o popover de codificacao oferecia os grupos para aplicar no texto.
  it('never offers a group to be applied to text', () => {
    const codes = [code(1), code(2, 1), code(3, 1), code(4)]
    expect(applicableCodes(codes).map((c) => c.id)).toEqual([2, 3, 4])
  })
})

describe('canReceiveChild', () => {
  it('lets a root code become a group', () => {
    expect(canReceiveChild(code(1))).toBe(true)
  })

  it('refuses a third level', () => {
    expect(canReceiveChild(code(2, 1))).toBe(false)
  })
})

describe('validateParentChange', () => {
  it('accepts moving a loose code into a root group', () => {
    const codes = [code(1), code(2, 1), code(3)]
    expect(() => validateParentChange(codes, 3, 1)).not.toThrow()
  })

  it('accepts detaching to root', () => {
    const codes = [code(1), code(2, 1)]
    expect(() => validateParentChange(codes, 2, null)).not.toThrow()
  })

  it('refuses self-parenting', () => {
    expect(() => validateParentChange([code(1)], 1, 1)).toThrow()
  })

  it('refuses moving a group into another group (3rd level)', () => {
    const codes = [code(1), code(2, 1), code(4), code(5, 4)]
    expect(() => validateParentChange(codes, 1, 4)).toThrow()
  })

  it('refuses a child as destination (3rd level)', () => {
    const codes = [code(1), code(2, 1), code(3)]
    expect(() => validateParentChange(codes, 3, 2)).toThrow()
  })

  it('refuses unknown destination', () => {
    expect(() => validateParentChange([code(1)], 1, 99)).toThrow()
  })
})

describe('groupDestinations', () => {
  it('lists only roots that already have children', () => {
    const codes = [code(1), code(2, 1), code(3), code(4, 1)]
    expect(groupDestinations(codes).map((c) => c.id)).toEqual([1])
  })
})

function ord(id: number, sortOrder: number, parentId: number | null = null): Code {
  return { ...code(id, parentId), sortOrder }
}

describe('computeMoveOrder', () => {
  it('inserts the moved code before the anchor', () => {
    const codes = [ord(1, 0), ord(2, 1), ord(3, 2)]
    const { ordered } = computeMoveOrder(codes, [3], null, 1, 'before')
    expect(ordered.map((c) => c.id)).toEqual([3, 1, 2])
  })

  it('inserts the moved code after the anchor', () => {
    const codes = [ord(1, 0), ord(2, 1), ord(3, 2)]
    const { ordered } = computeMoveOrder(codes, [3], null, 1, 'after')
    expect(ordered.map((c) => c.id)).toEqual([1, 3, 2])
  })

  it('sends the block to the end without an anchor', () => {
    const codes = [ord(1, 0), ord(2, 1), ord(3, 2)]
    const { ordered } = computeMoveOrder(codes, [1], null)
    expect(ordered.map((c) => c.id)).toEqual([2, 3, 1])
  })

  // A âncora arrastada junto não pode virar referência: o bloco vai para o
  // fim em vez de se ancorar nele mesmo.
  it('discards an anchor that is also being dragged', () => {
    const codes = [ord(1, 0), ord(2, 1), ord(3, 2)]
    const { ordered, anchorId } = computeMoveOrder(codes, [1, 2], null, 1, 'before')
    expect(anchorId).toBeNull()
    expect(ordered.map((c) => c.id)).toEqual([3, 1, 2])
  })
})

describe('isNoopMove', () => {
  it('detects dropping right where the code already is', () => {
    const codes = [ord(1, 0), ord(2, 1), ord(3, 2)]
    // O 2 já está logo depois do 1.
    expect(
      isNoopMove(codes, [2], { parentId: null, anchorId: 1, position: 'after' })
    ).toBe(true)
  })

  it('detects a move that really changes the order', () => {
    const codes = [ord(1, 0), ord(2, 1), ord(3, 2)]
    expect(
      isNoopMove(codes, [1], { parentId: null, anchorId: 3, position: 'after' })
    ).toBe(false)
  })

  it('detects a different parent as a real move', () => {
    const codes = [ord(1, 0), ord(2, 0, 1), ord(3, 1)]
    expect(isNoopMove(codes, [3], { parentId: 1 })).toBe(false)
  })

  it('detects choosing the group the code is already in', () => {
    // sort_order distintos é o estado real depois de qualquer arrasto.
    const codes = [ord(1, 0), ord(2, 0, 1), ord(3, 1, 1)]
    // O 3 já é o último filho do 1.
    expect(isNoopMove(codes, [3], { parentId: 1, position: 'end' })).toBe(true)
  })

  it('detects a reorder inside the same group as a real move', () => {
    const codes = [ord(1, 0), ord(2, 0, 1), ord(3, 0, 1)]
    // O 2 é o primeiro filho: mandar para o fim troca a ordem.
    expect(isNoopMove(codes, [2], { parentId: 1, position: 'end' })).toBe(false)
  })

  it('detects choosing root for a code that is already root', () => {
    const codes = [ord(1, 0), ord(2, 1)]
    expect(isNoopMove(codes, [2], { parentId: null })).toBe(true)
  })

  it('treats an empty batch as a no-op', () => {
    expect(isNoopMove([ord(1, 0)], [], { parentId: null })).toBe(true)
  })

  it('returns false for an unknown code', () => {
    expect(isNoopMove([ord(1, 0)], [99], { parentId: null })).toBe(false)
  })

  // Regressão: o desempate precisa ser a colação BINARY do ORDER BY name do
  // SQLite, que é o que a lista mostra. Com localeCompare('pt-BR') os nomes
  // acentuados vinham em outra ordem e um arrasto real era descartado.
  it('uses the same name order as the SQLite BINARY collation', () => {
    const fala = { ...ord(1, 0), name: 'Fala' }
    const acao = { ...ord(2, 0), name: 'ação' }
    // BINARY ordena por byte UTF-8: 'F' (0x46) < 'ã' (0xE3).
    expect(siblingOrder(fala, acao)).toBe(-1)
    expect(siblingOrder(acao, fala)).toBe(1)
    // 'ação' em 0 e 'Fala' em 0: a lista mostra Fala primeiro. Soltar 'ação'
    // na borda de cima de 'Fala' é um movimento de verdade, não um noop.
    expect(
      isNoopMove([fala, acao], [acao.id], {
        parentId: null,
        anchorId: fala.id,
        position: 'before'
      })
    ).toBe(false)
  })

  it('orders emoji and accented letters by code point like SQLite', () => {
    const emoji = { ...ord(1, 0), name: '🙂' }
    const tilde = { ...ord(2, 0), name: 'ã' }
    expect(siblingOrder(tilde, emoji)).toBe(-1)
    expect(siblingOrder(emoji, tilde)).toBe(1)
  })
})

function collection(id: number, name = `col ${id}`): Collection {
  return { id, guid: `c${id}`, name, description: null, sortOrder: 0 }
}

function member(collectionId: number, codeId: number): CollectionMember {
  return { collectionId, codeId }
}

describe('buildLibraryTree', () => {
  it('orders direct collection members by code order rather than membership order', () => {
    const codes = [ord(2, 0), ord(1, 1)]
    const tree = buildLibraryTree(codes, [collection(10)], [member(10, 1), member(10, 2)])
    expect(tree.collections[0].children.map((c) => c.code.id)).toEqual([2, 1])
  })

  it('nests collection -> group -> code', () => {
    const codes = [code(1), code(2, 1), code(3, 1)]
    const tree = buildLibraryTree(codes, [collection(10)], [member(10, 1)])
    expect(tree.collections).toHaveLength(1)
    const group = tree.collections[0].children[0]
    expect(group.code.id).toBe(1)
    expect(group.children.map((c) => c.code.id)).toEqual([2, 3])
    expect(tree.loose).toEqual([])
  })

  // O ATLAS.ti escreve o grupo e os codigos dele como membros do mesmo Set:
  // mostrar os dois repetiria a mesma informacao em dois niveis.
  it('hides a code that is a member alongside its own group', () => {
    const codes = [code(1), code(2, 1)]
    const members = [member(10, 1), member(10, 2)]
    const tree = buildLibraryTree(codes, [collection(10)], members)
    expect(tree.collections[0].children.map((c) => c.code.id)).toEqual([1])
    expect(tree.collections[0].children[0].children.map((c) => c.code.id)).toEqual([2])
  })

  it('keeps a code whose group is in another collection', () => {
    const codes = [code(1), code(2, 1)]
    const members = [member(10, 1), member(20, 2)]
    const tree = buildLibraryTree(codes, [collection(10), collection(20)], members)
    expect(tree.collections[0].children.map((c) => c.code.id)).toEqual([1])
    expect(tree.collections[1].children.map((c) => c.code.id)).toEqual([2])
  })

  it('lists a group that belongs to no collection as loose', () => {
    const codes = [code(1), code(2, 1), code(3)]
    const tree = buildLibraryTree(codes, [collection(10)], [member(10, 1)])
    expect(tree.loose.map((c) => c.code.id)).toEqual([3])
  })

  it('never repeats a code at the root when it is already in a collection', () => {
    const codes = [code(1), code(2, 1)]
    const tree = buildLibraryTree(codes, [collection(10)], [member(10, 1)])
    expect(tree.loose).toEqual([])
  })

  it('shows a group in both collections it belongs to', () => {
    const codes = [code(1), code(2, 1)]
    const members = [member(10, 1), member(20, 1)]
    const tree = buildLibraryTree(codes, [collection(10), collection(20)], members)
    expect(tree.collections[0].children[0].code.id).toBe(1)
    expect(tree.collections[1].children[0].code.id).toBe(1)
  })
})

describe('collectCollapsibleKeys', () => {
  it('returns collection keys and group keys in the panel key scheme', () => {
    const codes = [code(1), code(2, 1), code(3, 1), code(4)]
    const tree = buildLibraryTree(codes, [collection(10)], [member(10, 1)])
    // Grupo 1 esta na colecao 10 (chave col-10/1); o codigo 4 solto e folha,
    // entao nao entra; a colecao col-10 entra (o cabecalho recolhe).
    expect([...collectCollapsibleKeys(tree)].sort()).toEqual([
      'col-10',
      'col-10/1'
    ])
  })

  it('uses the loose path for groups outside collections', () => {
    const codes = [code(1), code(2, 1)]
    const tree = buildLibraryTree(codes, [], [])
    expect([...collectCollapsibleKeys(tree)]).toEqual(['loose/1'])
  })

  it('returns an empty set for a flat tree', () => {
    const tree = buildLibraryTree([code(1), code(2)], [], [])
    expect(collectCollapsibleKeys(tree).size).toBe(0)
  })
})
