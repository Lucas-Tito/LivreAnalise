import { registerCodeHandlers } from './codes'
import { registerCodingHandlers } from './codings'
import { registerDocumentHandlers } from './documents'
import { registerCollectionHandlers } from './collections'
import { registerProjectHandlers } from './project'
import { registerQdpxHandlers } from './qdpx'
import { registerTranscriptionHandlers } from './transcription'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerDocumentHandlers()
  registerCodeHandlers()
  registerCollectionHandlers()
  registerCodingHandlers()
  registerQdpxHandlers()
  registerTranscriptionHandlers()
}
