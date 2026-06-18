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
}

export interface QdpxDocument {
  guid: string
  name: string
  plainText: string
  selections: QdpxSelection[]
}

export interface QdpxGroup {
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
  groups: QdpxGroup[]
  documents: QdpxDocument[]
}

export interface ParsedQdpx {
  project: QdpxProject
  skipped: string[]
}
