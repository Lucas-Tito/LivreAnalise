import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { APP_VERSION } from '@shared/version'
import type { ProjectVersion, ProjectVersionKind } from '@shared/projectVersions'
import { getRaw } from '../db'
import { CURRENT_SCHEMA_VERSION } from '../db/migrations'
import { sanitizeProjectFileName } from './projectPath'

const MANIFEST = 'manifest.json'
export const MAX_AUTO_VERSIONS = 10

/**
 * Copia o `.liva` ANTES de abrir, quando ele ainda vai ser migrado.
 *
 * O checkpoint automatico da abertura roda depois do openDatabase, ou seja
 * depois da migracao: o snapshot mais antigo de qualquer projeto ja era o
 * estado migrado, e nao existia copia pre-migracao em lugar nenhum. A rede de
 * protecao nao cobria justamente a operacao mais arriscada do app.
 *
 * Aqui o banco ainda nao esta aberto -- sem conexao e sem WAL ativo, copiar o
 * arquivo e seguro, e e o unico momento em que e. Devolve a versao registrada,
 * ou null quando nao havia nada a fazer.
 */
export function snapshotBeforeMigration(projectPath: string): ProjectVersion | null {
  if (!existsSync(projectPath)) return null
  let schema = 0
  try {
    const raw = new Database(projectPath, { readonly: true })
    schema = (raw.pragma('user_version') as Array<{ user_version: number }>)[0].user_version
    raw.close()
  } catch {
    // Pode ser arquivo ilegivel, mas tambem um `-wal` pendente: recuperar WAL
    // exige lock de escrita, que o readonly nao tem. Nos dois casos copiamos
    // por precaucao, em vez de seguir para a migracao sem rede nenhuma.
    schema = -1
  }
  // -1 = nao foi possivel ler a versao; copia do mesmo jeito
  if (schema >= CURRENT_SCHEMA_VERSION) return null
  const dir = versionsDir(projectPath)
  mkdirSync(dir, { recursive: true })
  const when = new Date()
  const file = fileNameFor('premigracao', 'antes de migrar', when)
  const dest = join(dir, file)
  // Os sidecars vao junto. Copiar so o arquivo principal perdia o que estivesse
  // num `-wal` sobrado de uma queda anterior: a copia "antes de migrar" sairia
  // mais ANTIGA que o projeto, e quem restaurasse perderia o trabalho que
  // estava no WAL.
  copyFileSync(projectPath, dest)
  for (const sufixo of ['-wal', '-shm']) {
    if (existsSync(`${projectPath}${sufixo}`)) {
      copyFileSync(`${projectPath}${sufixo}`, `${dest}${sufixo}`)
    }
  }
  const entry: ProjectVersion = {
    id: uuid(),
    file,
    createdAt: when.toISOString(),
    kind: 'premigracao',
    label: 'antes de migrar',
    appVersion: APP_VERSION,
    schemaVersion: schema,
    projectName: basename(projectPath).replace(/\.liva$/i, ''),
    sizeBytes: statSync(dest).size
  }
  writeManifest(projectPath, [...readManifest(projectPath), entry])
  pruneVersions(projectPath)
  return entry
}

/** Apaga um checkpoint pelo id, arquivo e entrada do manifesto. */
export function deleteVersion(projectPath: string, id: string): boolean {
  const entries = readManifest(projectPath)
  const alvo = entries.find((e) => e.id === id)
  if (!alvo) return false
  const base = join(versionsDir(projectPath), alvo.file)
  rmSync(base, { force: true })
  for (const sufixo of ['-wal', '-shm']) rmSync(`${base}${sufixo}`, { force: true })
  writeManifest(projectPath, entries.filter((e) => e.id !== id))
  return true
}

export function versionsDir(projectPath: string): string {
  return `${projectPath}-versoes`
}

function manifestPath(projectPath: string): string {
  return join(versionsDir(projectPath), MANIFEST)
}

