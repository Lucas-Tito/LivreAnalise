import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { writeAtomicFile, writeUniqueTextFile } from '../src/main/services/atomicFile'

const state = vi.hoisted(() => ({ unsupported: false }))
vi.mock('fs', async (original) => {
  const fs = await original<typeof import('fs')>()
  return { ...fs, linkSync: (...args: Parameters<typeof fs.linkSync>) => {
    if (state.unsupported) throw Object.assign(new Error('unsupported'), { code: 'ENOTSUP' })
    return fs.linkSync(...args)
  } }
})

let dir: string
beforeEach(() => { state.unsupported = false; dir = mkdtempSync(join(tmpdir(), 'liva-atomic-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('never replaces an existing transcript and publishes complete contents', () => {
  const path = join(dir, 'audio_transcricao.txt')
  writeFileSync(path, 'revisado')
  const next = writeUniqueTextFile(path, 'novo')
  const third = writeUniqueTextFile(path, 'outro')
  expect(readFileSync(path, 'utf8')).toBe('revisado')
  expect(readFileSync(next, 'utf8')).toBe('novo')
  expect(readFileSync(third, 'utf8')).toBe('outro')
  expect(new Set([path, next, third]).size).toBe(3)
  expect(readdirSync(dir)).toHaveLength(3)
})

it('replaces metadata without leaving temporary files', () => {
  const path = join(dir, 'manifest.json')
  writeAtomicFile(path, 'old')
  writeAtomicFile(path, 'new')
  expect(readFileSync(path, 'utf8')).toBe('new')
  expect(readdirSync(dir)).toEqual(['manifest.json'])
})

it('preserves existing files even on filesystems without hard-link support', () => {
  state.unsupported = true
  const path = join(dir, 'transcript.txt')
  writeFileSync(path, 'preservar')
  const next = writeUniqueTextFile(path, 'novo')
  expect(readFileSync(path, 'utf8')).toBe('preservar')
  expect(readFileSync(next, 'utf8')).toBe('novo')
})

it.skipIf(process.platform === 'win32')('uses normal umask for a transcript and keeps catalogs private', () => {
  const transcript = writeUniqueTextFile(join(dir, 'transcript.txt'), 'texto')
  const catalog = join(dir, 'manifest.json')
  writeAtomicFile(catalog, '[]')
  expect(statSync(transcript).mode & 0o777).toBe(0o666 & ~process.umask())
  expect(statSync(catalog).mode & 0o777).toBe(0o600 & ~process.umask())
})
