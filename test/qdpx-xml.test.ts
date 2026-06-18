import { describe, expect, it } from 'vitest'
import { buildQde, parseQde } from '../src/main/qdpx/xml'
import type { QdpxProject } from '../src/main/qdpx/model'

function sampleProject(): QdpxProject {
  return {
    name: 'Projeto Teste',
    users: [{ guid: 'u1', name: 'Pesquisador' }],
    codes: [
      {
        guid: 'c-emocoes',
        name: 'Emocoes',
        color: '#ff0000',
        description: 'Categoria mae',
        parentGuid: null
      },
      {
        guid: 'c-medo',
        name: 'Medo',
        color: '#00ff00',
        description: null,
        parentGuid: 'c-emocoes'
      },
      {
        guid: 'c-trabalho',
        name: 'Trabalho',
        color: '#0000ff',
        description: null,
        parentGuid: null
      }
    ],
    groups: [
      {
        guid: 'g-fase1',
        name: 'Fase 1',
        description: 'Primeira analise',
        memberCodeGuids: ['c-medo', 'c-trabalho']
      }
    ],
    documents: [
      {
        guid: 'd1',
        name: 'Entrevista 1',
        plainText: '',
        selections: [
          {
            guid: 's1',
            startPosition: 10,
            endPosition: 25,
            codeGuids: ['c-medo', 'c-trabalho']
          },
          {
            guid: 's2',
            startPosition: 40,
            endPosition: 55,
            codeGuids: ['c-trabalho']
          }
        ]
      }
    ]
  }
}

const byGuid = <T extends { guid: string }>(arr: T[]): T[] =>
  [...arr].sort((a, b) => a.guid.localeCompare(b.guid))

describe('buildQde / parseQde round-trip', () => {
  it('produces valid xml with the REFI-QDA namespace', () => {
    const xml = buildQde(sampleProject())
    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>')
    expect(xml).toContain('urn:QDA-XML:project:1.0')
    expect(xml).toContain('<CodeBook>')
  })

  it('preserves codes and their hierarchy', () => {
    const { project } = parseQde(buildQde(sampleProject()))
    const codes = byGuid(project.codes)
    expect(codes).toHaveLength(3)
    const medo = codes.find((c) => c.guid === 'c-medo')!
    expect(medo.parentGuid).toBe('c-emocoes')
    expect(medo.name).toBe('Medo')
    const emocoes = codes.find((c) => c.guid === 'c-emocoes')!
    expect(emocoes.parentGuid).toBeNull()
    expect(emocoes.description).toBe('Categoria mae')
  })

  it('preserves groups and their members', () => {
    const { project } = parseQde(buildQde(sampleProject()))
    expect(project.groups).toHaveLength(1)
    const g = project.groups[0]
    expect(g.name).toBe('Fase 1')
    expect(byGuid(g.memberCodeGuids.map((guid) => ({ guid }))).map((x) => x.guid)).toEqual([
      'c-medo',
      'c-trabalho'
    ])
  })

  it('preserves documents and their selections with code references', () => {
    const { project } = parseQde(buildQde(sampleProject()))
    expect(project.documents).toHaveLength(1)
    const doc = project.documents[0]
    expect(doc.selections).toHaveLength(2)
    const s1 = doc.selections.find((s) => s.startPosition === 10)!
    expect(s1.endPosition).toBe(25)
    expect(s1.codeGuids.sort()).toEqual(['c-medo', 'c-trabalho'])
    const s2 = doc.selections.find((s) => s.startPosition === 40)!
    expect(s2.codeGuids).toEqual(['c-trabalho'])
  })
})
