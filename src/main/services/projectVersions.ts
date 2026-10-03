import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import { APP_VERSION } from '@shared/version'
import type { ProjectVersion, ProjectVersionKind } from '@shared/projectVersions'
import { getRaw } from '../db'
import { CURRENT_SCHEMA_VERSION } from '../db/migrations'
import { sanitizeProjectFileName } from './projectPath'

const MANIFEST = 'manifest.json'
export const MAX_AUTO_VERSIONS = 10

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
  return `${stamp}-${kind}${safe}.liva`
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
  const tmp = join(tmpdir(), `liva-version-${uuid()}.liva`)
  await getRaw().backup(tmp)
  renameSync(tmp, dest)
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
  const autos = entries.filter((e) => e.kind === 'auto').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const drop = new Set(autos.slice(MAX_AUTO_VERSIONS).map((e) => e.id))
  if (drop.size === 0) return entries
  const kept = entries.filter((e) => !drop.has(e.id))
  for (const e of entries) {
    if (drop.has(e.id)) rmSync(join(versionsDir(projectPath), e.file), { force: true })
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
}
