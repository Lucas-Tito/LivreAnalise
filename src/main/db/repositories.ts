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
import { adjustCodings, relocalizarTrecho, type CodingUpdate } from '@shared/editAdjust'
import {
  computeMoveOrder,
  isNoopMove,
  validateParentChange
} from '@shared/codeTree'
import { pushHistory } from '../history/stack'
import type { MoveCodesInput, NoteAnchorStatus, NoteScope } from '@shared/types'
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

  // Antes de desistir de uma ancora, procura o trecho original no texto novo.
  // Mover um paragrafo apaga as posicoes mas preserva o texto: sem isto a
  // citacao era apagada e a nota desvinculada com o trecho inteiro ainda ali.
  const citacoesRelocalizadas: CodingUpdate[] = []
  const citacoesPerdidas: number[] = []
  // Os spans ocupados sao os de DESTINO, nao os de origem: as citacoes que
  // sobreviveram ja foram deslocadas por `adjustCodings` para posicoes novas.
  // Comparar contra as posicoes velhas deixava uma citacao relocalizada cair em
  // cima de outra que acabara de ser movida para ali -- o indice unico recusava,
  // a transacao inteira fazia rollback e SALVAR O TEXTO FALHAVA. Antes desta
  // relocalizacao existir, a citacao era apagada e o texto salvava.
  const destino = new Map(
    codingsList.map((c) => [c.id, { codeId: c.codeId, startPos: c.startPos, endPos: c.endPos }])
  )
  for (const u of updates) {
    const d = destino.get(u.id)
    if (d) {
      d.startPos = u.startPos
      d.endPos = u.endPos
    }
  }
  for (const rid of removeIds) destino.delete(rid)
  const ocupados = new Set(
    [...destino.values()].map((d) => `${d.codeId}:${d.startPos}:${d.endPos}`)
  )
  for (const rid of removeIds) {
    const c = codingsList.find((x) => x.id === rid)
    const achado = c
      ? relocalizarTrecho(current.plainText.slice(c.startPos, c.endPos), newText)
      : null
    // o indice unico (documento, codigo, inicio, fim) recusaria uma citacao
    // que caisse em cima de outra igual: nesse caso ela e mesmo duplicata
    if (c && achado && !ocupados.has(`${c.codeId}:${achado.startPos}:${achado.endPos}`)) {
      ocupados.add(`${c.codeId}:${achado.startPos}:${achado.endPos}`)
      citacoesRelocalizadas.push({ id: rid, ...achado })
    } else {
      citacoesPerdidas.push(rid)
    }
  }

  const notasRelocalizadas: CodingUpdate[] = []
  const detachedSnapshots = new Map<number, string>()
  for (const noteId of noteAdjust.removeIds) {
    const note = anchoredNotes.find((n) => n.id === noteId)
    if (!note) continue
    const trecho = current.plainText.slice(note.startPos, note.endPos)
    const achado = relocalizarTrecho(trecho, newText)
    if (achado) notasRelocalizadas.push({ id: noteId, ...achado })
    else detachedSnapshots.set(noteId, trecho)
  }

  db.transaction((tx) => {
    tx.update(documents)
      .set({ plainText: newText, charCount: newText.length })
      .where(eq(documents.id, id))
      .run()
    for (const rid of citacoesPerdidas) {
      tx.delete(codings).where(eq(codings.id, rid)).run()
    }
    for (const u of [...updates, ...citacoesRelocalizadas]) {
      tx.update(codings)
        .set({ startPos: u.startPos, endPos: u.endPos })
        .where(eq(codings.id, u.id))
        .run()
    }
    for (const u of [...noteAdjust.updates, ...notasRelocalizadas]) {
      tx.update(notes)
        .set({ startPos: u.startPos, endPos: u.endPos })
        .where(eq(notes.id, u.id))
        .run()
    }
    for (const noteId of detachedSnapshots.keys()) {
      tx.update(notes)
        .set({
          anchorStatus: 'detached',
          anchorText: detachedSnapshots.get(noteId) ?? null,
          // Zera junto, igual o importador faz. Manter as posicoes antigas
          // deixava a nota apontando para um trecho que o texto nao tem mais, e
          // so a ordem das verificacoes na interface impedia alguem de ler isso
          // como se fosse valido.
          startPos: null,
          endPos: null
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
  // Nasce no fim do seu nível: com sort_order 0 ele cairia no meio da lista
  // por ordem alfabética, não onde o usuário acabou de criar.
  const siblings = db.select().from(codes).all() as Code[]
  const nextOrder =
    siblings
      .filter((c) => c.parentId === (input.parentId ?? null))
      .reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1
  const res = db
    .insert(codes)
    .values({
      guid,
      name: input.name,
      color: input.color,
      description: input.description ?? null,
      parentId: input.parentId ?? null,
      sortOrder: nextOrder
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
  if (!before) return
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
  // Soltar onde já estava não é erro nem movimento: sai antes de tocar no
  // banco e no histórico, para o desfazer não ganhar passos vazios.
  if (
    isNoopMove(all, unique, {
      parentId: input.parentId,
      anchorId: input.anchorId,
      position: input.position
    })
  ) {
    return
  }
  const { ordered } = computeMoveOrder(
    all,
    unique,
    input.parentId,
    input.anchorId,
    input.position
  )

  // Um sort_order novo para todos os irmãos do destino: é o que faz a lista
  // obedecer à ordem escolhida no arrasto em vez de ao alfabeto.
  const before = new Map<number, { parentId: number | null; sortOrder: number }>()
  for (const c of all) {
    if (c.parentId === input.parentId || unique.includes(c.id)) {
      before.set(c.id, { parentId: c.parentId, sortOrder: c.sortOrder })
    }
  }
  db.transaction((tx) => {
    ordered.forEach((code, position) => {
      if (unique.includes(code.id)) {
        tx.update(codes)
          .set({ parentId: input.parentId, sortOrder: position })
          .where(eq(codes.id, code.id))
          .run()
      } else if (code.sortOrder !== position) {
        tx.update(codes)
          .set({ sortOrder: position })
          .where(eq(codes.id, code.id))
          .run()
      }
    })
  })
  touchProject()
  const snapshot = [...before.entries()]
  const afterParent = input.parentId
  const count = unique.length
  pushHistory({
    label: afterParent == null ? `remover ${count} do grupo` : `mover ${count} código${count > 1 ? 's' : ''}`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        for (const [id, prev] of snapshot) {
          tx.update(codes)
            .set({ parentId: prev.parentId, sortOrder: prev.sortOrder })
            .where(eq(codes.id, id))
            .run()
        }
      })
      touchProject()
    },
    redo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        ordered.forEach((code, position) => {
          if (unique.includes(code.id)) {
            tx.update(codes)
              .set({ parentId: afterParent, sortOrder: position })
              .where(eq(codes.id, code.id))
              .run()
          } else if (code.sortOrder !== position) {
            tx.update(codes)
              .set({ sortOrder: position })
              .where(eq(codes.id, code.id))
              .run()
          }
        })
      })
      touchProject()
    }
  })
}

