import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { v4 as uuid } from 'uuid'
import { APP_ORIGIN, nowIso, QDPX_NAMESPACE } from './constants'
import type {
  ParsedQdpx,
  QdpxCode,
  QdpxDocument,
  QdpxGroup,
  QdpxProject,
  QdpxSelection,
  QdpxUser
} from './model'

const ARRAY_ELEMENTS = new Set([
  'Code',
  'TextSource',
  'PlainTextSelection',
  'Set',
  'MemberCode',
  'Coding',
  'User'
])

interface XmlCodeNode {
  '@_guid': string
  '@_name': string
  '@_isCodable': string
  '@_color'?: string
  Description?: string
  Code?: XmlCodeNode[]
}

function buildCodeNodes(codes: QdpxCode[]): XmlCodeNode[] {
  const byParent = new Map<string | null, QdpxCode[]>()
  for (const c of codes) {
    const key = c.parentGuid ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }
  const build = (parentGuid: string | null): XmlCodeNode[] =>
    (byParent.get(parentGuid) ?? []).map((c) => {
      const node: XmlCodeNode = {
        '@_guid': c.guid,
        '@_name': c.name,
        '@_isCodable': 'true'
      }
      if (c.color) node['@_color'] = c.color
      if (c.description) node.Description = c.description
      const children = build(c.guid)
      if (children.length > 0) node.Code = children
      return node
    })
  return build(null)
}

export function buildQde(project: QdpxProject): string {
  const obj = {
    Project: {
      '@_xmlns': QDPX_NAMESPACE,
      '@_name': project.name,
      '@_origin': APP_ORIGIN,
      '@_modifiedDateTime': nowIso(),
      Users: {
        User: (project.users.length > 0
          ? project.users
          : [{ guid: '00000000-0000-0000-0000-000000000001', name: 'LivreAnalise' }]
        ).map((u) => ({ '@_guid': u.guid, '@_name': u.name }))
      },
      ...(project.codes.length > 0
        ? {
            CodeBook: {
              Codes: { Code: buildCodeNodes(project.codes) }
            }
          }
        : {}),
      ...(project.documents.length > 0
        ? {
            Sources: {
              TextSource: project.documents.map((doc) => ({
                '@_guid': doc.guid,
                '@_name': doc.name,
                '@_plainTextPath': `internal://${doc.guid}.txt`,
                ...(doc.selections.length > 0
                  ? {
                      PlainTextSelection: doc.selections.map((sel) => ({
                        '@_guid': sel.guid,
                        '@_startPosition': String(sel.startPosition),
                        '@_endPosition': String(sel.endPosition),
                        Coding: sel.codeGuids.map((codeGuid) => ({
                          '@_guid': uuid(),
                          CodeRef: { '@_targetGUID': codeGuid }
                        }))
                      }))
                    }
                  : {})
              }))
            }
          }
        : {}),
      ...(project.groups.length > 0
        ? {
            Sets: {
              Set: project.groups.map((g) => ({
                '@_guid': g.guid,
                '@_name': g.name,
                ...(g.description ? { Description: g.description } : {}),
                ...(g.memberCodeGuids.length > 0
                  ? {
                      MemberCode: g.memberCodeGuids.map((guid) => ({
                        '@_targetGUID': guid
                      }))
                    }
                  : {})
              }))
            }
          }
        : {})
    }
  }

  const builder = new XMLBuilder({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
    suppressBooleanAttributes: false
  })
  return `<?xml version="1.0" encoding="utf-8"?>\n${builder.build(obj)}`
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

export interface ParseResult extends ParsedQdpx {
  sourcePaths: Map<string, string>
}

export function parseQde(xml: string): ParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ARRAY_ELEMENTS.has(name)
  })
  const parsed = parser.parse(xml)
  const project = parsed.Project
  if (!project) {
    throw new Error('Arquivo QDPX invalido: elemento Project ausente')
  }

  const skipped: string[] = []
  const sourcePaths = new Map<string, string>()

  const users: QdpxUser[] = asArray<any>(project.Users?.User).map((u) => ({
    guid: u['@_guid'],
    name: u['@_name'] ?? ''
  }))

  const codes: QdpxCode[] = []
  const walkCodes = (node: any, parentGuid: string | null): void => {
    const guid = node['@_guid']
    codes.push({
      guid,
      name: node['@_name'] ?? 'Sem nome',
      color: node['@_color'],
      description: typeof node.Description === 'string' ? node.Description : null,
      parentGuid
    })
    for (const child of asArray<any>(node.Code)) walkCodes(child, guid)
  }
  for (const node of asArray<any>(project.CodeBook?.Codes?.Code)) {
    walkCodes(node, null)
  }

  const groups: QdpxGroup[] = asArray<any>(project.Sets?.Set).map((set) => ({
    guid: set['@_guid'],
    name: set['@_name'] ?? 'Grupo',
    description: typeof set.Description === 'string' ? set.Description : null,
    memberCodeGuids: asArray<any>(set.MemberCode)
      .map((m) => m['@_targetGUID'])
      .filter(Boolean)
  }))

  const documents: QdpxDocument[] = asArray<any>(project.Sources?.TextSource).map(
    (source) => {
      const guid = source['@_guid']
      const plainTextPath: string | undefined = source['@_plainTextPath']
      if (plainTextPath) sourcePaths.set(guid, plainTextPath)
      const inline =
        typeof source.PlainTextContent === 'string'
          ? source.PlainTextContent
          : ''
      const selections: QdpxSelection[] = asArray<any>(
        source.PlainTextSelection
      ).map((sel) => ({
        guid: sel['@_guid'],
        startPosition: Number(sel['@_startPosition']),
        endPosition: Number(sel['@_endPosition']),
        codeGuids: asArray<any>(sel.Coding)
          .map((coding) => coding.CodeRef?.['@_targetGUID'])
          .filter(Boolean)
      }))
      return {
        guid,
        name: source['@_name'] ?? 'Documento',
        plainText: inline,
        selections
      }
    }
  )

  for (const key of ['Notes', 'Links', 'Cases', 'Variables', 'Graphs']) {
    if (project[key]) skipped.push(key)
  }
  for (const key of ['PDFSource', 'AudioSource', 'VideoSource', 'PictureSource']) {
    if (project.Sources?.[key]) skipped.push(key)
  }

  return {
    project: { name: project['@_name'] ?? 'Projeto', users, codes, groups, documents },
    skipped,
    sourcePaths
  }
}
