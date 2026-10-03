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
import { validateParentChange } from '@shared/codeTree'
import { pushHistory } from '../history/stack'
import type { MoveCodesInput } from '@shared/types'
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

function reinsertCodes(rows: Array<typeof codes.$inferSelect>): void {
  const db = getDb()
  for (const r of rows) {
    db.insert(codes).values(r).onConflictDoNothing().run()
  }
}

function reinsertCodings(rows: Array<typeof codings.$inferSelect>): void {
  const db = getDb()
  for (const r of rows) {
    db.insert(codings).values(r).onConflictDoNothing().run()
  }
}

function reinsertNotes(rows: Array<typeof notes.$inferSelect>): void {
  const db = getDb()
  for (const r of rows) {
    db.insert(notes).values(r).onConflictDoNothing().run()
  }
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
  const created = getDocument(Number(res.lastInsertRowid)) as DocumentWithText
  touchProject()
  const snapshot = { ...created }
  pushHistory({
    label: `importar "${created.name}"`,
    undo: () => {
      getDb().delete(documents).where(eq(documents.id, snapshot.id)).run()
      touchProject()
    },
    redo: () => {
      getDb().insert(documents).values(snapshot).onConflictDoNothing().run()
      touchProject()
    }
  })
  return created as DocumentRecord
}

export function renameDocument(id: number, name: string): void {
  const db = getDb()
  const before = getDocument(id)
  if (!before || before.name === name) return
  db.update(documents).set({ name }).where(eq(documents.id, id)).run()
  touchProject()
  const oldName = before?.name ?? ''
  pushHistory({
    label: `renomear documento`,
    undo: () => {
      getDb().update(documents).set({ name: oldName }).where(eq(documents.id, id)).run()
      touchProject()
    },
    redo: () => {
      getDb().update(documents).set({ name }).where(eq(documents.id, id)).run()
      touchProject()
    }
  })
}

export function updateDocumentText(id: number, newText: string): void {
  const db = getDb()
  const current = getDocument(id)
  if (!current) return
  const oldText = current.plainText
  const beforeCodings = (db.select().from(codings).where(eq(codings.documentId, id)).all() as Array<typeof codings.$inferSelect>)
  const beforeNotes = (db.select().from(notes).where(eq(notes.documentId, id)).all() as Array<typeof notes.$inferSelect>)
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
  const afterCodings = (getDb().select().from(codings).where(eq(codings.documentId, id)).all() as Array<typeof codings.$inferSelect>)
  const afterNotes = (getDb().select().from(notes).where(eq(notes.documentId, id)).all() as Array<typeof notes.$inferSelect>)
  const docName = current.name
  pushHistory({
    label: `editar texto de "${docName}"`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        tx.update(documents).set({ plainText: oldText, charCount: oldText.length }).where(eq(documents.id, id)).run()
        tx.delete(codings).where(eq(codings.documentId, id)).run()
        for (const r of beforeCodings) tx.insert(codings).values(r).onConflictDoNothing().run()
        tx.delete(notes).where(eq(notes.documentId, id)).run()
        for (const r of beforeNotes) tx.insert(notes).values(r).onConflictDoNothing().run()
      })
      touchProject()
    },
    redo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        tx.update(documents).set({ plainText: newText, charCount: newText.length }).where(eq(documents.id, id)).run()
        tx.delete(codings).where(eq(codings.documentId, id)).run()
        for (const r of afterCodings) tx.insert(codings).values(r).onConflictDoNothing().run()
        tx.delete(notes).where(eq(notes.documentId, id)).run()
        for (const r of afterNotes) tx.insert(notes).values(r).onConflictDoNothing().run()
      })
      touchProject()
    }
  })
}

