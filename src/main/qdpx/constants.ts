import { APP_VERSION } from '@shared/version'

export const QDPX_NAMESPACE = 'urn:QDA-XML:project:1.0'
export const QDE_FILENAME = 'project.qde'
export const SOURCES_DIR = 'Sources'
export const APP_ORIGIN = `LivreAnalise ${APP_VERSION}`

export function nowIso(): string {
  return new Date().toISOString()
}
