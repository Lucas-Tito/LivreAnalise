export type ProjectVersionKind = 'manual' | 'auto'

export interface ProjectVersion {
  id: string
  file: string
  createdAt: string
  kind: ProjectVersionKind
  label: string | null
  appVersion: string
  schemaVersion: number
  projectName: string
  sizeBytes: number
}
