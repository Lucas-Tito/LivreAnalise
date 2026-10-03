import type { AiExportScope } from './aiExport'
import type { ProjectVersion } from './projectVersions'
import type {
  Code,
  Collection,
  CollectionMember,
  CodeWithCount,
  Coding,
  CodingWithCode,
  CreateCodeInput,
  CreateCodingInput,
  CreateCollectionInput,
  CreateGroupInput,
  CreateNoteInput,
  DocumentRecord,
  DocumentWithText,
  ExportResult,
  MoveCodesInput,
  Note,
  OpenProjectResult,
  ProjectMeta,
  RecentProject,
  RecentProjectWithStats,
  RenameProjectResult,
  TranscriptionEnv,
  TranscriptionEvent,
  TranscriptionModel,
  TranscriptionStartInput,
  UpdateCodingInput,
  UpdateCodeInput,
  UpdateCollectionInput,
  UpdateNoteInput
} from './types'

export const IPC = {
  project: {
    create: 'project:create',
    open: 'project:open',
    openPath: 'project:openPath',
    current: 'project:current',
    close: 'project:close',
    recents: 'project:recents',
    rename: 'project:rename',
    trash: 'project:trash'
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
    createGroup: 'codes:createGroup',
    update: 'codes:update',
    delete: 'codes:delete',
    moveMany: 'codes:moveMany'
  },
  collections: {
    list: 'collections:list',
    create: 'collections:create',
    update: 'collections:update',
    delete: 'collections:delete',
    members: 'collections:members',
    allMembers: 'collections:allMembers',
    addMember: 'collections:addMember',
    removeMember: 'collections:removeMember'
  },
  codings: {
    listByDocument: 'codings:listByDocument',
    listByCode: 'codings:listByCode',
    create: 'codings:create',
    update: 'codings:update',
    delete: 'codings:delete'
  },
  notes: {
    listByDocument: 'notes:listByDocument',
    listProject: 'notes:listProject',
    create: 'notes:create',
    update: 'notes:update',
    delete: 'notes:delete'
  },
  transcription: {
    env: 'transcription:env',
    models: 'transcription:models',
    modelSize: 'transcription:modelSize',
    pickMedia: 'transcription:pickMedia',
    downloadModel: 'transcription:downloadModel',
    downloadBinary: 'transcription:downloadBinary',
    start: 'transcription:start',
    cancel: 'transcription:cancel',
    event: 'transcription:event'
  },
  aiExport: {
    export: 'aiExport:export',
    cliInstructions: 'aiExport:cliInstructions'
  },
  qdpx: {
    export: 'qdpx:export',
    importAsProject: 'qdpx:importAsProject'
  },
  history: {
    state: 'history:state',
    undo: 'history:undo',
    redo: 'history:redo'
  },
  versions: {
    list: 'versions:list',
    create: 'versions:create',
    prune: 'versions:prune',
    restore: 'versions:restore'
  },
  view: {
    zoomIn: 'view:zoom-in',
    zoomOut: 'view:zoom-out',
    resetZoom: 'view:zoom-reset',
    fontSans: 'view:font-sans',
    fontSerif: 'view:font-serif'
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
    rename: (path: string, name: string) => Promise<RenameProjectResult>
    trash: (path: string) => Promise<void>
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
    createGroup: (input: CreateGroupInput) => Promise<Code>
    update: (input: UpdateCodeInput) => Promise<void>
    delete: (id: number) => Promise<void>
    moveMany: (input: MoveCodesInput) => Promise<void>
  }
  collections: {
    list: () => Promise<Collection[]>
    create: (input: CreateCollectionInput) => Promise<Collection>
    update: (input: UpdateCollectionInput) => Promise<void>
    delete: (id: number) => Promise<void>
    members: (collectionId: number) => Promise<number[]>
    allMembers: () => Promise<CollectionMember[]>
    addMember: (collectionId: number, codeId: number) => Promise<void>
    removeMember: (collectionId: number, codeId: number) => Promise<void>
  }
  codings: {
    listByDocument: (documentId: number) => Promise<Coding[]>
    listByCode: (codeId: number) => Promise<CodingWithCode[]>
    create: (input: CreateCodingInput) => Promise<Coding>
    update: (input: UpdateCodingInput) => Promise<Coding>
    delete: (id: number) => Promise<void>
  }
  notes: {
    listByDocument: (documentId: number) => Promise<Note[]>
    listProject: () => Promise<Note[]>
    create: (input: CreateNoteInput) => Promise<Note>
    update: (input: UpdateNoteInput) => Promise<Note>
    delete: (id: number) => Promise<void>
  }
  transcription: {
    env: () => Promise<TranscriptionEnv>
    models: () => Promise<TranscriptionModel[]>
    modelSize: (modelId: string) => Promise<number>
    pickMedia: () => Promise<string | null>
    downloadModel: (modelId: string) => Promise<boolean>
    downloadBinary: () => Promise<string>
    start: (input: TranscriptionStartInput) => Promise<void>
    cancel: () => Promise<void>
    onEvent: (listener: (event: TranscriptionEvent) => void) => () => void
  }
  aiExport: {
    export: (
      scope: AiExportScope,
      documentId: number | null
    ) => Promise<ExportResult | null>
    cliInstructions: () => Promise<string>
  }
  qdpx: {
    export: () => Promise<ExportResult | null>
    importAsProject: () => Promise<OpenProjectResult | null>
  }
  view: {
    onAction: (listener: (action: string) => void) => () => void
  }
  history: {
    state: () => Promise<HistoryState>
    undo: () => Promise<string | null>
    redo: () => Promise<string | null>
  }
  versions: {
    list: () => Promise<ProjectVersion[]>
    create: (label: string | null) => Promise<ProjectVersion>
    prune: () => Promise<ProjectVersion[]>
    restore: (id: string) => Promise<OpenProjectResult | null>
  }
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
}
