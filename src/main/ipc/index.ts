import { registerCodeHandlers } from './codes'
import { registerCodingHandlers } from './codings'
import { registerDocumentHandlers } from './documents'
import { registerGroupHandlers } from './groups'
import { registerProjectHandlers } from './project'
import { registerQdpxHandlers } from './qdpx'

export function registerIpcHandlers(): void {
  registerProjectHandlers()
  registerDocumentHandlers()
  registerCodeHandlers()
  registerGroupHandlers()
  registerCodingHandlers()
  registerQdpxHandlers()
}
