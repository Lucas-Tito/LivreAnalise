import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { BINARY_ASSETS, downloadWhisperBinary, resolveWhisperBinary } from '../src/main/services/whisperBinary'
import { WHISPER_MODELS, modelUrl } from '../src/main/services/whisperModels'

// A `latest` do whisper.cpp ja ficou sem assets publicados (v1.9.4 sai com
// zero arquivos), e `.../latest/download/<asset>` passou a devolver 404 no
// botao "Baixar o programa". As URLs sao fixadas numa release com binarios,
// entao este teste impede que alguem volte para o atalho quebrado.
const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => state.dir }
}))

describe('whisper binary assets', () => {
  it('never points at releases/latest/download', () => {
    const urls = Object.values(BINARY_ASSETS).map((asset) => asset.url)
    for (const url of urls) {
      expect(url).not.toContain('latest/download')
      expect(url).toMatch(
        /^https:\/\/github\.com\/ggml-org\/whisper\.cpp\/releases\/download\/[^/]+\//
      )
    }
  })

  it('covers the platforms with a published binary', () => {
    expect(BINARY_ASSETS['linux-x64']?.archive).toBe('tar.gz')
    expect(BINARY_ASSETS['linux-arm64']?.archive).toBe('tar.gz')
    expect(BINARY_ASSETS['win32-x64']?.archive).toBe('zip')
  })

  it('pins every executable and model to a content digest and immutable release', () => {
    for (const asset of Object.values(BINARY_ASSETS)) expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/)
    for (const model of WHISPER_MODELS) {
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(modelUrl(model)).toMatch(/\/resolve\/[0-9a-f]{40}\//)
    }
  })
})

it.skipIf(!BINARY_ASSETS[`${process.platform}-${process.arch}`])('reuses the 0.7.0 installation without extracting or downloading again', async () => {
  state.dir = mkdtempSync(join(tmpdir(), 'liva-legacy-whisper-'))
  try {
    const executable = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
    const legacy = join(state.dir, 'whisper', 'whisper-release', 'bin', executable)
    const staged = join(state.dir, 'whisper', '.install-interrupted', executable)
    for (const path of [legacy, staged]) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, 'fixture', { mode: 0o755 })
    }
    expect(resolveWhisperBinary()).toBe(legacy)
    await expect(downloadWhisperBinary(vi.fn(), new AbortController().signal)).resolves.toBe(legacy)
  } finally {
    rmSync(state.dir, { recursive: true, force: true })
  }
})
