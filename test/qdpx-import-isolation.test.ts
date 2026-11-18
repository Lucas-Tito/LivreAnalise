import JSZip from 'jszip'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDatabase, getActivePath, closeDatabase } from '../src/main/db'
import { listCodes, createCode, listDocuments, getDocument, listCodingsByDocument, listNotesByDocument, listProjectNotes } from '../src/main/db/repositories'
import { importProjectIntoDb } from '../src/main/qdpx/import'
import { deserializeQdpx, serializeQdpx } from '../src/main/qdpx/serialize'
import { importQdpxAsProject } from '../src/main/ipc/qdpx'
import type { QdpxProject } from '../src/main/qdpx/model'

const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('electron', () => ({
  app: { getVersion: () => '0.7.0' },
  dialog: { showOpenDialog: save }, ipcMain: { handle: vi.fn() }
}))
vi.mock('../src/main/services/recents', () => ({ pushRecent: vi.fn() }))

let dir: string
const project: QdpxProject = {
  name: 'P', users: [], codes: [{ guid: 'c', name: 'Importado', parentGuid: null }],
  documents: [], notes: [], groups: [], projectNoteGuids: []
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'liva-import-'))
  openDatabase(join(dir, 'original.liva'))
  createCode({ name: 'Original', color: '#112233' })
})
afterEach(() => { closeDatabase(); rmSync(dir, { recursive: true, force: true }) })

it('rolls back all inserted records on a duplicate GUID', () => {
  expect(() => importProjectIntoDb({
    project: { ...project, codes: [...project.codes, ...project.codes] }, skipped: []
  })).toThrow()
  expect(listCodes().map((c) => c.name)).toEqual(['Original'])
})

it('keeps the original connection and data when the archive is invalid', async () => {
  const original = getActivePath()
  const archive = join(dir, 'invalid.qdpx')
  writeFileSync(archive, 'not a zip')
  save.mockResolvedValue({ filePaths: [dir] })
  await expect(importQdpxAsProject(archive, 'imported')).rejects.toThrow()
  expect(getActivePath()).toBe(original)
  expect(listCodes().map((c) => c.name)).toEqual(['Original'])
})

it('refuses to overwrite an existing destination', async () => {
  const dest = join(dir, 'existing.liva')
  writeFileSync(dest, 'preserve')
  save.mockResolvedValue({ filePaths: [dir] })
  await expect(importQdpxAsProject('unused.qdpx', 'existing')).rejects.toThrow('Já existe')
  expect(readFileSync(dest, 'utf8')).toBe('preserve')
})

it('publishes the isolated import only after success', async () => {
  const archive = join(dir, 'valid.qdpx')
  writeFileSync(archive, await serializeQdpx(project))
  const dest = join(dir, 'imported.liva')
  save.mockResolvedValue({ filePaths: [dir] })
  const result = await importQdpxAsProject(archive, 'imported')
  expect(result?.path).toBe(dest)
  expect(listCodes().map((c) => c.name)).toEqual(['Importado'])
})

it('preserves CRLF, BOM and whitespace without moving imported anchors', async () => {
  const plainText = '\uFEFFa\r\nbc'
  const body = '  primeira linha\nsegunda linha\n'
  const parsed = await deserializeQdpx(await serializeQdpx({
    ...project,
    notes: [{ guid: 'n', name: 'N', plainText: body, description: null }],
    projectNoteGuids: ['n'],
    documents: [{
      guid: 'd', name: 'CRLF', plainText, noteGuids: [],
      selections: [{ guid: 's', startPosition: 4, endPosition: 5, codeGuids: ['c'], noteGuids: ['n'] }]
    }]
  }))
  importProjectIntoDb(parsed)
  const doc = getDocument(listDocuments()[0].id)!
  expect(doc.plainText).toBe(plainText)
  const coding = listCodingsByDocument(doc.id)[0]
  expect(doc.plainText.slice(coding.startPos, coding.endPos)).toBe('b')
  expect(listProjectNotes()[0].body).toBe(body)
  expect(listNotesByDocument(doc.id)[0].body).toBe(body)
})

it('imports available sources and reports missing embedded and external text', async () => {
  const zip = await JSZip.loadAsync(await serializeQdpx({
    ...project,
    documents: ['local', 'missing', 'external'].map((guid) => ({
      guid, name: guid, plainText: guid, noteGuids: [],
      selections: [{ guid: guid + '-s', startPosition: 0, endPosition: 2, codeGuids: ['c'], noteGuids: [] }]
    }))
  }))
  zip.remove('Sources/missing.txt')
  const qde = await zip.file('project.qde')!.async('string')
  zip.file('project.qde', qde.replace('internal://external.txt', 'relative://external.txt'))
  const parsed = await deserializeQdpx(await zip.generateAsync({ type: 'nodebuffer' }))
  const report = importProjectIntoDb(parsed)
  expect(listDocuments().map((doc) => doc.name)).toEqual(['local'])
  expect(report).toMatchObject({ documents: 1, codings: 1 })
  expect(report.skipped).toEqual([
    expect.stringContaining('internal://missing.txt'),
    expect.stringContaining('relative://external.txt')
  ])
})
