export interface ProjectMeta {
  id: number
  guid: string
  name: string
  createdAt: string
  updatedAt: string
  appVersion: string
}

export interface RecentProject {
  path: string
  name: string
  lastOpenedAt: string
}

export interface ProjectStats {
  documents: number
  quotes: number
  codesUsed: number
}

export interface RecentProjectWithStats extends RecentProject {
  stats: ProjectStats | null
}

export type DocumentFormat = 'txt' | 'docx'

export interface DocumentRecord {
  id: number
  guid: string
  name: string
  originalFormat: DocumentFormat
  sourceFilename: string | null
  charCount: number
  importedAt: string
}

export interface DocumentWithText extends DocumentRecord {
  plainText: string
}

export interface Code {
  id: number
  guid: string
  name: string
  color: string
  description: string | null
  parentId: number | null
  sortOrder: number
  createdAt: string
}

export interface CodeWithCount extends Code {
  usageCount: number
}

export interface Collection {
  id: number
  guid: string
  name: string
  description: string | null
  sortOrder: number
}

export interface CollectionMember {
  collectionId: number
  codeId: number
}

export interface Coding {
  id: number
  guid: string
  documentId: number
  codeId: number
  startPos: number
  endPos: number
  createdAt: string
}

export interface CodingWithCode extends Coding {
  codeName: string
  codeColor: string
  text: string
}

export interface CreateCodeInput {
  name: string
  color: string
  description?: string | null
  parentId?: number | null
}

export interface UpdateCodeInput {
  id: number
  name?: string
  color?: string
  description?: string | null
  parentId?: number | null
  sortOrder?: number
}

export interface CreateCollectionInput {
  name: string
  description?: string | null
}

export interface UpdateCollectionInput {
  id: number
  name?: string
  description?: string | null
  sortOrder?: number
}

export interface CreateCodingInput {
  documentId: number
  codeId: number
  startPos: number
  endPos: number
}

export interface UpdateCodingInput {
  id: number
  startPos: number
  endPos: number
}

export interface OpenProjectResult {
  meta: ProjectMeta
  path: string
}

export interface ImportReport {
  codes: number
  groups: number
  documents: number
  codings: number
  skipped: string[]
}

export interface ExportResult {
  path: string
  warnings: string[]
}

export interface TranscriptionEnv {
  ffmpeg: boolean
  binaryPath: string | null
  canDownloadBinary: boolean
  defaultModelId: string
}

export interface TranscriptionModel {
  id: string
  label: string
  approxBytes: number
  ready: boolean
}

export interface TranscriptionStartInput {
  mediaPath: string
  modelId: string
  language: string | null
  binaryPath?: string | null
}

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

export type TranscriptionEvent =
  | { kind: 'phase'; phase: 'preparando' | 'transcrevendo'; detail?: string }
  | { kind: 'segment'; segment: TranscriptionSegment; progress: number }
  | { kind: 'done'; outputPath: string; segments: number }
  | { kind: 'error'; message: string }
  | { kind: 'canceled' }
  | {
      kind: 'download'
      what: 'modelo' | 'programa'
      receivedBytes: number
      totalBytes: number
    }
