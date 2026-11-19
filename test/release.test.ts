import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { github, installers, publish, rehearsal } from '../scripts/release.mjs'

it('confere a matriz, calcula os hashes e ensaia a retomada sem repetir uploads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'liva-release-'))
  try {
    const matrix = { linux: ['.AppImage', '.deb'], windows: ['-setup.exe'], 'mac-arm64': ['-arm64.dmg'], 'mac-x64': ['-x64.dmg'] }
    for (const [os, suffixes] of Object.entries(matrix)) {
      const dir = join(root, 'livreanalise-' + os)
      await mkdir(dir)
      for (const suffix of suffixes) await writeFile(join(dir, 'LivreAnalise-1.2.3' + suffix), 'abc')
    }
    const files = await installers(root, '1.2.3')
    expect(files).toHaveLength(5)
    expect(files[0].digest).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    rehearsal(files)
    await rm(files[0].path)
    await expect(installers(root, '1.2.3')).rejects.toThrow('Instaladores incorretos')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const file = { name: 'linux.deb', size: 3, digest: 'sha256:abc' }
it.each([true, false])('bloqueia alterações se o conteúdo divergir (draft=%s)', (draft) => {
  const client = {
    read: () => ({ draft, assets: [{ ...file, digest: 'sha256:def', state: 'uploaded' }] }),
    upload: vi.fn(), finalize: vi.fn()
  }
  expect(() => publish(client, [file])).toThrow('divergente')
  expect(client.upload).not.toHaveBeenCalled()
  expect(client.finalize).not.toHaveBeenCalled()
})

it('recupera um upload interrompido no rascunho', () => {
  const release = { id: 1, draft: true, assets: [{ ...file, id: 2, state: 'starter' }] }
  const client = {
    read: () => release,
    removePlaceholder: vi.fn(() => { release.assets = [] }),
    upload: vi.fn(() => { release.assets.push({ ...file, id: 3, state: 'uploaded' }) }),
    finalize: vi.fn()
  }
  publish(client, [file])
  expect(client.removePlaceholder).toHaveBeenCalledWith(2)
  expect(client.finalize).toHaveBeenCalledWith(1)
})

it('recusa release pública incompleta sem alterar os arquivos', () => {
  const client = { read: () => ({ draft: false, assets: [] }), upload: vi.fn() }
  expect(() => publish(client, [file])).toThrow('ausentes')
  expect(client.upload).not.toHaveBeenCalled()
})

it('publishes a resumed older release without replacing the latest download', () => {
  const sha = 'a'.repeat(40)
  const older = { id: 1, tag_name: 'v0.7.1', draft: true, target_commitish: sha }
  const newer = { id: 2, tag_name: 'v0.10.0', draft: true, target_commitish: sha }
  const drafts = [older, newer]
  const assets = new Map([[1, [] as object[]], [2, [{ ...file, state: 'uploaded' }]]])
  let latest: number | null = null
  let uploadFails = true
  const exec = vi.fn((command: string, args: string[]) => {
    if (command === 'git') return ''
    if (args[1] === '--paginate') {
      const match = /\/(\d+)\/assets/.exec(args[3])
      return JSON.stringify([match ? assets.get(Number(match[1])) : drafts])
    }
    if (args[1] === 'upload') {
      if (uploadFails) throw new Error('upload interrompido')
      assets.get(1)!.push({ ...file, state: 'uploaded' })
      return ''
    }
    const release = drafts.find((draft) => args[3].endsWith('/' + draft.id))!
    release.draft = false
    if (args.includes('make_latest=true')) latest = release.id
    else expect(args).toContain('make_latest=false')
    return ''
  })
  const artifact = { ...file, path: file.name }
  const olderClient = github(older.tag_name, sha, exec)
  expect(() => publish(olderClient, [artifact])).toThrow('upload interrompido')
  publish(github(newer.tag_name, sha, exec), [artifact])
  expect(latest).toBe(newer.id)
  uploadFails = false
  publish(olderClient, [artifact])
  expect(older.draft).toBe(false)
  expect(latest).toBe(newer.id)
})
