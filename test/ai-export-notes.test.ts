import { describe, expect, it } from 'vitest'
import { buildAiExport } from '../src/shared/aiExport'
import type { Note } from '../src/shared/types'

function note(id: number, partial: Partial<Note>): Note {
  return {
    id,
    guid: `n${id}`,
    title: null,
    body: 'corpo',
    scope: 'project',
    documentId: null,
    startPos: null,
    endPos: null,
    anchorStatus: 'attached',
    anchorText: null,
    createdAt: '',
    updatedAt: '',
    ...partial
  }
}

const base = {
  projectName: 'P',
  codes: [],
  collections: [],
  members: [],
  allCodings: []
} as const

describe('ai export notes', () => {
  it('omits notes without opt-in', () => {
    const out = buildAiExport({
      ...base,
      scope: 'full',
      documents: [{ id: 1, name: 'D', plainText: 'texto', codings: [] }],
      includeNotes: false,
      projectNotes: [note(1, { title: 'Secreta', body: 'não vazar' })],
      notesByDocument: new Map()
    })
    expect(out).not.toContain('Secreta')
  })

  it('marks notes as researcher comment in document scope', () => {
    const out = buildAiExport({
      ...base,
      scope: 'document',
      documents: [{ id: 1, name: 'D', plainText: '0123456789', codings: [] }],
      includeNotes: true,
      projectNotes: [],
      notesByDocument: new Map([
        [1, [note(2, { scope: 'excerpt', documentId: 1, startPos: 0, endPos: 4, title: 'T', body: 'obs' })]]
      ])
    })
    expect(out).toContain('Comentário do pesquisador')
    expect(out).toContain('[trecho 0–4 «0123»]')
  })

  it('labels detached notes with the original text', () => {
    const out = buildAiExport({
      ...base,
      scope: 'full',
      documents: [{ id: 1, name: 'D', plainText: 'texto', codings: [] }],
      includeNotes: true,
      projectNotes: [],
      notesByDocument: new Map([
        [1, [note(3, { scope: 'excerpt', documentId: 1, anchorStatus: 'detached', anchorText: 'original', title: 'T', body: 'obs' })]]
      ])
    })
    expect(out).toContain('âncora perdida')
    expect(out).toContain('«original»')
  })

  it('never leaks note bodies in structure scope', () => {
    const out = buildAiExport({
      ...base,
      scope: 'structure',
      documents: [],
      includeNotes: true,
      projectNotes: [note(4, { title: 'Plano', body: 'SEGREDO-CORPO' })],
      notesByDocument: { 1: [note(5, { scope: 'document', documentId: 1, title: 'Doc', body: 'OUTRO-SEGREDO' })] }
    })
    expect(out).toContain('Plano')
    expect(out).not.toContain('SEGREDO-CORPO')
    expect(out).not.toContain('OUTRO-SEGREDO')
  })
})
