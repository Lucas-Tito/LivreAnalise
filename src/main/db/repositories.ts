import { and, asc, eq, sql } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import type {
  Code,
  CodeGroup,
  CodeWithCount,
  Coding,
  CodingWithCode,
  CreateCodeInput,
  CreateCodingInput,
  CreateGroupInput,
  DocumentRecord,
  DocumentWithText,
  UpdateCodeInput,
  UpdateGroupInput
} from '@shared/types'
import { adjustCodings } from '@shared/editAdjust'
import { findConnectedCodings } from '../services/codingMerge'
import { getDb } from './index'
import {
  codeGroupMembers,
  codeGroups,
  codes,
  codings,
  documents
} from './schema'

function touchProject(): void {
  const db = getDb()
  db.run(
    sql`UPDATE project_meta SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = 1`
  )
}

// ---------- Documents ----------

export function listDocuments(): DocumentRecord[] {
  const db = getDb()
  const rows = db
    .select({
      id: documents.id,
      guid: documents.guid,
      name: documents.name,
      originalFormat: documents.originalFormat,
      sourceFilename: documents.sourceFilename,
      charCount: documents.charCount,
      importedAt: documents.importedAt
    })
    .from(documents)
    .orderBy(asc(documents.name))
    .all()
  return rows as DocumentRecord[]
}

export function getDocument(id: number): DocumentWithText | null {
  const db = getDb()
  const row = db.select().from(documents).where(eq(documents.id, id)).get()
  return (row as DocumentWithText) ?? null
}

export function createDocument(input: {
  name: string
  plainText: string
  originalFormat: string
  sourceFilename: string | null
}): DocumentRecord {
  const db = getDb()
  const guid = uuid()
  const res = db
    .insert(documents)
    .values({
      guid,
      name: input.name,
      plainText: input.plainText,
      originalFormat: input.originalFormat,
      sourceFilename: input.sourceFilename,
      charCount: input.plainText.length
    })
    .run()
  touchProject()
  return getDocument(Number(res.lastInsertRowid)) as DocumentRecord
}

export function renameDocument(id: number, name: string): void {
  const db = getDb()
  db.update(documents).set({ name }).where(eq(documents.id, id)).run()
  touchProject()
}

export function updateDocumentText(id: number, newText: string): void {
  const db = getDb()
  const current = getDocument(id)
  if (!current) return
  const codingsList = listCodingsByDocument(id)
  const { updates, removeIds } = adjustCodings(codingsList, current.plainText, newText)

  db.transaction((tx) => {
    tx.update(documents)
      .set({ plainText: newText, charCount: newText.length })
      .where(eq(documents.id, id))
      .run()
    for (const rid of removeIds) {
      tx.delete(codings).where(eq(codings.id, rid)).run()
    }
    for (const u of updates) {
      tx.update(codings)
        .set({ startPos: u.startPos, endPos: u.endPos })
        .where(eq(codings.id, u.id))
        .run()
    }
  })
  touchProject()
}

export function deleteDocument(id: number): void {
  const db = getDb()
  db.delete(documents).where(eq(documents.id, id)).run()
  touchProject()
}

// ---------- Codes ----------

export function listCodes(): CodeWithCount[] {
  const db = getDb()
  const rows = db
    .select({
      id: codes.id,
      guid: codes.guid,
      name: codes.name,
      color: codes.color,
      description: codes.description,
      parentId: codes.parentId,
      sortOrder: codes.sortOrder,
      createdAt: codes.createdAt,
      usageCount: sql<number>`cast(count(${codings.id}) as integer)`
    })
    .from(codes)
    .leftJoin(codings, eq(codings.codeId, codes.id))
    .groupBy(codes.id)
    .orderBy(asc(codes.sortOrder), asc(codes.name))
    .all()
  return rows.map((row) => ({
    ...row,
    usageCount: Number(row.usageCount)
  }))
}

function getCode(id: number): Code {
  const db = getDb()
  return db.select().from(codes).where(eq(codes.id, id)).get() as Code
}

export function createCode(input: CreateCodeInput): Code {
  const db = getDb()
  const guid = uuid()
  const res = db
    .insert(codes)
    .values({
      guid,
      name: input.name,
      color: input.color,
      description: input.description ?? null,
      parentId: input.parentId ?? null
    })
    .run()
  touchProject()
  return getCode(Number(res.lastInsertRowid))
}

export function updateCode(input: UpdateCodeInput): void {
  const db = getDb()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.color !== undefined) patch.color = input.color
  if (input.description !== undefined) patch.description = input.description
  if (input.parentId !== undefined) patch.parentId = input.parentId
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
  if (Object.keys(patch).length === 0) return
  db.update(codes).set(patch).where(eq(codes.id, input.id)).run()
  touchProject()
}

export function deleteCode(id: number): void {
  const db = getDb()
  db.delete(codes).where(eq(codes.id, id)).run()
  touchProject()
}

// ---------- Groups ----------

export function listGroups(): CodeGroup[] {
  const db = getDb()
  return db
    .select()
    .from(codeGroups)
    .orderBy(asc(codeGroups.sortOrder), asc(codeGroups.name))
    .all() as CodeGroup[]
}

