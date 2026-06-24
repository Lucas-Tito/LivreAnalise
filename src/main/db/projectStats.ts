import Database from 'better-sqlite3'
import { count, sql } from 'drizzle-orm'
import { existsSync } from 'fs'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { ProjectStats } from '@shared/types'
import { getActivePath, getDb, hasActiveProject, type ProjectDb } from './index'
import { codings, documents } from './schema'
import * as schema from './schema'

function statsFromDb(db: ProjectDb): ProjectStats {
  const documentCount = db.select({ count: count() }).from(documents).get()?.count ?? 0
  const quoteCount = db.select({ count: count() }).from(codings).get()?.count ?? 0
  const codesUsed =
    db
      .select({ count: sql<number>`count(distinct ${codings.codeId})` })
      .from(codings)
      .get()?.count ?? 0

  return {
    documents: Number(documentCount),
    quotes: Number(quoteCount),
    codesUsed: Number(codesUsed)
  }
}

export function readProjectStats(path: string): ProjectStats | null {
  if (!existsSync(path)) return null

  if (hasActiveProject() && getActivePath() === path) {
    try {
      return statsFromDb(getDb())
    } catch {
      return null
    }
  }

  let raw: Database.Database | null = null
  try {
    raw = new Database(path, { readonly: true })
    const db = drizzle(raw, { schema }) as ProjectDb
    return statsFromDb(db)
  } catch {
    return null
  } finally {
    raw?.close()
  }
}
