import { describe, expect, it } from 'vitest'
import {
  buildAiExport,
  buildDocumentSection,
  buildStructureSection,
  buildNotesSection,
  buildQuotesSection,
  sanearNota,
  suggestedFileName
} from '../src/shared/aiExport'
import type { Code, Coding, Collection, CollectionMember, Note } from '../src/shared/types'

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
    expect(saida).toContain('### Grupo: Conceituação')
    expect(saida).toContain('- GRUPO (categoria)')
    expect(saida).toContain('  - codigo filho — 1 citações')
  })

  it('marks an empty collection instead of hiding it', () => {
    expect(buildStructureSection([], [colecao], [], [])).toContain('_(vazio)_')
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

  it('adds the marked excerpts, without the whole document, when asked in the structure scope', () => {
    const saida = buildAiExport({
      ...base,
      scope: 'structure',
      documents: [],
      includeQuotes: true,
      quoteDocuments: [{ id: 1, ...base.documents[0] }]
    })
    expect(saida).toContain('## Trechos marcados por código')
    expect(saida).toContain('- [Entrevista 1] «fala»')
    expect(saida).not.toContain('fala do participante')
  })

  it('ignores the excerpts option outside the structure scope', () => {
    const saida = buildAiExport({
      ...base,
      scope: 'full',
      includeQuotes: true,
      quoteDocuments: [{ id: 1, ...base.documents[0] }]
    })
    expect(saida).not.toContain('## Trechos marcados por código')
  })
})

describe('buildQuotesSection', () => {
  const doc = { id: 1, name: 'E1', plainText: 'um\ndois «tres» quatro', codings: [] }

  it('groups excerpts under each code, with the category in the heading', () => {
    const saida = buildQuotesSection(
      [code(1, 'CAT'), code(2, 'filho', 1), code(3, 'solto')],
      [coding(1, 2, 0, 6), coding(2, 3, 7, 14)],
      [doc]
    )
    expect(saida).toContain('### CAT › filho (1)')
    expect(saida).toContain('### solto (1)')
    expect(saida).not.toContain('### CAT (')
  })

  // quebra de linha e aspas angulares no trecho forjariam a estrutura do arquivo
  it('keeps each excerpt on one line and neutralizes the angle quotes', () => {
    const saida = buildQuotesSection([code(2, 'A')], [coding(1, 2, 0, 14)], [doc])
    expect(saida).toContain('- [E1] «um dois "tres"»')
  })

  it('says so when nothing is marked', () => {
    expect(buildQuotesSection([code(2, 'A')], [], [doc])).toContain('nenhum trecho marcado')
  })
})

describe('suggestedFileName', () => {
  it('names the file after the project and the scope', () => {
    expect(suggestedFileName('SBSI', 'document')).toBe('SBSI - para IA (documento).txt')
    expect(suggestedFileName('SBSI', 'structure')).toBe('SBSI - para IA (estrutura).txt')
    expect(suggestedFileName('SBSI', 'structure', undefined, true)).toBe(
      'SBSI - para IA (estrutura e trechos).txt'
    )
  })

  it('puts the document name in the file so two documents do not collide', () => {
    expect(suggestedFileName('SBSI', 'document', 'Entrevista 3')).toBe(
      'SBSI - Entrevista 3 - para IA.txt'
    )
    expect(suggestedFileName('SBSI', 'document', 'a/b')).toBe('SBSI - a-b - para IA.txt')
  })
})

describe('sanearNota', () => {
  // O export ensina a IA a ler a estrutura; uma nota que contenha esse padrão
  // forja a estrutura e desloca o resto para o documento errado. Não precisa de
  // má fé: basta o pesquisador escrever um memo sobre a própria ferramenta.
  it('neutraliza cabeçalho no começo de linha', () => {
    const saida = sanearNota('lembrar de checar\n## Documento: Entrevista 5')
    expect(saida).not.toMatch(/(^|\s)## Documento:/)
    expect(saida).toContain('Documento: Entrevista 5')
  })

  it('neutraliza as aspas que delimitam trecho codificado', () => {
    expect(sanearNota('ele disse «isso aqui»')).toBe('ele disse "isso aqui"')
  })

  it('não deixa a nota quebrar a linha do item', () => {
    expect(sanearNota('primeira\nsegunda')).toBe('primeira segunda')
  })

  it('trunca nota muito longa em vez de despejar tudo', () => {
    const saida = sanearNota('x'.repeat(5000))
    expect(saida.length).toBeLessThan(2100)
    expect(saida).toContain('nota truncada')
  })

  it('não mexe em nota comum', () => {
    expect(sanearNota('o entrevistado se contradiz')).toBe('o entrevistado se contradiz')
  })
})

describe('saneamento do trecho e da âncora', () => {
  function nota(extra: Partial<Note>): Note {
    return {
      id: 1, guid: 'n1', title: null, body: 'corpo', scope: 'excerpt',
      documentId: 1, startPos: 0, endPos: 0, anchorStatus: 'attached',
      anchorText: null, createdAt: '', updatedAt: '', ...extra
    } as Note
  }

  // O trecho e o anchorText vêm do texto do documento e podem ter quebra de
  // linha: sem sanear, a linha do item partia e o resto aparecia como item
  // solto fora de qualquer nota — o mesmo deslocamento de estrutura que o
  // sanearNota existe para evitar.
  const itens = (saida: string): string[] =>
    saida.split('\n').filter((l) => l.startsWith('- '))

  it('o trecho vivo não quebra a linha do item', () => {
    const saida = buildNotesSection(
      'document',
      [],
      [nota({ startPos: 0, endPos: 11 })],
      'D',
      'par1\npar2xx'
    )
    expect(itens(saida)).toHaveLength(1)
    expect(saida).toContain('par1 par2xx')
  })

  it('a âncora perdida também não quebra', () => {
    const saida = buildNotesSection(
      'document',
      [],
      [nota({ anchorStatus: 'detached', startPos: null, endPos: null, anchorText: 'par1\npar2' })],
      'D',
      'x'
    )
    expect(itens(saida)).toHaveLength(1)
  })
})
