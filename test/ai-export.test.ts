import { describe, expect, it } from 'vitest'
import {
  buildAiExport,
  buildDocumentSection,
  buildStructureSection,
  suggestedFileName
} from '../src/shared/aiExport'
import type { Code, Coding, Collection, CollectionMember } from '../src/shared/types'

function code(id: number, name: string, parentId: number | null = null): Code {
  return {
    id,
    guid: `g${id}`,
    name,
    color: '#000',
    description: null,
    parentId,
    sortOrder: 0,
    createdAt: ''
  }
}

function coding(id: number, codeId: number, startPos: number, endPos: number): Coding {
  return { id, guid: `c${id}`, documentId: 1, codeId, startPos, endPos, createdAt: '' }
}

const colecao: Collection = {
  id: 10,
  guid: 'col',
  name: 'Conceituação',
  description: null,
  sortOrder: 0
}
const membro: CollectionMember = { collectionId: 10, codeId: 1 }

describe('buildDocumentSection', () => {
  it('marks the coded excerpt inline', () => {
    const saida = buildDocumentSection(
      { name: 'Entrevista 1', plainText: 'antes trecho depois', codings: [coding(1, 2, 6, 12)] },
      [code(2, 'TRANSPARÊNCIA')]
    )
    expect(saida).toContain('antes «trecho» [TRANSPARÊNCIA] depois')
  })

  it('lists both codes when they cover the same excerpt', () => {
    const saida = buildDocumentSection(
      {
        name: 'd',
        plainText: 'um dois tres',
        codings: [coding(1, 2, 3, 7), coding(2, 3, 3, 7)]
      },
      [code(2, 'A'), code(3, 'B')]
    )
    expect(saida).toContain('«dois» [A, B]')
  })

  // sobreposição parcial: o computeSegments quebra em pedaços, e cada pedaço leva
  // os códigos que realmente o cobrem
  it('splits a partial overlap into separate excerpts', () => {
    const saida = buildDocumentSection(
      {
        name: 'd',
        plainText: 'abcdefghij',
        codings: [coding(1, 2, 0, 6), coding(2, 3, 3, 9)]
      },
      [code(2, 'A'), code(3, 'B')]
    )
    expect(saida).toContain('«abc» [A]')
    expect(saida).toContain('«def» [A, B]')
    expect(saida).toContain('«ghi» [B]')
  })

  it('keeps text with no coding untouched', () => {
    const saida = buildDocumentSection(
      { name: 'd', plainText: 'nada marcado aqui', codings: [] },
      []
    )
    expect(saida).toContain('nada marcado aqui')
    expect(saida).not.toContain('«')
  })
})

describe('buildStructureSection', () => {
  it('nests collection, group and code', () => {
    const saida = buildStructureSection(
      [code(1, 'GRUPO'), code(2, 'codigo filho', 1)],
      [colecao],
      [membro],
      [coding(1, 2, 0, 5)]
    )
    expect(saida).toContain('### Coleção: Conceituação')
    expect(saida).toContain('- GRUPO (grupo)')
    expect(saida).toContain('  - codigo filho — 1 citações')
  })

  it('marks an empty collection instead of hiding it', () => {
    expect(buildStructureSection([], [colecao], [], [])).toContain('_(vazia)_')
  })
})

describe('buildAiExport', () => {
  const base = {
    projectName: 'SBSI',
    codes: [code(1, 'GRUPO'), code(2, 'filho', 1)],
    collections: [colecao],
    members: [membro],
    documents: [
      { name: 'Entrevista 1', plainText: 'fala do participante', codings: [coding(1, 2, 0, 4)] }
    ],
    allCodings: [coding(1, 2, 0, 4)]
  }

  // o escopo "somente estrutura" existe para não expor ninguém
  it('never includes interview text in the structure scope', () => {
    const saida = buildAiExport({ ...base, scope: 'structure', documents: [] })
    expect(saida).not.toContain('fala do participante')
    expect(saida).toContain('GRUPO')
  })

  it('includes the document text in the full scope', () => {
    const saida = buildAiExport({ ...base, scope: 'full' })
    expect(saida).toContain('## Documento: Entrevista 1')
    expect(saida).toContain('«fala»')
  })

  it('always warns that the material leaves the computer', () => {
    for (const scope of ['structure', 'document', 'full'] as const) {
      expect(buildAiExport({ ...base, scope })).toContain('sai do seu computador')
    }
  })

  it('explains the markup only when there is marked text', () => {
    expect(buildAiExport({ ...base, scope: 'structure', documents: [] })).not.toContain(
      'Trechos entre'
    )
    expect(buildAiExport({ ...base, scope: 'full' })).toContain('Trechos entre')
  })
})

describe('suggestedFileName', () => {
  it('names the file after the project and the scope', () => {
    expect(suggestedFileName('SBSI', 'document')).toBe('SBSI - para IA (documento).txt')
    expect(suggestedFileName('SBSI', 'structure')).toBe('SBSI - para IA (estrutura).txt')
  })
})
