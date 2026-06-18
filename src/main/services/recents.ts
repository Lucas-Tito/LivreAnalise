import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { RecentProject } from '@shared/types'

const MAX_RECENTS = 15

function recentsFile(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

export function readRecents(): RecentProject[] {
  try {
    const file = recentsFile()
    if (!existsSync(file)) return []
    const data = JSON.parse(readFileSync(file, 'utf-8')) as RecentProject[]
    return data.filter((r) => existsSync(r.path))
  } catch {
    return []
  }
}

function writeRecents(list: RecentProject[]): void {
  const file = recentsFile()
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(file, JSON.stringify(list, null, 2), 'utf-8')
}

export function pushRecent(path: string, name: string): void {
  const now = new Date().toISOString()
  const existing = readRecents().filter((r) => r.path !== path)
  const next: RecentProject[] = [{ path, name, lastOpenedAt: now }, ...existing]
  writeRecents(next.slice(0, MAX_RECENTS))
}
