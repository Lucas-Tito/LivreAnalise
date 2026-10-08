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
 *
 * - Nada é escrito antes das checagens: um banco de um app mais novo é recusado
 *   com o arquivo intacto.
 * - Banco legado (sem carimbo) conta como versão 1 e passa pelo mesmo pipeline
 *   dos demais, em vez de ser carimbado direto no alvo.
 * - As migrações pendentes e o carimbo da versão vão na MESMA transação: se
 *   qualquer uma falhar, nada é aplicado e a versão não muda.
 */
export function migrateDatabase(raw: Database.Database, options?: MigrateOptions): void {
  const migrations = options?.migrations ?? MIGRATIONS
  const target = options?.targetVersion ?? CURRENT_SCHEMA_VERSION

  // Nada e escrito no arquivo antes das checagens. O `exec(SCHEMA_DDL)` ficava
  // antes delas, entao a recusa que promete "nao corromper" ja tinha escrito:
  // num projeto de um app mais novo, onde uma tabela tivesse sido renomeada, o
  // `CREATE TABLE IF NOT EXISTS` recriava a antiga, vazia, antes do erro.
  const seen = new Set<number>()
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(`Migração duplicada para a versão ${m.version}`)
    }
    seen.add(m.version)
  }

  const stamped = getSchemaVersion(raw)
  if (stamped > target) {
    throw new Error(
      `O projeto foi criado por uma versão mais nova do aplicativo (schema ${stamped}, esperado ${target}). Atualize o LivreAnalise para abri-lo.`
    )
  }

  raw.exec(SCHEMA_DDL)

  // Banco legado nao tem carimbo (0) e corresponde a versao 1. Tratar como 1,
  // em vez de carimbar direto no alvo, faz ele passar pelo mesmo pipeline de
  // todo mundo: carimbar e pular as migracoes so funciona enquanto cada uma
  // for um CREATE espelhado no DDL, acoplamento que nada no codigo garante --
  // o primeiro ALTER TABLE deixaria o projeto MAIS ANTIGO sem a coluna nova.
  const current = stamped === 0 ? 1 : stamped

  const pending = migrations
    .filter((m) => m.version > current && m.version <= target)
    .sort((a, b) => a.version - b.version)

  // O carimbo entra na MESMA transacao das migracoes. Fora dela havia uma
  // janela entre o commit e o carimbo: queda de energia ali fazia tudo rodar de
  // novo na abertura seguinte. Hoje e inofensivo (a unica migracao e um CREATE
  // IF NOT EXISTS), mas a primeira que tiver INSERT ou UPDATE duplicaria dado.
  // `PRAGMA user_version` e transacional: volta no rollback junto com o resto.
  const apply = raw.transaction((list: Migration[]) => {
    for (const m of list) m.up(raw)
    setSchemaVersion(raw, target)
  })
  apply(pending)
}
