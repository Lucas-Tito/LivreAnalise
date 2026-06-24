import type {
  Code,
  CodeGroup,
  CodeWithCount,
  Coding,
  CodingWithCode,
  CreateCodeInput,
  CreateCodingInput,
  CreateGroupInput,
  DocumentRecord,
  DocumentWithText,
  ExportResult,
  ImportReport,
  OpenProjectResult,
  ProjectMeta,
  RecentProject,
  RecentProjectWithStats,
  UpdateCodeInput,
  UpdateGroupInput
} from './types'

export const IPC = {
  project: {
    create: 'project:create',
    open: 'project:open',
    openPath: 'project:openPath',
    current: 'project:current',
    close: 'project:close',
    recents: 'project:recents'
  },
  documents: {
    list: 'documents:list',
    get: 'documents:get',
    import: 'documents:import',
    rename: 'documents:rename',
    updateText: 'documents:updateText',
    delete: 'documents:delete'
  },
  codes: {
    list: 'codes:list',
    create: 'codes:create',
    update: 'codes:update',
    delete: 'codes:delete'
  },
  groups: {
    list: 'groups:list',
    create: 'groups:create',
    update: 'groups:update',
    delete: 'groups:delete',
    members: 'groups:members',
    addMember: 'groups:addMember',
    removeMember: 'groups:removeMember'
  },
  codings: {
    listByDocument: 'codings:listByDocument',
    listByCode: 'codings:listByCode',
    create: 'codings:create',
    delete: 'codings:delete'
  },
  qdpx: {
    export: 'qdpx:export',
    import: 'qdpx:import'
  }
} as const

export interface Api {
  project: {
    create: () => Promise<OpenProjectResult | null>
    open: () => Promise<OpenProjectResult | null>
    openPath: (path: string) => Promise<OpenProjectResult | null>
    current: () => Promise<ProjectMeta | null>
    close: () => Promise<void>
    recents: () => Promise<RecentProjectWithStats[]>
  }
  documents: {
    list: () => Promise<DocumentRecord[]>
    get: (id: number) => Promise<DocumentWithText | null>
    import: () => Promise<DocumentRecord[]>
    rename: (id: number, name: string) => Promise<void>
    updateText: (id: number, text: string) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  codes: {
    list: () => Promise<CodeWithCount[]>
    create: (input: CreateCodeInput) => Promise<Code>
    update: (input: UpdateCodeInput) => Promise<void>
    delete: (id: number) => Promise<void>
  }
  groups: {
    list: () => Promise<CodeGroup[]>
    create: (input: CreateGroupInput) => Promise<CodeGroup>
    update: (input: UpdateGroupInput) => Promise<void>
    delete: (id: number) => Promise<void>
    members: (groupId: number) => Promise<number[]>
    addMember: (groupId: number, codeId: number) => Promise<void>
    removeMember: (groupId: number, codeId: number) => Promise<void>
  }
  codings: {
    listByDocument: (documentId: number) => Promise<Coding[]>
    listByCode: (codeId: number) => Promise<CodingWithCode[]>
    create: (input: CreateCodingInput) => Promise<Coding>
    delete: (id: number) => Promise<void>
  }
  qdpx: {
    export: () => Promise<ExportResult | null>
    import: () => Promise<ImportReport | null>
  }
}
