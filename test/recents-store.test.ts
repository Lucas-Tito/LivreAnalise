import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  pushRecent,
  readStoredRecents,
  removeRecent,
  renameRecent,
  replaceRecent,
  visibleRecents,
  writeStoredRecents
} from '../src/main/services/recentsStore'

describe('recentsStore', () => {
  let dir = ''
  let file = ''
  let projeto = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-recents-'))
    file = join(dir, 'recent-projects.json')
    projeto = join(dir, 'projeto.liva')
    writeFileSync(projeto, 'x')
    writeStoredRecents(file, [
      { path: projeto, name: 'projeto', lastOpenedAt: '2026-01-01T00:00:00.000Z' }
    ])
  })

  // O bug: o arquivo e renomeado primeiro, entao a entrada antiga aponta para um
  // caminho que nao existe mais. Se a mutacao ler pela lista filtrada, a entrada
  // desaparece e o projeto sai da lista de recentes.
  it('keeps the entry when the file was already renamed', () => {
    const novo = join(dir, 'renomeado.liva')
    renameSync(projeto, novo)

    replaceRecent(file, projeto, novo, 'renomeado')

    const stored = readStoredRecents(file)
    expect(stored).toHaveLength(1)
    expect(stored[0].path).toBe(novo)
    expect(stored[0].name).toBe('renomeado')
    expect(visibleRecents(stored)).toHaveLength(1)
  })

  it('preserves the last opened date when replacing the path', () => {
    const novo = join(dir, 'outro.liva')
    renameSync(projeto, novo)
    replaceRecent(file, projeto, novo, 'outro')
    expect(readStoredRecents(file)[0].lastOpenedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  // Um projeto num HD externo desmontado nao pode ser apagado da lista so
  // porque outro projeto foi aberto.
  it('does not drop an entry whose file is momentarily missing', () => {
    const ausente = join(dir, 'em-hd-externo.liva')
    writeStoredRecents(file, [
      ...readStoredRecents(file),
      { path: ausente, name: 'externo', lastOpenedAt: '2026-01-02T00:00:00.000Z' }
    ])

    pushRecent(file, projeto, 'projeto', '2026-02-01T00:00:00.000Z')

    const stored = readStoredRecents(file)
    expect(stored.map((r) => r.path)).toContain(ausente)
    // mas ele nao aparece na tela
    expect(visibleRecents(stored).map((r) => r.path)).not.toContain(ausente)
  })

  it('renames without touching the other entries', () => {
    const outro = join(dir, 'segundo.liva')
    writeFileSync(outro, 'y')
    pushRecent(file, outro, 'segundo', '2026-02-01T00:00:00.000Z')

    renameRecent(file, projeto, 'nome novo')

    const stored = readStoredRecents(file)
    expect(stored.find((r) => r.path === projeto)?.name).toBe('nome novo')
    expect(stored.find((r) => r.path === outro)?.name).toBe('segundo')
  })

  it('puts the most recent project first', () => {
    const outro = join(dir, 'segundo.liva')
    writeFileSync(outro, 'y')
    pushRecent(file, outro, 'segundo', '2026-02-01T00:00:00.000Z')
    expect(readStoredRecents(file)[0].path).toBe(outro)
  })

  it('does not duplicate a project that is opened again', () => {
    pushRecent(file, projeto, 'projeto', '2026-02-01T00:00:00.000Z')
    expect(readStoredRecents(file)).toHaveLength(1)
  })

  it('removes an entry without touching the file on disk', () => {
    removeRecent(file, projeto)
    expect(readStoredRecents(file)).toHaveLength(0)
    expect(visibleRecents([{ path: projeto, name: 'x', lastOpenedAt: '' }])).toHaveLength(1)
  })

  it('survives a corrupt recents file', () => {
    writeFileSync(file, 'isso nao e json')
    expect(readStoredRecents(file)).toEqual([])
  })

  it('cleans up', () => {
    rmSync(dir, { recursive: true, force: true })
    expect(true).toBe(true)
  })
})
