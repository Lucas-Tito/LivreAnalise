import { describe, expect, it } from 'vitest'
import {
  applicableCodes,
  buildLibraryTree,
  canReceiveChild,
  groupIds
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

function collection(id: number, name = `col ${id}`): Collection {
  return { id, guid: `c${id}`, name, description: null, sortOrder: 0 }
}

function member(collectionId: number, codeId: number): CollectionMember {
  return { collectionId, codeId }
}

describe('buildLibraryTree', () => {
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