export function deleteDocument(id: number): void {
  const db = getDb()
  const snapshot = getDocument(id)
  const snapshotCodings = (db.select().from(codings).where(eq(codings.documentId, id)).all() as Array<typeof codings.$inferSelect>)
  const snapshotNotes = (db.select().from(notes).where(eq(notes.documentId, id)).all() as Array<typeof notes.$inferSelect>)
  db.delete(documents).where(eq(documents.id, id)).run()
  touchProject()
  if (!snapshot) return
  const docName = snapshot.name
  pushHistory({
    label: `excluir "${docName}"`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        tx.insert(documents).values(snapshot).onConflictDoNothing().run()
        for (const r of snapshotCodings) tx.insert(codings).values(r).onConflictDoNothing().run()
        for (const r of snapshotNotes) tx.insert(notes).values(r).onConflictDoNothing().run()
      })
      touchProject()
    },
    redo: () => {
      getDb().delete(documents).where(eq(documents.id, id)).run()
      touchProject()
    }
  })
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
  if (input.parentId != null) {
    const all = db.select().from(codes).all() as Code[]
    const byId = new Map(all.map((c) => [c.id, c]))
    const target = byId.get(input.parentId)
    if (!target) throw new Error('Grupo de destino não encontrado.')
    if (target.parentId != null) {
      throw new Error('O destino precisa ser um grupo de 1º nível (sem criar 3º nível).')
    }
  }
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
  const created = getCode(Number(res.lastInsertRowid))
  pushHistory({
    label: `criar código "${created.name}"`,
    undo: () => {
      getDb().delete(codes).where(eq(codes.id, created.id)).run()
      touchProject()
    },
    redo: () => {
      getDb().insert(codes).values(created).onConflictDoNothing().run()
      touchProject()
    }
  })
  return created
}

export function updateCode(input: UpdateCodeInput): void {
  const db = getDb()
  if (input.parentId !== undefined) {
    const all = db.select().from(codes).all() as Code[]
    validateParentChange(all, input.id, input.parentId)
  }
  const before = getCode(input.id)
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.color !== undefined) patch.color = input.color
  if (input.description !== undefined) patch.description = input.description
  if (input.parentId !== undefined) patch.parentId = input.parentId
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
  if (Object.keys(patch).length === 0) return
  const unchanged = Object.entries(patch).every(
    ([k, v]) => (before as unknown as Record<string, unknown>)[k] === v
  )
  if (unchanged) return
  db.update(codes).set(patch).where(eq(codes.id, input.id)).run()
  touchProject()
  const after = getCode(input.id)
  const beforeSnap = { ...before }
  const afterSnap = { ...after }
  const isMove = input.parentId !== undefined && Object.keys(patch).length === 1
  pushHistory({
    label: isMove
      ? input.parentId == null
        ? `remover "${after.name}" do grupo`
        : `mover "${after.name}"`
      : `editar código "${after.name}"`,
    undo: () => {
      getDb().update(codes).set({
        name: beforeSnap.name,
        color: beforeSnap.color,
        description: beforeSnap.description,
        parentId: beforeSnap.parentId,
        sortOrder: beforeSnap.sortOrder
      }).where(eq(codes.id, beforeSnap.id)).run()
      touchProject()
    },
    redo: () => {
      getDb().update(codes).set({
        name: afterSnap.name,
        color: afterSnap.color,
        description: afterSnap.description,
        parentId: afterSnap.parentId,
        sortOrder: afterSnap.sortOrder
      }).where(eq(codes.id, afterSnap.id)).run()
      touchProject()
    }
  })
}

// Movimentação atômica de N códigos: valida tudo antes, aplica em transação.
// Preserva ID/GUID, citações e memberships (nunca delete+recreate).
export function moveCodes(input: MoveCodesInput): void {
  const db = getDb()
  const all = db.select().from(codes).all() as Code[]
  const unique = [...new Set(input.ids)]
  if (unique.length === 0) return
  for (const id of unique) {
    validateParentChange(all, id, input.parentId)
  }
  const beforeParents = new Map<number, number | null>()
  for (const id of unique) {
    beforeParents.set(id, all.find((c) => c.id === id)?.parentId ?? null)
  }
  db.transaction((tx) => {
    for (const id of unique) {
      tx.update(codes).set({ parentId: input.parentId }).where(eq(codes.id, id)).run()
    }
  })
  touchProject()
  const afterParent = input.parentId
  const count = unique.length
  pushHistory({
    label: afterParent == null ? `remover ${count} do grupo` : `mover ${count} código${count > 1 ? 's' : ''}`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        for (const id of unique) {
          tx.update(codes).set({ parentId: beforeParents.get(id) ?? null }).where(eq(codes.id, id)).run()
        }
      })
      touchProject()
    },
    redo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        for (const id of unique) {
          tx.update(codes).set({ parentId: afterParent }).where(eq(codes.id, id)).run()
        }
      })
      touchProject()
    }
  })
}

