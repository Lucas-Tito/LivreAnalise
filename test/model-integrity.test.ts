import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as download from '../src/main/services/download'
import { modelIsDownloaded, modelIsReady, modelPath } from '../src/main/services/whisperBinary'

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir } }))
vi.mock('../src/main/services/whisperModels', () => ({
  downloadModel: vi.fn(),
  WHISPER_MODELS: [{ file: 'test.bin', sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' }]
}))
beforeEach(() => { state.dir = mkdtempSync(join(tmpdir(), 'liva-model-')); mkdirSync(join(state.dir, 'models')) })
afterEach(() => rmSync(state.dir, { recursive: true, force: true }))

it('does not consider an old same-size corrupt model ready', async () => {
  const path = modelPath('test.bin')
  writeFileSync(path, 'xyz')
  expect(await modelIsReady('test.bin')).toBe(false)
  writeFileSync(path, 'abc')
  const date = new Date(Date.now() + 1000)
  utimesSync(path, date, date)
  expect(await modelIsReady('test.bin')).toBe(true)
})

it('invalidates a successful verification when the cached file changes', async () => {
  const path = modelPath('test.bin')
  writeFileSync(path, 'abc')
  expect(await modelIsReady('test.bin')).toBe(true)
  writeFileSync(path, 'xyz')
  const date = new Date(Date.now() + 2000)
  utimesSync(path, date, date)
  expect(await modelIsReady('test.bin')).toBe(false)
})

it('lists local models without reading the file and deduplicates verification', async () => {
  writeFileSync(modelPath('test.bin'), 'abc')
  const hash = vi.spyOn(download, 'hashFile')
  try {
    expect(modelIsDownloaded('test.bin')).toBe(true)
    expect(hash).not.toHaveBeenCalled()
    const cancel = new AbortController()
    const first = modelIsReady('test.bin', cancel.signal)
    const second = modelIsReady('test.bin')
    cancel.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).resolves.toBe(true)
    expect(hash).toHaveBeenCalledTimes(1)
  } finally {
    hash.mockRestore()
  }
})
