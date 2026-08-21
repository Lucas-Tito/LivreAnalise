import { app } from 'electron'
import { join } from 'path'
import type { RecentProject } from '@shared/types'
import * as store from './recentsStore'

function recentsFile(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

// Para exibicao: esconde o que nao existe mais, sem apagar da lista guardada.
export function readRecents(): RecentProject[] {
  return store.visibleRecents(store.readStoredRecents(recentsFile()))
}

export function pushRecent(path: string, name: string): void {
  store.pushRecent(recentsFile(), path, name)
}

export function removeRecent(path: string): void {
  store.removeRecent(recentsFile(), path)
}

export function renameRecent(path: string, name: string): void {
  store.renameRecent(recentsFile(), path, name)
}

export function replaceRecent(oldPath: string, newPath: string, name: string): void {
  store.replaceRecent(recentsFile(), oldPath, newPath, name)
}
