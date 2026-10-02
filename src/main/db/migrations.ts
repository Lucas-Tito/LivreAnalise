import type Database from 'better-sqlite3'
import { NOTES_DDL, SCHEMA_DDL } from './ddl'

/**
 * Versão do schema do banco, independente da versão do aplicativo
 * (`project_meta.app_version`). Bancos legados, criados antes de existir
 * versionamento, não têm carimbo (`user_version = 0`) e correspondem à
 * versão 1.
 */
export const CURRENT_SCHEMA_VERSION = 2

export interface Migration {
  version: number
  description: string
  /**
   * Aplica a migração. Precisa ser idempotente (usar `IF NOT EXISTS`):
   * o carimbo da versão só é gravado depois que a transação commita,
   * então uma queda no meio do caminho faz a migração rodar de novo
   * na próxima abertura.
   */
  up: (raw: Database.Database) => void
}

/**
 * Registro ordenado das migrações. Mudanças futuras de schema entram aqui
 * com a próxima versão.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 2,
    description: 'cria a tabela de notas (memos de projeto, documento e trecho)',
    up: (raw) => {
      raw.exec(NOTES_DDL)
    }
  }
]

export function getSchemaVersion(raw: Database.Database): number {
  const row = raw.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

export function setSchemaVersion(raw: Database.Database, version: number): void {
  raw.pragma(`user_version = ${version}`)
}

export interface MigrateOptions {
  migrations?: Migration[]
  targetVersion?: number
}

/**
 * Garante o schema e aplica as migrações pendentes na abertura do projeto.
 * - Banco novo ou legado (sem carimbo): o DDL idempotente já deixa tudo no
 *   estado atual, então basta carimbar. Nenhum dado é tocado.
 * - Banco desatualizado: aplica cada migração pendente em uma única
 *   transação; se qualquer uma falhar, nada é aplicado e a versão não muda.
 * - Banco de um app mais novo: recusa a abertura em vez de corromper.
 */
export function migrateDatabase(raw: Database.Database, options?: MigrateOptions): void {
  const migrations = options?.migrations ?? MIGRATIONS
  const target = options?.targetVersion ?? CURRENT_SCHEMA_VERSION

  raw.exec(SCHEMA_DDL)

  const seen = new Set<number>()
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(`Migração duplicada para a versão ${m.version}`)
    }
    seen.add(m.version)
  }

  const current = getSchemaVersion(raw)
  if (current > target) {
    throw new Error(
      `O projeto foi criado por uma versão mais nova do aplicativo (schema ${current}, esperado ${target}). Atualize o LivreAnalise para abri-lo.`
    )
  }
  if (current === 0 || current === target) {
    setSchemaVersion(raw, target)
    return
  }

  const pending = migrations
    .filter((m) => m.version > current && m.version <= target)
    .sort((a, b) => a.version - b.version)

  const apply = raw.transaction((list: Migration[]) => {
    for (const m of list) m.up(raw)
  })
  apply(pending)
  setSchemaVersion(raw, target)
}
