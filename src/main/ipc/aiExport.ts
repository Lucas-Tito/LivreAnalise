import { dialog, ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import { IPC } from '@shared/ipc'
import {
  buildAiExport,
  buildCliInstructions,
  suggestedFileName,
  type AiExportDocument,
  type AiExportScope
} from '@shared/aiExport'
import type { ExportResult, Note } from '@shared/types'
import { getActivePath, hasActiveProject } from '../db'
import {
  getDocument,
  listAllCollectionMembers,
  listCodes,
  listAllCodings,
  listCodingsByDocument,
  listCollections,
  listDocuments,
  listNotesByDocument,
  listProjectNotes
} from '../db/repositories'
import { currentProjectName } from './project'

function documentosDoEscopo(
  scope: AiExportScope,
  documentId: number | null
): AiExportDocument[] {
  if (scope === 'structure') return []

  const registros =
    scope === 'document'
      ? documentId != null
        ? [getDocument(documentId)].filter((d) => d !== null)
        : []
      : listDocuments().map((d) => getDocument(d.id))

  return registros
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => ({
      id: d.id,
      name: d.name,
      plainText: d.plainText,
      codings: listCodingsByDocument(d.id)
    }))
}

export function registerAiExportHandlers(): void {
  ipcMain.handle(
    IPC.aiExport.export,
    async (
      _e,
      scope: AiExportScope,
      documentId: number | null,
      includeNotes?: boolean
    ): Promise<ExportResult | null> => {
      if (!hasActiveProject()) throw new Error('Nenhum projeto aberto')
      const projectName = currentProjectName()

      const result = await dialog.showSaveDialog({
        title: 'Exportar para IA',
        defaultPath: suggestedFileName(projectName, scope),
        filters: [{ name: 'Texto', extensions: ['txt'] }]
      })
      if (result.canceled || !result.filePath) return null

      const docs = documentosDoEscopo(scope, documentId)
      const notesByDocument = new Map<number, Note[]>()
      if (includeNotes) {
        for (const d of docs) {
          if (d.id != null) notesByDocument.set(d.id, listNotesByDocument(d.id))
        }
        if (scope === 'structure') {
          for (const rec of listDocuments()) {
            if (!notesByDocument.has(rec.id)) notesByDocument.set(rec.id, listNotesByDocument(rec.id))
          }
        }
      }
      const conteudo = buildAiExport({
        projectName,
        scope,
        codes: listCodes(),
        collections: listCollections(),
        members: listAllCollectionMembers(),
        documents: docs,
        allCodings: listAllCodings(),
        includeNotes: includeNotes ?? false,
        projectNotes: includeNotes ? listProjectNotes() : [],
        notesByDocument
      })

      writeFileSync(result.filePath, conteudo, 'utf-8')
      return { path: result.filePath, warnings: [] }
    }
  )

  ipcMain.handle(IPC.aiExport.cliInstructions, async (): Promise<string> => {
    const path = getActivePath()
    if (!path) throw new Error('Nenhum projeto aberto')
    return buildCliInstructions(path)
  })
}
