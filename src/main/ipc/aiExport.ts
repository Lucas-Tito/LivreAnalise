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
import type { ExportResult } from '@shared/types'
import { getActivePath, hasActiveProject } from '../db'
import {
  getDocument,
  listAllCollectionMembers,
  listCodes,
  listAllCodings,
  listCodingsByDocument,
  listCollections,
  listDocuments
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
      documentId: number | null
    ): Promise<ExportResult | null> => {
      if (!hasActiveProject()) throw new Error('Nenhum projeto aberto')
      const projectName = currentProjectName()

      const result = await dialog.showSaveDialog({
        title: 'Exportar para IA',
        defaultPath: suggestedFileName(projectName, scope),
        filters: [{ name: 'Texto', extensions: ['txt'] }]
      })
      if (result.canceled || !result.filePath) return null

      const conteudo = buildAiExport({
        projectName,
        scope,
        codes: listCodes(),
        collections: listCollections(),
        members: listAllCollectionMembers(),
        documents: documentosDoEscopo(scope, documentId),
        allCodings: listAllCodings()
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
