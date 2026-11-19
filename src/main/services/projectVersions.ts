import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { basename, join } from 'path'
import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { APP_VERSION } from '@shared/version'
import type { ProjectVersion, ProjectVersionKind } from '@shared/projectVersions'
import { getActivePath, getRaw } from '../db'
import { CURRENT_SCHEMA_VERSION } from '../db/migrations'
import { sanitizeProjectFileName } from './projectPath'
import { writeAtomicFile } from './atomicFile'

const MANIFEST = 'manifest.json'
export const MAX_AUTO_VERSIONS = 10

export function projectSchemaVersion(path: string): number {
  const raw = new Database(path, { readonly: true })
  try {
    return raw.pragma('user_version', { simple: true }) as number
  } finally {
    raw.close()
  }
}

// A API de backup inclui os dados confirmados no WAL em um único .liva.
export async function snapshotBeforeMigration(source: string, projectPath = source): Promise<ProjectVersion | null> {
  const schema = projectSchemaVersion(source)
  if (schema >= CURRENT_SCHEMA_VERSION) return null
  readManifest(projectPath)
  const dir = versionsDir(projectPath)
  mkdirSync(dir, { recursive: true })
  const when = new Date()
  const file = fileNameFor('premigracao', 'antes de migrar', when)
  const dest = join(dir, file)
  const tmp = join(dir, `.tmp-${uuid()}.liva`)
  const raw = new Database(source, { readonly: true })
  try {
    await raw.backup(tmp)
    const copy = new Database(tmp, { readonly: true })
    try {
      if (copy.pragma('quick_check', { simple: true }) !== 'ok' ||
          copy.pragma('user_version', { simple: true }) !== schema) {
        throw new Error('Falha ao verificar a cópia pré-migração.')
      }
    } finally {
      copy.close()
    }
    const entry: ProjectVersion = {
      id: uuid(), file, createdAt: when.toISOString(), kind: 'premigracao',
      label: 'antes de migrar', appVersion: APP_VERSION, schemaVersion: schema,
      projectName: basename(projectPath).replace(/\.liva$/i, ''), sizeBytes: statSync(tmp).size
    }
    const entries = readManifest(projectPath)
    renameSync(tmp, dest)
    try {
      writeManifest(projectPath, [...entries, entry])
    } catch (error) {
      rmSync(dest, { force: true })
      throw error
    }
    return entry
  } finally {
    raw.close()
    for (const suffix of ['', '-wal', '-shm']) rmSync(tmp + suffix, { force: true })
  }
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
    if (!Array.isArray(parsed) || parsed.some((entry) =>
      !entry || typeof entry.id !== 'string' || typeof entry.file !== 'string' ||
      /[/\\]/.test(entry.file) || !entry.file.endsWith('.liva')
    )) throw new Error('Formato de manifesto inválido')
    return parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw new Error('O catálogo de versões está ilegível. As cópias foram preservadas; não será sobrescrito automaticamente.', { cause: error })
  }
}

function writeManifest(projectPath: string, entries: ProjectVersion[]): void {
  mkdirSync(versionsDir(projectPath), { recursive: true })
  writeAtomicFile(manifestPath(projectPath), JSON.stringify(entries, null, 2))
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
  if (getActivePath() !== projectPath) throw new Error('O projeto mudou antes de criar a versão.')
  const raw = getRaw()
  const projectName = currentProjectName()
  const kind = opts?.kind ?? 'manual'
  const label = opts?.label ?? null
  readManifest(projectPath)
  const dir = versionsDir(projectPath)
  mkdirSync(dir, { recursive: true })
  const when = new Date()
  const file = fileNameFor(kind, label, when)
  const dest = join(dir, file)
  // Backup em tmp + rename evita manifesto apontando para arquivo parcial.
  // O tmp fica no MESMO diretório: rename(2) entre filesystems lança EXDEV.
  const tmp = join(dir, `.tmp-${uuid()}.liva`)
  let entry: ProjectVersion
  try {
    await raw.backup(tmp)
    entry = {
      id: uuid(),
      file,
      createdAt: when.toISOString(),
      kind,
      label,
      appVersion: APP_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      projectName,
      sizeBytes: statSync(tmp).size
    }
    const entries = readManifest(projectPath)
    renameSync(tmp, dest)
    try {
      writeManifest(projectPath, [...entries, entry])
    } catch (error) {
      rmSync(dest, { force: true })
      throw error
    }
  } finally {
    rmSync(tmp, { force: true })
  }
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
