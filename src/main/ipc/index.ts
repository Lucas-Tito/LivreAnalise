import { registerCodeHandlers } from './codes'
import { registerCodingHandlers } from './codings'
import { registerNoteHandlers } from './notes'
import { registerDocumentHandlers } from './documents'
import { registerCollectionHandlers } from './collections'
import { registerProjectHandlers } from './project'
import { registerAiExportHandlers } from './aiExport'
import { registerQdpxHandlers } from './qdpx'
import { registerTranscriptionHandlers } from './transcription'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerDocumentHandlers()
  registerCodeHandlers()
  registerCollectionHandlers()
  registerCodingHandlers()
  registerNoteHandlers()
  registerQdpxHandlers()
  registerAiExportHandlers()
  registerTranscriptionHandlers()
}
