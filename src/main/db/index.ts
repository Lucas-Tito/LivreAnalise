import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { SCHEMA_DDL } from './ddl'
import * as schema from './schema'

export type ProjectDb = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database
}

interface ActiveProject {
  db: ProjectDb
  raw: Database.Database
  path: string
}

let active: ActiveProject | null = null

function applySchema(raw: Database.Database): void {
  raw.pragma('journal_mode = WAL')
  raw.pragma('foreign_keys = ON')
  raw.exec(SCHEMA_DDL)
}

export function openDatabase(path: string): ProjectDb {
  closeDatabase()
  const raw = new Database(path)
  applySchema(raw)
  const db = drizzle(raw, { schema }) as ProjectDb
  active = { db, raw, path }
  return db
}

export function getDb(): ProjectDb {
  if (!active) {
    throw new Error('Nenhum projeto aberto')
  }
  return active.db
}

export function getRaw(): Database.Database {
  if (!active) {
    throw new Error('Nenhum projeto aberto')
  }
  return active.raw
}

export function getActivePath(): string | null {
  return active?.path ?? null
}

export function hasActiveProject(): boolean {
  return active !== null
}

export function closeDatabase(): void {
  if (active) {
    try {
      active.raw.close()
    } catch {
      // ignore close errors
    }
    active = null
  }
}
