import { describe, expect, it } from 'vitest'
import { filterLibraryTree, type LibraryTree } from '../src/shared/codeTree'
import type { Code } from '../src/shared/types'

function code(id: number, name: string, parentId: number | null = null): Code {
  return {
    id, name, parentId, guid: `g${id}`, color: '#000',
    description: null, sortOrder: 0, createdAt: ''
  }
}

const group = {
  code: code(1, 'Experiências'),
  children: [
    { code: code(2, 'COMUNICAÇÃO', 1), children: [] },
    { code: code(3, 'Educação', 1), children: [] }
  ]
}
const tree: LibraryTree = {
  collections: [{
    collection: { id: 1, guid: 'col1', name: 'Temas', description: null, sortOrder: 0 },
    children: [group]
  }],
  loose: [{ code: code(4, 'Comunicação pessoal'), children: [] }]
}

describe('filterLibraryTree', () => {
  it('returns the original tree for an empty or whitespace search', () => {
    expect(filterLibraryTree(tree, '')).toBe(tree)
    expect(filterLibraryTree(tree, '  ')).toBe(tree)
  })

  it('ignores accents and case, retaining ancestors and excluding siblings', () => {
    const result = filterLibraryTree(tree, ' comunicacao ')
    expect(result.collections[0].collection).toBe(tree.collections[0].collection)
    expect(result.collections[0].children[0].code.id).toBe(1)
    expect(result.collections[0].children[0].children.map((n) => n.code.id)).toEqual([2])
    expect(result.loose.map((n) => n.code.id)).toEqual([4])
    expect(group.children).toHaveLength(2)
  })

  it('keeps the children when the group name matches', () => {
    expect(filterLibraryTree(tree, 'experiencias').collections[0].children[0]).toBe(group)
  })

  it('removes collections and loose codes without matches', () => {
    expect(filterLibraryTree(tree, 'inexistente')).toEqual({ collections: [], loose: [] })
  })
})
