import { createRequire } from 'module'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  const Database = require('better-sqlite3')
  new Database(':memory:').close()
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('GUID da seleção criada para uma nota', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let exportMod: typeof import('../src/main/qdpx/export')
  let xml: typeof import('../src/main/qdpx/xml')

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    exportMod = await import('../src/main/qdpx/export')
    xml = await import('../src/main/qdpx/xml')
    db.openDatabase(':memory:')
  })

  // No REFI-QDA o guid identifica o objeto no projeto inteiro. A seleção reusava
  // o guid da nota, então o arquivo saía com dois objetos de tipos diferentes
  // carregando a mesma matrícula. O nosso importador não reclamava porque ignora
  // o guid das seleções; quem tropeçaria é o ATLAS.ti ou o NVivo.
  it('não reusa o guid da nota na seleção', () => {
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: '0123456789',
      originalFormat: 'txt',
      sourceFilename: 'd.txt'
    })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 0, endPos: 4, body: 'x' })

    const { project } = exportMod.buildProjectFromDb('P')
    const nota = project.notes[0]
    const selecao = project.documents[0].selections.find((s) => s.noteGuids.includes(nota.guid))

    expect(selecao).toBeDefined()
    expect(selecao!.guid).not.toBe(nota.guid)
  })

  it('não repete nenhum guid no arquivo gerado', () => {
    const code = repos.createCode({ name: 'C', color: '#111' })
    const doc = repos.createDocument({
      name: 'Doc',
      plainText: '0123456789abcdef',
      originalFormat: 'txt',
      sourceFilename: 'd.txt'
    })
    repos.createCoding({ documentId: doc.id, codeId: code.id, startPos: 0, endPos: 4 })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 6, endPos: 10, body: 'só nota' })
    repos.createNote({ scope: 'excerpt', documentId: doc.id, startPos: 0, endPos: 4, body: 'no trecho codificado' })

    const qde = xml.buildQde(exportMod.buildProjectFromDb('P').project)
    const guids = [...qde.matchAll(/guid="([^"]+)"/g)].map((m) => m[1])

    expect(guids.length).toBeGreaterThan(4)
    expect(new Set(guids).size).toBe(guids.length)
  })
})

describe('memo em RTF na importação', () => {
  let xml: typeof import('../src/main/qdpx/xml')

  beforeEach(async () => {
    xml = await import('../src/main/qdpx/xml')
  })

  function qdeComNota(atributo: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="urn:QDA-XML:project:1.0" name="P">
  <Notes><Note guid="n-1" name="Memo" ${atributo} /></Notes>
</Project>`
  }

  // richTextPath aponta para um RTF. Lido como string, o corpo da nota virava
  // "{\\rtf1\\ansi..." na tela e no export para IA, como se fosse o texto da
  // pessoa. Documentos já aceitavam só plainTextPath; notas aceitavam os dois.
  it('não trata o RTF como se fosse o texto da nota', () => {
    const { sourcePaths, skipped } = xml.parseQde(qdeComNota('richTextPath="memo.rtf"'))

    expect(sourcePaths.has('note:n-1')).toBe(false)
    expect(skipped.some((s) => /RTF/i.test(s))).toBe(true)
  })

  it('continua lendo o memo quando ele vem em texto puro', () => {
    const { sourcePaths, skipped } = xml.parseQde(qdeComNota('plainTextPath="memo.txt"'))

    expect(sourcePaths.get('note:n-1')).toBe('memo.txt')
    expect(skipped.some((s) => /RTF/i.test(s))).toBe(false)
  })
})
