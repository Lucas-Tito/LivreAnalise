import { and, asc, eq, sql } from 'drizzle-orm'
import { v4 as uuid } from 'uuid'
import type {
  Code,
  Collection,
  CollectionMember,
  CodeWithCount,
  Coding,
  CodingWithCode,
  CreateCodeInput,
  CreateCodingInput,
  CreateNoteInput,
  UpdateCodingInput,
  CreateCollectionInput,
  DocumentRecord,
  DocumentWithText,
  Note,
  UpdateCodeInput,
  UpdateCollectionInput,
  UpdateNoteInput
} from '@shared/types'
import { adjustCodings } from '@shared/editAdjust'
import { findConnectedCodings } from '../services/codingMerge'
import { getDb } from './index'
import {
  collectionMembers,
  collections,
  codes,
  codings,
  documents,
  notes
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
  sourceFilename?: string | null
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
      sourceFilename: input.sourceFilename ?? null,
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

  // As notas de trecho passam pelo mesmo pipeline de ajuste das citações.
  // A diferença: âncora invalidada não apaga a nota, só a desvincula,
  // preservando o conteúdo e o trecho original como referência.
  const anchoredNotes = listNotesByDocument(id).filter(
    (n): n is Note & { startPos: number; endPos: number } =>
      n.scope === 'excerpt' &&
      n.anchorStatus === 'attached' &&
      n.startPos != null &&
      n.endPos != null
  )
  const noteAdjust = adjustCodings(anchoredNotes, current.plainText, newText)
  const detachedSnapshots = new Map<number, string>()
  for (const noteId of noteAdjust.removeIds) {
    const note = anchoredNotes.find((n) => n.id === noteId)
    if (note) {
      detachedSnapshots.set(noteId, current.plainText.slice(note.startPos, note.endPos))
    }
  }

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
    for (const u of noteAdjust.updates) {
      tx.update(notes)
        .set({ startPos: u.startPos, endPos: u.endPos })
        .where(eq(notes.id, u.id))
        .run()
    }
    for (const noteId of noteAdjust.removeIds) {
      tx.update(notes)
        .set({
          anchorStatus: 'detached',
          anchorText: detachedSnapshots.get(noteId) ?? null
        })
        .where(eq(notes.id, noteId))
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

export function listCollections(): Collection[] {
  const db = getDb()
  return db
    .select()
    .from(collections)
    .orderBy(asc(collections.sortOrder), asc(collections.name))
    .all() as Collection[]
}

function getCollection(id: number): Collection {
  const db = getDb()
  return db
    .select()
    .from(collections)
    .where(eq(collections.id, id))
    .get() as Collection
}

export function createCollection(input: CreateCollectionInput): Collection {
  const db = getDb()
  const guid = uuid()
  const res = db
    .insert(collections)
    .values({
      guid,
      name: input.name,
      description: input.description ?? null
    })
    .run()
  touchProject()
  return getCollection(Number(res.lastInsertRowid))
}

export function updateCollection(input: UpdateCollectionInput): void {
  const db = getDb()
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
  if (Object.keys(patch).length === 0) return
  db.update(collections).set(patch).where(eq(collections.id, input.id)).run()
  touchProject()
}

export function deleteCollection(id: number): void {
  const db = getDb()
  db.delete(collections).where(eq(collections.id, id)).run()
  touchProject()
}

export function listCollectionMembers(collectionId: number): number[] {
  const db = getDb()
  const rows = db
    .select({ codeId: collectionMembers.codeId })
    .from(collectionMembers)
    .where(eq(collectionMembers.collectionId, collectionId))
    .all()
  return rows.map((r) => r.codeId)
}

export function listAllCollectionMembers(): CollectionMember[] {
  const db = getDb()
  return db
    .select({
      collectionId: collectionMembers.collectionId,
      codeId: collectionMembers.codeId
    })
    .from(collectionMembers)
    .all()
}

export function addCollectionMember(collectionId: number, codeId: number): void {
  const db = getDb()
  db.insert(collectionMembers)
    .values({ collectionId, codeId })
    .onConflictDoNothing()
    .run()
  touchProject()
}

export function removeCollectionMember(collectionId: number, codeId: number): void {
  const db = getDb()
  db.delete(collectionMembers)
    .where(
      and(
        eq(collectionMembers.collectionId, collectionId),
        eq(collectionMembers.codeId, codeId)
      )
    )
    .run()
  touchProject()
}

// ---------- Codings ----------

export function listAllCodings(): Coding[] {
  const db = getDb()
  return db.select().from(codings).all() as Coding[]
}

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

export function updateCoding(input: UpdateCodingInput): Coding {
  const db = getDb()
  db.update(codings)
    .set({ startPos: input.startPos, endPos: input.endPos })
    .where(eq(codings.id, input.id))
    .run()
  touchProject()
  return getCoding(input.id)
}

export function deleteCoding(id: number): void {
  const db = getDb()
  db.delete(codings).where(eq(codings.id, id)).run()
  touchProject()
}

// ---------- Notes ----------

function rowToNote(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    guid: row.guid,
    title: row.title,
    body: row.body,
    scope: row.scope as Note['scope'],
    documentId: row.documentId,
    startPos: row.startPos,
    endPos: row.endPos,
    anchorStatus: (row.anchorStatus ?? 'attached') as Note['anchorStatus'],
    anchorText: row.anchorText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function listNotesByDocument(documentId: number): Note[] {
  const db = getDb()
  const rows = db
    .select()
    .from(notes)
    .where(
      and(eq(notes.documentId, documentId), sql`${notes.scope} != 'project'`)
    )
    .orderBy(asc(notes.createdAt))
    .all()
  return rows.map(rowToNote)
}

export function listProjectNotes(): Note[] {
  const db = getDb()
  const rows = db
    .select()
    .from(notes)
    .where(eq(notes.scope, 'project'))
    .orderBy(asc(notes.createdAt))
    .all()
  return rows.map(rowToNote)
}

function getNote(id: number): Note {
  const db = getDb()
  return rowToNote(
    db.select().from(notes).where(eq(notes.id, id)).get() as typeof notes.$inferSelect
  )
}

export function createNote(input: CreateNoteInput): Note {
  const db = getDb()
  const scope = input.scope

  let documentId: number | null = null
  let startPos: number | null = null
  let endPos: number | null = null

  if (scope === 'document' || scope === 'excerpt') {
    if (input.documentId == null) {
      throw new Error('A nota precisa de um documento.')
    }
    const doc = getDocument(input.documentId)
    if (!doc) {
      throw new Error('Documento não encontrado para a nota.')
    }
    documentId = doc.id
  }

  if (scope === 'excerpt') {
    if (input.startPos == null || input.endPos == null) {
      throw new Error('A nota de trecho precisa de um intervalo no texto.')
    }
    if (
      !Number.isInteger(input.startPos) ||
      !Number.isInteger(input.endPos) ||
      input.startPos < 0 ||
      input.endPos <= input.startPos ||
      input.endPos > (getDocument(documentId!)?.plainText.length ?? 0)
    ) {
      throw new Error('O trecho da nota é inválido para este documento.')
    }
    startPos = input.startPos
    endPos = input.endPos
  }

  const guid = uuid()
  const res = db
    .insert(notes)
    .values({
      guid,
      title: input.title ?? null,
      body: input.body ?? '',
      scope,
      documentId,
      startPos,
      endPos,
      anchorStatus: 'attached',
      anchorText: null
    })
    .run()
  touchProject()
  return getNote(Number(res.lastInsertRowid))
}

export function updateNote(input: UpdateNoteInput): Note {
  const db = getDb()
  const patch: { title?: string | null; body?: string; updatedAt: string } = {
    updatedAt: new Date().toISOString()
  }
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) patch.body = input.body
  db.update(notes).set(patch).where(eq(notes.id, input.id)).run()
  touchProject()
  return getNote(input.id)
}

export function deleteNote(id: number): void {
  const db = getDb()
  db.delete(notes).where(eq(notes.id, id)).run()
  touchProject()
}
