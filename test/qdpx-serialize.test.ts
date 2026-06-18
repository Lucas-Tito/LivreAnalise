import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { deserializeQdpx, serializeQdpx } from '../src/main/qdpx/serialize'
import type { QdpxProject } from '../src/main/qdpx/model'

function project(): QdpxProject {
  return {
    name: 'Round Trip',
    users: [],
    codes: [
      { guid: 'c1', name: 'Codigo 1', color: '#123456', description: null, parentGuid: null }
    ],
    groups: [],
    documents: [
      {
        guid: 'doc-1',
        name: 'Entrevista',
        plainText: 'Era uma vez\numa transcricao com varias linhas.\nFim.',
        selections: [
          { guid: 's1', startPosition: 0, endPosition: 11, codeGuids: ['c1'] }
        ]
      }
    ]
  }
}

describe('serializeQdpx / deserializeQdpx', () => {
  it('creates a zip containing project.qde and the Sources folder', async () => {
    const buffer = await serializeQdpx(project())
    const zip = await JSZip.loadAsync(buffer)
    expect(zip.file('project.qde')).not.toBeNull()
    expect(zip.file('Sources/doc-1.txt')).not.toBeNull()
  })

  it('round-trips the plain text content from the Sources folder', async () => {
    const buffer = await serializeQdpx(project())
    const { project: parsed } = await deserializeQdpx(buffer)
    expect(parsed.documents).toHaveLength(1)
    expect(parsed.documents[0].plainText).toBe(
      'Era uma vez\numa transcricao com varias linhas.\nFim.'
    )
  })

  it('keeps selection offsets aligned with the stored text', async () => {
    const p = project()
    const buffer = await serializeQdpx(p)
    const { project: parsed } = await deserializeQdpx(buffer)
    const sel = parsed.documents[0].selections[0]
    const text = parsed.documents[0].plainText
    expect(text.slice(sel.startPosition, sel.endPosition)).toBe('Era uma vez')
  })

  it('reports unsupported elements as skipped (none in a clean project)', async () => {
    const buffer = await serializeQdpx(project())
    const { skipped } = await deserializeQdpx(buffer)
    expect(skipped).toEqual([])
  })
})