export function readManifest(projectPath: string): ProjectVersion[] {
  try {
    const raw = readFileSync(manifestPath(projectPath), 'utf-8')
    const parsed = JSON.parse(raw) as ProjectVersion[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeManifest(projectPath: string, entries: ProjectVersion[]): void {
  mkdirSync(versionsDir(projectPath), { recursive: true })
  writeFileSync(manifestPath(projectPath), JSON.stringify(entries, null, 2), 'utf-8')
}

function currentProjectName(): string {
  try {
    const row = getRaw().prepare('SELECT name FROM project_meta WHERE id = 1').get() as { name: string } | undefined
    return row?.name ?? 'projeto'
  } catch {
    return 'projeto'
  }
}

function fileNameFor(kind: ProjectVersionKind, label: string | null, when: Date): string {
  const stamp = when.toISOString().replace(/[:.]/g, '-')
  const safe = label ? `-${sanitizeProjectFileName(label).replace(/\s+/g, '-').slice(0, 40)}` : ''
  // Sufixo único: dois snapshots no mesmo ms nunca colidem no nome.
  return `${stamp}-${kind}${safe}-${uuid().slice(0, 8)}.liva`
}

// Snapshot consistente via API de backup do SQLite (WAL-safe, sem fechar).
// Nunca copiar o .liva aberto direto: o WAL pode ter dados fora do principal.
export async function createVersionSnapshot(
  projectPath: string,
  opts?: { kind?: ProjectVersionKind; label?: string | null }
): Promise<ProjectVersion> {
  const kind = opts?.kind ?? 'manual'
  const label = opts?.label ?? null
  const dir = versionsDir(projectPath)
  mkdirSync(dir, { recursive: true })
  const when = new Date()
  const file = fileNameFor(kind, label, when)
  const dest = join(dir, file)
  // Backup em tmp + rename evita manifesto apontando para arquivo parcial.
  // O tmp fica no MESMO diretório: rename(2) entre filesystems lança EXDEV.
  const tmp = join(dir, `.tmp-${uuid()}.liva`)
  try {
    await getRaw().backup(tmp)
    renameSync(tmp, dest)
  } catch (err) {
    rmSync(tmp, { force: true })
    throw err
  }
  const entry: ProjectVersion = {
    id: uuid(),
    file,
    createdAt: when.toISOString(),
    kind,
    label,
    appVersion: APP_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectName: currentProjectName(),
    sizeBytes: statSync(dest).size
  }
  const entries = [...readManifest(projectPath), entry]
  writeManifest(projectPath, entries)
  pruneVersions(projectPath)
  return entry
}

export function pruneVersions(projectPath: string): ProjectVersion[] {
  const entries = readManifest(projectPath)
  const autos = entries
    .filter((e) => e.kind === 'auto')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.file.localeCompare(a.file))
  const drop = new Set(autos.slice(MAX_AUTO_VERSIONS).map((e) => e.id))
  if (drop.size === 0) return entries
  const kept = entries.filter((e) => !drop.has(e.id))
  for (const e of entries) {
    if (drop.has(e.id)) {
      const base = join(versionsDir(projectPath), e.file)
      rmSync(base, { force: true })
      for (const sufixo of ['-wal', '-shm']) rmSync(`${base}${sufixo}`, { force: true })
    }
  }
  writeManifest(projectPath, kept)
  return kept
}

export function resolveVersionFile(projectPath: string, id: string): string | null {
  const entry = readManifest(projectPath).find((e) => e.id === id)
  if (!entry) return null
  const full = join(versionsDir(projectPath), entry.file)
  return existsSync(full) ? full : null
}

// Renomeia a pasta-irmã quando o projeto está fechado (mesma regra do .liva).
export function renameVersionsDir(oldPath: string, newPath: string): void {
  const from = versionsDir(oldPath)
  if (!existsSync(from)) return
  try {
    renameSync(from, versionsDir(newPath))
  } catch {
    // melhor esforço: versões órfãs não quebram o projeto
  }
}

export function copyVersionTo(sourceFile: string, destPath: string): void {
  copyFileSync(sourceFile, destPath)
  // A copia pre-migracao pode ter `-wal`/`-shm` junto: sem eles o projeto
  // restaurado abriria sem o que estava pendente no WAL, ou seja mais antigo
  // que a propria copia.
  for (const sufixo of ['-wal', '-shm']) {
    if (existsSync(`${sourceFile}${sufixo}`)) {
      copyFileSync(`${sourceFile}${sufixo}`, `${destPath}${sufixo}`)
    } else {
      // sidecar velho do destino mentiria sobre o conteudo recem-copiado
      rmSync(`${destPath}${sufixo}`, { force: true })
    }
  }
}
