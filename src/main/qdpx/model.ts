export interface QdpxCode {
  guid: string
  name: string
  color?: string
  description?: string | null
  parentGuid: string | null
}

export interface QdpxSelection {
  guid: string
  startPosition: number
  endPosition: number
  codeGuids: string[]
  noteGuids: string[]
}

export interface QdpxDocument {
  guid: string
  name: string
  plainText: string
  selections: QdpxSelection[]
  noteGuids: string[]
}

export interface QdpxNote {
  guid: string
  name: string | null
  plainText: string
  description: string | null
}

export interface QdpxSet {
  guid: string
  name: string
  description?: string | null
  memberCodeGuids: string[]
}

export interface QdpxUser {
  guid: string
  name: string
}

export interface QdpxProject {
  name: string
  users: QdpxUser[]
  codes: QdpxCode[]
  groups: QdpxSet[]
  documents: QdpxDocument[]
  notes: QdpxNote[]
  projectNoteGuids: string[]
}

export interface ParsedQdpx {
  project: QdpxProject
  skipped: string[]
}