// Ação composta atômica: criar grupo + reparentar o código de origem.
// Um único comando no histórico (desfazer remove o grupo e restaura o pai).
export function createGroupCode(name: string, color: string, codeId: number): Code {
  const all = getDb().select().from(codes).all() as Code[]
  const origin = all.find((c) => c.id === codeId)
  if (!origin) throw new Error('Código de origem não encontrado.')
  if (origin.parentId != null || all.some((c) => c.parentId === codeId)) {
    throw new Error('Só um código solto sem filhos pode virar grupo.')
  }
  return createGroupFromCodes(name, color, [codeId])
}

// Mesmo comando, com vários códigos: é o "unir códigos em um grupo" do arrasto.
// Todos entram como filhos do grupo novo e o grupo nasce na raiz.
export function createGroupFromCodes(
  name: string,
  color: string,
  codeIds: number[]
): Code {
  const db = getDb()
  const unique = [...new Set(codeIds)]
  if (unique.length === 0) throw new Error('Escolha ao menos um código.')
  const all = db.select().from(codes).all() as Code[]
  const members = unique.map((id) => {
    const code = all.find((c) => c.id === id)
    if (!code) throw new Error('Código não encontrado.')
    if (all.some((c) => c.parentId === id)) {
      throw new Error(`"${code.name}" já é um grupo e não pode entrar em outro.`)
    }
    return code
  })
  const guid = uuid()
  // O grupo nasce onde os membros estavam, nao no comeco da lista. Sem isto ele
  // caia no DEFAULT 0 do schema e saltava para o topo, longe do gesto que o
  // criou -- o mesmo descuido que o createCode evita de proposito logo acima.
  const naRaiz = members.filter((m) => m.parentId === null)
  const sortOrder =
    naRaiz.length > 0
      ? Math.min(...naRaiz.map((m) => m.sortOrder))
      : all.filter((c) => c.parentId === null).reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1
  let group!: Code
  db.transaction((tx) => {
    const res = tx
      .insert(codes)
      .values({ guid, name, color, description: null, parentId: null, sortOrder })
      .run()
    group = tx
      .select()
      .from(codes)
      .where(eq(codes.id, Number(res.lastInsertRowid)))
      .get() as Code
    members.forEach((member, position) => {
      tx.update(codes)
        .set({ parentId: group.id, sortOrder: position })
        .where(eq(codes.id, member.id))
        .run()
    })
  })
  touchProject()
  const groupSnap = { ...group }
  const previous = members.map((m) => ({ parentId: m.parentId, sortOrder: m.sortOrder }))
  const ids = members.map((m) => m.id)
  pushHistory({
    label: `criar grupo "${name}"`,
    undo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        ids.forEach((id, index) => {
          tx.update(codes).set(previous[index]).where(eq(codes.id, id)).run()
        })
        tx.delete(codes).where(eq(codes.id, groupSnap.id)).run()
      })
      touchProject()
    },
    redo: () => {
      const db2 = getDb()
      db2.transaction((tx) => {
        tx.insert(codes).values(groupSnap).onConflictDoNothing().run()
        ids.forEach((id, position) => {
          tx.update(codes)
            .set({ parentId: groupSnap.id, sortOrder: position })
            .where(eq(codes.id, id))
            .run()
        })
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
  // O cast mentia: `.get()` devolve undefined quando nao ha linha, e o getNote
  // la embaixo quebrava com "Cannot read properties of undefined". Apagar o
  // documento com o editor de nota aberto fazia todo autosave rejeitar e o
  // painel travar em erro permanente.
  const beforeRow = db.select().from(notes).where(eq(notes.id, input.id)).get() as
    | typeof notes.$inferSelect
    | undefined
  if (!beforeRow) throw new Error('Essa nota não existe mais.')
  const patch: {
    title?: string | null
    body?: string
    startPos?: number
    endPos?: number
    anchorStatus?: NoteAnchorStatus
    anchorText?: string | null
    scope?: NoteScope
    updatedAt: string
  } = {
    updatedAt: new Date().toISOString()
  }
  if (input.title !== undefined) patch.title = input.title
  if (input.body !== undefined) patch.body = input.body
  // Religar: ate aqui 'attached' so era escrito ao criar a nota e ao importar,
  // entao uma nota desvinculada por uma edicao de texto nao tinha volta -- so
  // apagar e reescrever. O trecho original guardado na desvinculacao perde o
  // sentido assim que a ancora existe de novo.
  if (input.startPos !== undefined && input.endPos !== undefined) {
    patch.startPos = input.startPos
    patch.endPos = input.endPos
    patch.anchorStatus = 'attached'
    patch.anchorText = null
    // nota que voltou de um .qdpx chega como nota de documento: religar
    // devolve o escopo junto, senao ela fica ancorada e fora da lista de trechos
    if (beforeRow?.documentId != null) patch.scope = 'excerpt'
  }
  db.update(notes).set(patch).where(eq(notes.id, input.id)).run()
  touchProject()
  const after = getNote(input.id)
  const b = { ...beforeRow }
  const afterRow = (getDb().select().from(notes).where(eq(notes.id, input.id)).get() as typeof notes.$inferSelect)
  const a = { ...afterRow }
  pushHistory({
      label: `editar nota`,
      // o autosave grava a cada pausa de digitacao: sem isto um memo longo
      // enchia a pilha de 100 e enterrava as acoes de verdade
      coalesceKey: `nota:${b.id}`,
      undo: () => {
        // a ancora vai junto: desfazer um religamento precisa devolver a nota
        // ao estado desvinculado, com o trecho original que ela guardava
        getDb().update(notes).set({
          title: b.title, body: b.body, updatedAt: b.updatedAt,
          startPos: b.startPos, endPos: b.endPos,
          anchorStatus: b.anchorStatus, anchorText: b.anchorText,
          // o scope tambem muda ao religar: sem ele o desfazer devolvia as
          // posicoes nulas mas deixava a nota como 'excerpt' ancorada e sem
          // trecho guardado -- invisivel na lista e sem a oferta de religar
          scope: b.scope
        }).where(eq(notes.id, b.id)).run()
        touchProject()
      },
      redo: () => {
        getDb().update(notes).set({
          title: a.title, body: a.body, updatedAt: a.updatedAt,
          startPos: a.startPos, endPos: a.endPos,
          anchorStatus: a.anchorStatus, anchorText: a.anchorText,
          scope: a.scope
        }).where(eq(notes.id, a.id)).run()
        touchProject()
      }
  })
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
