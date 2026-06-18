import { writeFile } from 'fs/promises'
import type { ExportResult } from '@shared/types'
import {
  getDocument,
  listCodes,
  listCodingsByDocument,
  listDocuments,
  listGroupMembers,
  listGroups
} from '../db/repositories'
import type {
  QdpxCode,
  QdpxDocument,
  QdpxGroup,
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

  const groups = listGroups()
  if (groups.some((g) => g.parentGroupId !== null)) {
    warnings.push(
      'Grupos aninhados foram achatados em Sets planos no arquivo .qdpx (o aninhamento e mantido apenas no projeto LivreAnalise).'
    )
  }
  const qdpxGroups: QdpxGroup[] = groups.map((g) => ({
    guid: g.guid,
    name: g.name,
    description: g.description,
    memberCodeGuids: listGroupMembers(g.id)
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
          codeGuids: [codeGuid]
        })
      }
    }
    return {
      guid: docRecord.guid,
      name: docRecord.name,
      plainText: doc?.plainText ?? '',
      selections: Array.from(groupedBySpan.values())
    }
  })

  return {
    project: {
      name: projectName,
      users: [],
      codes: qdpxCodes,
      groups: qdpxGroups,
      documents: qdpxDocuments
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