// Ação composta atômica: criar grupo + reparentar o código de origem.
// Um único comando no histórico (desfazer remove o grupo e restaura o pai).
export function createGroupCode(name: string, color: string, codeId: number): Code {
  const db = getDb()
  const all = db.select().from(codes).all() as Code[]
  const origin = all.find((c) => c.id === codeId)
  if (!origin) throw new Error('Código de origem não encontrado.')
  if (origin.parentId != null || all.some((c) => c.parentId === codeId)) {
    throw new Error('Só um código solto sem filhos pode virar grupo.')
  }
  const guid = uuid()
  let group!: Code
  db.transaction((tx) => {
    const res = tx.insert(codes).values({ guid, name, color, description: null, parentId: null }).run()
    group = tx.select().from(codes).where(eq(codes.id, Number(res.lastInsertRowid))).get() as Code
    tx.update(codes).set({ parentId: group.id }).where(eq(codes.id, codeId)).run()
  })
  touchProject()
  const groupSnap = { ...group }
  const oldParent = origin.parentId
  pushHistory({
    label: `criar grupo "${name}"`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        tx.update(codes).set({ parentId: oldParent }).where(eq(codes.id, codeId)).run()
        tx.delete(codes).where(eq(codes.id, groupSnap.id)).run()
      })
      touchProject()
    },
    redo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        tx.insert(codes).values(groupSnap).onConflictDoNothing().run()
        tx.update(codes).set({ parentId: groupSnap.id }).where(eq(codes.id, codeId)).run()
      })
      touchProject()
    }
  })
  return group
}

export function deleteCode(id: number): void {
  const db = getDb()
  const all = db.select().from(codes).all() as Code[]
  // Subárvore por BFS (o CASCADE do banco apagaria o resto sem snapshot).
  const doomed = new Set<number>([id])
  let grew = true
  while (grew) {
    grew = false
    for (const c of all) {
      if (c.parentId != null && doomed.has(c.parentId) && !doomed.has(c.id)) {
        doomed.add(c.id)
        grew = true
      }
    }
  }
  const codeRows = all.filter((c) => doomed.has(c.id))
  const codingRows = (db.select().from(codings).all() as Array<typeof codings.$inferSelect>).filter((r) => doomed.has(r.codeId))
  const memberRows = (db.select().from(collectionMembers).all() as Array<typeof collectionMembers.$inferSelect>).filter((r) => doomed.has(r.codeId))
  const deletedName = all.find((c) => c.id === id)?.name ?? ''
  db.delete(codes).where(eq(codes.id, id)).run()
  touchProject()
  pushHistory({
    label: `excluir código "${deletedName}"`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        // Restaura pais antes dos filhos (ordem topológica: vale para
        // qualquer profundidade, ex. árvores de QDPX importado).
        const byId = new Map(codeRows.map((r) => [r.id, r]))
        const depthOf = (rowId: number): number => {
          let d = 0
          let cur = byId.get(rowId)
          while (cur?.parentId != null && byId.has(cur.parentId)) {
            d += 1
            cur = byId.get(cur.parentId)
          }
          return d
        }
        const ordered = [...codeRows].sort((a, b) => depthOf(a.id) - depthOf(b.id))
        for (const r of ordered) tx.insert(codes).values(r).onConflictDoNothing().run()
        for (const r of codingRows) tx.insert(codings).values(r).onConflictDoNothing().run()
        for (const r of memberRows) tx.insert(collectionMembers).values(r).onConflictDoNothing().run()
      })
      touchProject()
    },
    redo: () => {
      getDb().delete(codes).where(eq(codes.id, id)).run()
      touchProject()
    }
  })
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
  const created = getCollection(Number(res.lastInsertRowid))
  touchProject()
  pushHistory({
    label: `criar coleção "${created.name}"`,
    undo: () => {
      getDb().delete(collections).where(eq(collections.id, created.id)).run()
      touchProject()
    },
    redo: () => {
      getDb().insert(collections).values(created).onConflictDoNothing().run()
      touchProject()
    }
  })
  return created
}

