import { readFile } from 'fs/promises'
import { v4 as uuid } from 'uuid'
import type { ImportReport } from '@shared/types'
import { getDb } from '../db'
import {
  collectionMembers,
  collections,
  codes,
  codings,
  documents,
  notes
} from '../db/schema'
import { normalizeText } from '../services/textExtract'
import { deserializeQdpx } from './serialize'
import type { ParsedQdpx } from './model'

export function importProjectIntoDb(parsed: ParsedQdpx): ImportReport {
  const db = getDb()
  const report: ImportReport = {
    codes: 0,
    groups: 0,
    documents: 0,
    codings: 0,
    notes: 0,
    skipped: [...parsed.skipped]
  }

  const codeIdByGuid = new Map<string, number>()
  for (const code of parsed.project.codes) {
    const parentId = code.parentGuid
      ? codeIdByGuid.get(code.parentGuid) ?? null
      : null
    const res = db
      .insert(codes)
      .values({
        guid: code.guid || uuid(),
        name: code.name,
        color: code.color ?? '#2563eb',
        description: code.description ?? null,
        parentId
      })
      .run()
    codeIdByGuid.set(code.guid, Number(res.lastInsertRowid))
    report.codes += 1
  }

  for (const set of parsed.project.groups) {
    const res = db
      .insert(collections)
      .values({
        guid: set.guid || uuid(),
        name: set.name,
        description: set.description ?? null
      })
      .run()
    const collectionId = Number(res.lastInsertRowid)
    report.groups += 1
    for (const memberGuid of set.memberCodeGuids) {
      const codeId = codeIdByGuid.get(memberGuid)
      if (codeId) {
        db.insert(collectionMembers)
          .values({ collectionId, codeId })
          .onConflictDoNothing()
          .run()
      }
    }
  }

  const docGuidToId = new Map<string, number>()
  for (const doc of parsed.project.documents) {
    const content = normalizeText(doc.plainText)
    const res = db
      .insert(documents)
      .values({
        guid: doc.guid || uuid(),
        name: doc.name,
        plainText: content,
        originalFormat: 'txt',
        sourceFilename: null,
        charCount: content.length
      })
      .run()
    const documentId = Number(res.lastInsertRowid)
    report.documents += 1

    for (const sel of doc.selections) {
      if (Number.isNaN(sel.startPosition) || Number.isNaN(sel.endPosition)) {
        continue
      }
      for (const codeGuid of sel.codeGuids) {
        const codeId = codeIdByGuid.get(codeGuid)
        if (!codeId) continue
        db.insert(codings)
          .values({
            guid: uuid(),
            documentId,
            codeId,
            startPos: sel.startPosition,
            endPos: sel.endPosition
          })
          .onConflictDoNothing()
          .run()
        report.codings += 1
      }
    }
    docGuidToId.set(doc.guid, documentId)
  }

  // Notas: resolve targetGUID → nota; âncora inválida vira detached com o
  // texto original preservado, nunca falha o import.
  const noteBodyByGuid = new Map(parsed.project.notes.map((n) => [n.guid, n]))
  const insertNote = (
    guid: string,
    scope: 'project' | 'document' | 'excerpt',
    documentId: number | null,
    start: number | null,
    end: number | null,
    docLen: number
  ): void => {
    const found = noteBodyByGuid.get(guid)
    if (!found) {
      report.skipped.push(`NoteRef sem Note: ${guid}`)
      return
    }
    let status: 'attached' | 'detached' = 'attached'
    let s = start
    let e = end
    if (scope === 'excerpt') {
      if (s == null || e == null || !Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e <= s || e > docLen) {
        status = 'detached'
        s = null
        e = null
      }
    }
    const anchorText = status === 'detached' ? (found.description ?? null) : null
    db.insert(notes)
      .values({
        guid: found.guid || uuid(),
        title: found.name,
        body: found.plainText ?? '',
        scope,
        documentId,
        startPos: status === 'attached' ? s : null,
        endPos: status === 'attached' ? e : null,
        anchorStatus: status,
        anchorText
      })
      .onConflictDoNothing()
      .run()
    report.notes += 1
  }

  const docIdByGuid = docGuidToId
  for (const guid of parsed.project.projectNoteGuids) {
    insertNote(guid, 'project', null, null, null, 0)
  }
  for (const doc of parsed.project.documents) {
    const documentId = docIdByGuid.get(doc.guid)
    if (documentId == null) continue
    const docLen = normalizeText(doc.plainText).length
    for (const guid of doc.noteGuids) {
      insertNote(guid, 'document', documentId, null, null, docLen)
    }
    for (const sel of doc.selections) {
      for (const guid of sel.noteGuids) {
        insertNote(guid, 'excerpt', documentId, sel.startPosition, sel.endPosition, docLen)
      }
    }
  }
  // Notas em Notes sem nenhum NoteRef: preserva como nota de projeto + aviso.
  const referenced = new Set<string>([
    ...parsed.project.projectNoteGuids,
    ...parsed.project.documents.flatMap((d) => d.noteGuids),
    ...parsed.project.documents.flatMap((d) => d.selections.flatMap((s) => s.noteGuids))
  ])
  for (const note of parsed.project.notes) {
    if (!referenced.has(note.guid)) {
      db.insert(notes)
        .values({
          guid: note.guid || uuid(),
          title: note.name,
          body: note.plainText ?? '',
          scope: 'project',
          documentId: null,
          startPos: null,
          endPos: null,
          anchorStatus: 'attached',
          anchorText: note.description
        })
        .onConflictDoNothing()
        .run()
      report.notes += 1
      report.skipped.push(`Nota órfã importada como projeto: ${note.name ?? note.guid}`)
    }
  }

  return report
}

export async function importQdpx(filePath: string): Promise<ImportReport> {
  const buffer = await readFile(filePath)
  const parsed = await deserializeQdpx(buffer)
  return importProjectIntoDb(parsed)
}
