import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import * as db from '../src/main/db'
import * as repos from '../src/main/db/repositories'
import * as history from '../src/main/history/stack'
import { buildProjectFromDb } from '../src/main/qdpx/export'
import { importProjectIntoDb } from '../src/main/qdpx/import'
import { deserializeQdpx, serializeQdpx } from '../src/main/qdpx/serialize'

describe('memos de itens', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'livre-memos-'))
    history.clearAllHistory()
  })
  afterEach(() => {
    db.closeDatabase()
    rmSync(dir, { recursive: true, force: true })
  })

  it('persiste textos exatos, movimentos, membros e histórico sem alterar documentos ou citações', () => {
    const path = join(dir, 'projeto.liva')
    db.openDatabase(path)
    const code = repos.createCode({ name: 'Código', color: '#123456', description: 'descrição' })
    const category = repos.createCode({ name: 'Categoria', color: '#123456', isCategory: true })
    const group = repos.createCollection({ name: 'Grupo', description: 'grupo descrição' })
    const doc = repos.createDocument({ name: 'Documento', plainText: 'transcrição', originalFormat: 'txt' })
    const coding = repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 5 })
    const memo = '  linha 1\n\nlinha 2  \n'
    repos.updateCode({ id: code.id, memo })
    repos.updateCode({ id: category.id, memo: 'categoria\ntexto' })
    repos.updateCollection({ id: group.id, memo: 'grupo\ntexto' })
    repos.moveCodes({ ids: [code.id], parentId: category.id })
    repos.addCollectionMember(group.id, code.id)
    repos.removeCollectionMember(group.id, code.id)
    db.closeDatabase()
    db.openDatabase(path)
    expect(repos.listCodes().find((c) => c.id === code.id)).toMatchObject({ memo, description: 'descrição', parentId: category.id })
    expect(repos.listCodes().find((c) => c.id === category.id)?.memo).toBe('categoria\ntexto')
    expect(repos.listCollections()[0]).toMatchObject({ memo: 'grupo\ntexto', description: 'grupo descrição' })
    expect(repos.getDocument(doc.id)?.plainText).toBe('transcrição')
    expect(repos.listCodingsByDocument(doc.id)).toEqual([coding])
    history.clearAllHistory()
    repos.updateCode({ id: code.id, memo: '' })
    expect(repos.listCodes().find((c) => c.id === code.id)?.memo).toBe('')
    history.historyUndo()
    expect(repos.listCodes().find((c) => c.id === code.id)?.memo).toBe(memo)
    repos.deleteCollection(group.id)
    history.historyUndo()
    expect(repos.listCollections()[0].memo).toBe('grupo\ntexto')
    repos.deleteCode(category.id)
    history.historyUndo()
    expect(repos.listCodes().find((c) => c.id === code.id)?.memo).toBe(memo)
  })

  it('migra projeto versão 3 com dados e descrições intactos', () => {
    const path = join(dir, 'antigo.liva')
    db.openDatabase(path)
    db.closeDatabase()
    const raw = new Database(path)
    raw.exec("ALTER TABLE codes DROP COLUMN memo; ALTER TABLE code_groups DROP COLUMN memo; PRAGMA user_version = 3; INSERT INTO codes(guid, name, description, is_category) VALUES ('c', 'Antigo', 'descrição', 0); INSERT INTO code_groups(guid, name, description) VALUES ('g', 'Grupo', 'detalhe')")
    raw.close()
    db.openDatabase(path)
    expect(repos.listCodes()[0]).toMatchObject({ name: 'Antigo', description: 'descrição', memo: '' })
    expect(repos.listCollections()[0]).toMatchObject({ name: 'Grupo', description: 'detalhe', memo: '' })
    db.closeDatabase()
    db.openDatabase(path)
    expect(repos.listCodes()[0].memo).toBe('')
  })

  it('agrupa salvamentos automáticos consecutivos no histórico', () => {
    db.openDatabase(':memory:')
    const code = repos.createCode({ name: 'Código', color: '#123456' })
    const group = repos.createCollection({ name: 'Grupo' })
    history.clearAllHistory()
    repos.updateCode({ id: code.id, memo: 'primeiro' })
    repos.updateCode({ id: code.id, memo: 'último' })
    history.historyUndo()
    expect(repos.listCodes()[0].memo).toBe('')
    history.historyRedo()
    expect(repos.listCodes()[0].memo).toBe('último')
    repos.updateCollection({ id: group.id, memo: 'primeiro' })
    repos.updateCollection({ id: group.id, memo: 'último' })
    history.historyUndo()
    expect(repos.listCollections()[0].memo).toBe('')
    history.historyRedo()
    expect(repos.listCollections()[0].memo).toBe('último')
  })

  it('separa a próxima gravação de memo depois de desfazer outra ação', () => {
    db.openDatabase(':memory:')
    const code = repos.createCode({ name: 'Código', color: '#123456' })
    const group = repos.createCollection({ name: 'Grupo' })
    const edits = [
      { save: (memo: string) => repos.updateCode({ id: code.id, memo }), read: () => repos.listCodes()[0].memo },
      { save: (memo: string) => repos.updateCollection({ id: group.id, memo }), read: () => repos.listCollections()[0].memo }
    ]
    for (const { save, read } of edits) {
      history.clearAllHistory()
      save('A')
      repos.createCollection({ name: 'Outro grupo' })
      history.historyUndo()
      save('B')
      history.historyUndo()
      expect(read()).toBe('A')
    }
  })

  it('rejeita gravar o memo de um código que foi desfeito', () => {
    db.openDatabase(':memory:')
    const code = repos.createCode({ name: 'Código', color: '#123456' })
    history.historyUndo()
    expect(() => repos.updateCode({ id: code.id, memo: 'rascunho' })).toThrow('Código não encontrado')
    expect(history.historyState().canRedo).toBe(true)
  })

  it('cria a categoria e o vínculo com o grupo no mesmo passo do histórico', () => {
    db.openDatabase(':memory:')
    const code = repos.createCode({ name: 'Código', color: '#123456' })
    const group = repos.createCollection({ name: 'Grupo' })
    repos.addCollectionMember(group.id, code.id)
    history.clearAllHistory()

    expect(() => repos.createGroupCode('Categoria', code.color, code.id, group.id + 1)).toThrow()
    expect(repos.listCodes().map((entry) => entry.parentId)).toEqual([null])
    expect(history.historyState().canUndo).toBe(false)

    const category = repos.createGroupCode('Categoria', code.color, code.id, group.id)
    expect(repos.listCollectionMembers(group.id)).toEqual([code.id, category.id])
    history.historyUndo()
    expect(repos.listCodes()).toEqual([expect.objectContaining({ id: code.id, parentId: null })])
    expect(repos.listCollectionMembers(group.id)).toEqual([code.id])
    expect(history.historyState().canUndo).toBe(false)
    history.historyRedo()
    expect(repos.listCodes().find((entry) => entry.id === code.id)?.parentId).toBe(category.id)
    expect(repos.listCollectionMembers(group.id)).toEqual([code.id, category.id])
  })

  it('preserva como nota de projeto o título de uma nota de código sem corpo', async () => {
    db.openDatabase(':memory:')
    const source = {
      name: 'Projeto', users: [], groups: [], documents: [], projectNoteGuids: [],
      codes: [{ guid: 'c', parentGuid: null, name: 'Código', color: '#123456', description: null, noteGuids: ['n'] }],
      notes: [{ guid: 'n', name: 'Título preservado', plainText: '', description: null }]
    }
    const parsed = await deserializeQdpx(await serializeQdpx(source))
    importProjectIntoDb(parsed)
    expect(repos.listCodes()[0].memo).toBe('')
    expect(repos.listProjectNotes()).toEqual([expect.objectContaining({ title: 'Título preservado', body: '' })])
  })

  it('adiciona vários códigos ao grupo em uma única operação reversível', () => {
    db.openDatabase(':memory:')
    const a = repos.createCode({ name: 'A', color: '#000000' })
    const b = repos.createCode({ name: 'B', color: '#000000' })
    const group = repos.createCollection({ name: 'Grupo' })
    expect(() => repos.addCollectionMembers(group.id, [a.id, b.id + 1])).toThrow()
    expect(repos.listCollectionMembers(group.id)).toEqual([])
    repos.addCollectionMembers(group.id, [a.id, b.id])
    expect(repos.listCollectionMembers(group.id)).toEqual([a.id, b.id])
    history.historyUndo()
    expect(repos.listCollectionMembers(group.id)).toEqual([])
    history.historyRedo()
    expect(repos.listCollectionMembers(group.id)).toEqual([a.id, b.id])
  })

  it('preserva a nota original de um memo importado com título e descrição', () => {
    db.openDatabase(':memory:')
    const project = {
      name: 'Projeto', users: [], groups: [], documents: [], projectNoteGuids: [],
      codes: [{ guid: 'c', parentGuid: null, name: 'Código', noteGuids: ['n'] }],
      notes: [{ guid: 'n', name: 'Título original', plainText: 'Texto', description: 'Descrição original' }]
    }
    importProjectIntoDb({ project, origin: 'Outro editor', skipped: [] })
    expect(repos.listCodes()[0].memo).toBe('Texto')
    expect(repos.listProjectNotes()).toEqual([expect.objectContaining({
      title: 'Título original', body: 'Texto', anchorText: 'Descrição original'
    })])
  })

  it('preserva memos de códigos e categorias em QDPX e avisa sobre grupos', async () => {
    db.openDatabase(':memory:')
    const category = repos.createCode({ name: 'Categoria', color: '#112233', isCategory: true })
    const code = repos.createCode({ name: 'Código', color: '#112233', parentId: category.id, description: 'descrição' })
    const group = repos.createCollection({ name: 'Grupo' })
    repos.updateCode({ id: category.id, memo: 'categoria\nsegunda linha' })
    repos.updateCode({ id: code.id, memo: 'código\n\nlinha final' })
    repos.updateCollection({ id: group.id, memo: 'não exportado' })
    const exported = buildProjectFromDb('Projeto')
    expect(exported.warnings.join(' ')).toMatch(/não foram exportados/)
    const parsed = await deserializeQdpx(await serializeQdpx(exported.project))
    db.openDatabase(':memory:')
    const report = importProjectIntoDb(parsed)
    expect(report.skipped).toEqual([])
    expect(repos.listCodes().find((c) => c.name === 'Código')).toMatchObject({ memo: 'código\n\nlinha final', description: 'descrição' })
    expect(repos.listCodes().find((c) => c.name === 'Categoria')?.memo).toBe('categoria\nsegunda linha')
    expect(repos.listProjectNotes()).toHaveLength(0)
  })
})