export function updateCollection(input: UpdateCollectionInput): void {
  const db = getDb()
  const before = getCollection(input.id)
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
  if (Object.keys(patch).length === 0) return
  db.update(collections).set(patch).where(eq(collections.id, input.id)).run()
  touchProject()
  const after = getCollection(input.id)
  const b = { ...before }
  const a = { ...after }
  pushHistory({
    label: `editar coleção "${a.name}"`,
    undo: () => {
      getDb().update(collections).set({ name: b.name, description: b.description, sortOrder: b.sortOrder }).where(eq(collections.id, b.id)).run()
      touchProject()
    },
    redo: () => {
      getDb().update(collections).set({ name: a.name, description: a.description, sortOrder: a.sortOrder }).where(eq(collections.id, a.id)).run()
      touchProject()
    }
  })
}

export function deleteCollection(id: number): void {
  const db = getDb()
  const snapshot = getCollection(id)
  const snapshotMembers = (db.select().from(collectionMembers).where(eq(collectionMembers.collectionId, id)).all() as Array<typeof collectionMembers.$inferSelect>)
  db.delete(collections).where(eq(collections.id, id)).run()
  touchProject()
  if (!snapshot) return
  const snap = { ...snapshot }
  pushHistory({
    label: `excluir coleção "${snap.name}"`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        tx.insert(collections).values(snap).onConflictDoNothing().run()
        for (const r of snapshotMembers) tx.insert(collectionMembers).values(r).onConflictDoNothing().run()
      })
      touchProject()
    },
    redo: () => {
      getDb().delete(collections).where(eq(collections.id, id)).run()
      touchProject()
    }
  })
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
  const res = db.insert(collectionMembers)
    .values({ collectionId, codeId })
    .onConflictDoNothing()
    .run()
  touchProject()
  if (res.changes === 0) return
  pushHistory({
    label: `adicionar à coleção`,
    undo: () => {
      getDb().delete(collectionMembers).where(
        and(eq(collectionMembers.collectionId, collectionId), eq(collectionMembers.codeId, codeId))
      ).run()
      touchProject()
    },
    redo: () => {
      getDb().insert(collectionMembers).values({ collectionId, codeId }).onConflictDoNothing().run()
      touchProject()
    }
  })
}

