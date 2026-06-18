import { readFile } from 'fs/promises'
import { v4 as uuid } from 'uuid'
import type { ImportReport } from '@shared/types'
import { getDb } from '../db'
import {
  codeGroupMembers,
  codeGroups,
  codes,
  codings,
  documents
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

  for (const group of parsed.project.groups) {
    const res = db
      .insert(codeGroups)
      .values({
        guid: group.guid || uuid(),
        name: group.name,
        description: group.description ?? null,
        parentGroupId: null
      })
      .run()
    const groupId = Number(res.lastInsertRowid)
    report.groups += 1
    for (const memberGuid of group.memberCodeGuids) {
      const codeId = codeIdByGuid.get(memberGuid)
      if (codeId) {
        db.insert(codeGroupMembers)
          .values({ groupId, codeId })
          .onConflictDoNothing()
          .run()
      }
    }
  }

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
  }

  return report
}

export async function importQdpx(filePath: string): Promise<ImportReport> {
  const buffer = await readFile(filePath)
  const parsed = await deserializeQdpx(buffer)
  return importProjectIntoDb(parsed)
}
