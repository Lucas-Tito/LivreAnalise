import { writeFile } from 'fs/promises'
import type { ExportResult } from '@shared/types'
import {
  getDocument,
  listCodes,
  listCodingsByDocument,
  listDocuments,
  listCollectionMembers,
  listCollections,
  listNotesByDocument,
  listProjectNotes
} from '../db/repositories'
import type {
  QdpxCode,
  QdpxDocument,
  QdpxNote,
  QdpxSet,
  QdpxProject,
  QdpxSelection
} from './model'
import { serializeQdpx } from './serialize'

export function buildProjectFromDb(projectName: string): {
  project: QdpxProject
  warnings: string[]
} {
  const warnings: string[] = []
  const codes = listCodes()
  const codeGuidById = new Map(codes.map((c) => [c.id, c.guid]))

  const qdpxCodes: QdpxCode[] = codes.map((c) => ({
    guid: c.guid,
    name: c.name,
    color: c.color,
    description: c.description,
    parentGuid: c.parentId ? codeGuidById.get(c.parentId) ?? null : null
  }))

  const groups = listCollections()
  const qdpxSets: QdpxSet[] = groups.map((g) => ({
    guid: g.guid,
    name: g.name,
    description: g.description,
    memberCodeGuids: listCollectionMembers(g.id)
      .map((id) => codeGuidById.get(id))
      .filter((guid): guid is string => Boolean(guid))
  }))

  const qdpxDocuments: QdpxDocument[] = listDocuments().map((docRecord) => {
    const doc = getDocument(docRecord.id)
    const codings = listCodingsByDocument(docRecord.id)
    const groupedBySpan = new Map<string, QdpxSelection>()
    for (const coding of codings) {
      const key = `${coding.startPos}-${coding.endPos}`
      const codeGuid = codeGuidById.get(coding.codeId)
      if (!codeGuid) continue
      const existing = groupedBySpan.get(key)
      if (existing) {
        existing.codeGuids.push(codeGuid)
      } else {
        groupedBySpan.set(key, {
          guid: coding.guid,
          startPosition: coding.startPos,
          endPosition: coding.endPos,
          codeGuids: [codeGuid],
          noteGuids: []
        })
      }
    }
    return {
      guid: docRecord.guid,
      name: docRecord.name,
      plainText: doc?.plainText ?? '',
      selections: Array.from(groupedBySpan.values()),
      noteGuids: []
    }
  })

  // Notas: projeto → Project/NoteRef; documento → TextSource/NoteRef;
  // trecho attached → NoteRef na seleção (reusa seleção codificada no mesmo
  // span ou cria seleção só-nota). Detached rebaixa com aviso, nunca some.
  const qdpxNotes: QdpxNote[] = []
  const projectNoteGuids: string[] = []
  const docById = new Map(qdpxDocuments.map((d) => [d.guid, d]))
  for (const note of listProjectNotes()) {
    qdpxNotes.push({ guid: note.guid, name: note.title, plainText: note.body, description: note.anchorText })
    projectNoteGuids.push(note.guid)
  }
  for (const docRecord of listDocuments()) {
    const qdpxDoc = docById.get(docRecord.guid)
    if (!qdpxDoc) continue
    for (const note of listNotesByDocument(docRecord.id)) {
      if (note.scope === 'project') {
        qdpxNotes.push({ guid: note.guid, name: note.title, plainText: note.body, description: note.anchorText })
        projectNoteGuids.push(note.guid)
        continue
      }
      if (note.scope === 'document' || note.anchorStatus === 'detached' || note.startPos == null || note.endPos == null) {
        if (note.scope === 'excerpt' && note.anchorStatus === 'detached') {
          warnings.push(`Nota "${note.title ?? 'sem título'}" perdeu a âncora e foi exportada no documento "${docRecord.name}".`)
        }
        qdpxNotes.push({ guid: note.guid, name: note.title, plainText: note.body, description: note.anchorText })
        qdpxDoc.noteGuids.push(note.guid)
        continue
      }
      const key = `${note.startPos}-${note.endPos}`
      const sel = qdpxDoc.selections.find((s) => `${s.startPosition}-${s.endPosition}` === key)
      qdpxNotes.push({ guid: note.guid, name: note.title, plainText: note.body, description: null })
      if (sel) sel.noteGuids.push(note.guid)
      else {
        qdpxDoc.selections.push({
          guid: note.guid,
          startPosition: note.startPos,
          endPosition: note.endPos,
          codeGuids: [],
          noteGuids: [note.guid]
        })
      }
    }
  }

  return {
    project: {
      name: projectName,
      users: [],
      codes: qdpxCodes,
      groups: qdpxSets,
      documents: qdpxDocuments,
      notes: qdpxNotes,
      projectNoteGuids
    },
    warnings
  }
}

export async function exportQdpx(
  outputPath: string,
  projectName: string
): Promise<ExportResult> {
  const { project, warnings } = buildProjectFromDb(projectName)
  const buffer = await serializeQdpx(project)
  await writeFile(outputPath, buffer)
  return { path: outputPath, warnings }
}