export function removeCollectionMember(collectionId: number, codeId: number): void {
  const db = getDb()
  const existed = db.select().from(collectionMembers).where(
    and(eq(collectionMembers.collectionId, collectionId), eq(collectionMembers.codeId, codeId))
  ).get()
  db.delete(collectionMembers)
    .where(
      and(
        eq(collectionMembers.collectionId, collectionId),
        eq(collectionMembers.codeId, codeId)
      )
    )
    .run()
  touchProject()
  if (!existed) return
  pushHistory({
    label: `remover da coleção`,
    undo: () => {
      getDb().insert(collectionMembers).values({ collectionId, codeId }).onConflictDoNothing().run()
      touchProject()
    },
    redo: () => {
      getDb().delete(collectionMembers).where(
        and(eq(collectionMembers.collectionId, collectionId), eq(collectionMembers.codeId, codeId))
      ).run()
      touchProject()
    }
  })
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
  const beforeRows = (db.select().from(codings).where(
    and(eq(codings.documentId, input.documentId), eq(codings.codeId, input.codeId))
  ).all() as Array<typeof codings.$inferSelect>)

  const result = db.transaction(() => {
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
  const afterRows = (getDb().select().from(codings).where(
    and(eq(codings.documentId, input.documentId), eq(codings.codeId, input.codeId))
  ).all() as Array<typeof codings.$inferSelect>)
  const beforeSnap = beforeRows.map((r) => ({ ...r }))
  const afterSnap = afterRows.map((r) => ({ ...r }))
  // Sem mudança (duplicata exata): não empilha.
  if (beforeSnap.length !== afterSnap.length || afterSnap.some((r) => !beforeSnap.some((b) => b.id === r.id && b.startPos === r.startPos && b.endPos === r.endPos))) {
    pushHistory({
      label: `aplicar código`,
      undo: () => {
        const db2 = getDb()
        db2.transaction((tx) => {
          tx.delete(codings).where(and(eq(codings.documentId, input.documentId), eq(codings.codeId, input.codeId))).run()
          for (const r of beforeSnap) tx.insert(codings).values(r).onConflictDoNothing().run()
        })
        touchProject()
      },
      redo: () => {
        const db2 = getDb()
        db2.transaction((tx) => {
          tx.delete(codings).where(and(eq(codings.documentId, input.documentId), eq(codings.codeId, input.codeId))).run()
          for (const r of afterSnap) tx.insert(codings).values(r).onConflictDoNothing().run()
        })
        touchProject()
      }
    })
  }
  return result
}

export function updateCoding(input: UpdateCodingInput): Coding {
  const db = getDb()
  const before = getCoding(input.id)
  if (before && before.startPos === input.startPos && before.endPos === input.endPos) {
    return before
  }
  db.update(codings)
    .set({ startPos: input.startPos, endPos: input.endPos })
    .where(eq(codings.id, input.id))
    .run()
  touchProject()
  const after = getCoding(input.id)
  const b = { ...before }
  pushHistory({
    label: `ajustar citação`,
    undo: () => {
      getDb().update(codings).set({ startPos: b.startPos, endPos: b.endPos }).where(eq(codings.id, b.id)).run()
      touchProject()
    },
    redo: () => {
      getDb().update(codings).set({ startPos: input.startPos, endPos: input.endPos }).where(eq(codings.id, input.id)).run()
      touchProject()
    }
  })
  return after
}

export function deleteCoding(id: number): void {
  const db = getDb()
  const snapshot = db.select().from(codings).where(eq(codings.id, id)).get() as typeof codings.$inferSelect | undefined
  db.delete(codings).where(eq(codings.id, id)).run()
  touchProject()
  if (!snapshot) return
  const snap = { ...snapshot }
  pushHistory({
    label: `remover citação`,
    undo: () => {
      reinsertCodings([snap])
      touchProject()
    },
    redo: () => {
      getDb().delete(codings).where(eq(codings.id, id)).run()
      touchProject()
    }
  })
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
  const created = getNote(Number(res.lastInsertRowid))
  const createdRow = (getDb().select().from(notes).where(eq(notes.id, created.id)).get() as typeof notes.$inferSelect)
  const snap = { ...createdRow }
  pushHistory({
    label: `criar nota`,
    undo: () => {
      getDb().delete(notes).where(eq(notes.id, snap.id)).run()
      touchProject()
    },
    redo: () => {
      reinsertNotes([snap])
      touchProject()
    }
  })
  return created
}

export function updateNote(input: UpdateNoteInput): Note {
  const db = getDb()
  const beforeRow = (db.select().from(notes).where(eq(notes.id, input.id)).get() as typeof notes.$inferSelect)
  const patch: { title?: string | null; body?: string; updatedAt: string } = {
    updatedAt: new Date().toISOString()
  }
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) patch.body = input.body
  db.update(notes).set(patch).where(eq(notes.id, input.id)).run()
  touchProject()
  const after = getNote(input.id)
  const b = beforeRow ? { ...beforeRow } : null
  const afterRow = (getDb().select().from(notes).where(eq(notes.id, input.id)).get() as typeof notes.$inferSelect)
  const a = { ...afterRow }
  if (b) {
    pushHistory({
      label: `editar nota`,
      undo: () => {
        getDb().update(notes).set({ title: b.title, body: b.body, updatedAt: b.updatedAt }).where(eq(notes.id, b.id)).run()
        touchProject()
      },
      redo: () => {
        getDb().update(notes).set({ title: a.title, body: a.body, updatedAt: a.updatedAt }).where(eq(notes.id, a.id)).run()
        touchProject()
      }
    })
  }
  return after
}

export function deleteNote(id: number): void {
  const db = getDb()
  const snapshot = (db.select().from(notes).where(eq(notes.id, id)).get() as typeof notes.$inferSelect | undefined)
  db.delete(notes).where(eq(notes.id, id)).run()
  touchProject()
  if (!snapshot) return
  const snap = { ...snapshot }
  pushHistory({
    label: `excluir nota`,
    undo: () => {
      reinsertNotes([snap])
      touchProject()
    },
    redo: () => {
      getDb().delete(notes).where(eq(notes.id, id)).run()
      touchProject()
    }
  })
}
