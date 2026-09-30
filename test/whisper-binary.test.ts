import { describe, expect, it, vi } from 'vitest'
import { BINARY_ASSETS } from '../src/main/services/whisperBinary'

// A `latest` do whisper.cpp ja ficou sem assets publicados (v1.9.4 sai com
// zero arquivos), e `.../latest/download/<asset>` passou a devolver 404 no
// botao "Baixar o programa". As URLs sao fixadas numa release com binarios,
// entao este teste impede que alguem volte para o atalho quebrado.
vi.mock('electron', () => ({
  app: { getPath: (): string => '/tmp/livreanalise-test' }
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
})