function getGroup(id: number): CodeGroup {
  const db = getDb()
  return db
    .select()
    .from(codeGroups)
    .where(eq(codeGroups.id, id))
    .get() as CodeGroup
}

export function createGroup(input: CreateGroupInput): CodeGroup {
  const db = getDb()
  const guid = uuid()
  const res = db
    .insert(codeGroups)
    .values({
      guid,
      name: input.name,
      description: input.description ?? null,
      parentGroupId: input.parentGroupId ?? null
    })
    .run()
  touchProject()
  return getGroup(Number(res.lastInsertRowid))
}

export function updateGroup(input: UpdateGroupInput): void {
  const db = getDb()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.parentGroupId !== undefined)
    patch.parentGroupId = input.parentGroupId
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
  if (Object.keys(patch).length === 0) return
  db.update(codeGroups).set(patch).where(eq(codeGroups.id, input.id)).run()
  touchProject()
}

export function deleteGroup(id: number): void {
  const db = getDb()
  db.delete(codeGroups).where(eq(codeGroups.id, id)).run()
  touchProject()
}

export function listGroupMembers(groupId: number): number[] {
  const db = getDb()
  const rows = db
    .select({ codeId: codeGroupMembers.codeId })
    .from(codeGroupMembers)
    .where(eq(codeGroupMembers.groupId, groupId))
    .all()
  return rows.map((r) => r.codeId)
}

export function addGroupMember(groupId: number, codeId: number): void {
  const db = getDb()
  db.insert(codeGroupMembers)
    .values({ groupId, codeId })
    .onConflictDoNothing()
    .run()
  touchProject()
}

export function removeGroupMember(groupId: number, codeId: number): void {
  const db = getDb()
  db.delete(codeGroupMembers)
    .where(
      and(
        eq(codeGroupMembers.groupId, groupId),
        eq(codeGroupMembers.codeId, codeId)
      )
    )
    .run()
  touchProject()
}

// ---------- Codings ----------

export function listCodingsByDocument(documentId: number): Coding[] {
  const db = getDb()
  return db
    .select()
    .from(codings)
    .where(eq(codings.documentId, documentId))
    .orderBy(asc(codings.startPos))
    .all() as Coding[]
}

export function listCodingsByCode(codeId: number): CodingWithCode[] {
  const db = getDb()
  const rows = db
    .select({
      id: codings.id,
      guid: codings.guid,
      documentId: codings.documentId,
      codeId: codings.codeId,
      startPos: codings.startPos,
      endPos: codings.endPos,
      createdAt: codings.createdAt,
      codeName: codes.name,
      codeColor: codes.color,
      text: sql<string>`substr(${documents.plainText}, ${codings.startPos} + 1, ${codings.endPos} - ${codings.startPos})`
    })
    .from(codings)
    .innerJoin(codes, eq(codings.codeId, codes.id))
    .innerJoin(documents, eq(codings.documentId, documents.id))
    .where(eq(codings.codeId, codeId))
    .orderBy(asc(codings.documentId), asc(codings.startPos))
    .all()
  return rows as CodingWithCode[]
}

function getCoding(id: number): Coding {
  const db = getDb()
  return db.select().from(codings).where(eq(codings.id, id)).get() as Coding
}

export function createCoding(input: CreateCodingInput): Coding {
  const db = getDb()

  return db.transaction(() => {
    const existing = db
      .select()
      .from(codings)
      .where(
        and(
          eq(codings.documentId, input.documentId),
          eq(codings.codeId, input.codeId)
        )
      )
      .all() as Coding[]

    const { ids: mergeIds, start, end } = findConnectedCodings(
      existing,
      input.startPos,
      input.endPos
    )

    if (mergeIds.length > 0) {
      const keeper = existing
        .filter((c) => mergeIds.includes(c.id))
        .reduce((a, b) => (a.id < b.id ? a : b))

      for (const id of mergeIds) {
        if (id !== keeper.id) {
          db.delete(codings).where(eq(codings.id, id)).run()
        }
      }

      db.update(codings)
        .set({ startPos: start, endPos: end })
        .where(eq(codings.id, keeper.id))
        .run()

      touchProject()
      return getCoding(keeper.id)
    }

    const guid = uuid()
    const res = db
      .insert(codings)
      .values({
        guid,
        documentId: input.documentId,
        codeId: input.codeId,
        startPos: input.startPos,
        endPos: input.endPos
      })
      .onConflictDoNothing()
      .run()

    touchProject()
    if (res.changes === 0) {
      const duplicate = db
        .select()
        .from(codings)
        .where(
          and(
            eq(codings.documentId, input.documentId),
            eq(codings.codeId, input.codeId),
            eq(codings.startPos, input.startPos),
            eq(codings.endPos, input.endPos)
          )
        )
        .get()
      return duplicate as Coding
    }
    return getCoding(Number(res.lastInsertRowid))
  })
}

export function deleteCoding(id: number): void {
  const db = getDb()
  db.delete(codings).where(eq(codings.id, id)).run()
  touchProject()
}
