import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

export async function installers(root, version) {
  const prefix = `LivreAnalise-${version}`
  const matrix = {
    linux: ['.AppImage', '.deb'],
    windows: ['-setup.exe'],
    'mac-arm64': ['-arm64.dmg'],
    'mac-x64': ['-x64.dmg']
  }
  const files = []
  const directories = Object.keys(matrix).map((os) => 'livreanalise-' + os)
  assert.deepEqual((await readdir(root)).sort(), directories.sort(), 'Matriz de plataformas incompleta ou inesperada')
  for (const [os, suffixes] of Object.entries(matrix)) {
    const dir = join(root, 'livreanalise-' + os)
    const expected = suffixes.map((suffix) => prefix + suffix)
    assert.deepEqual((await readdir(dir)).sort(), expected.sort(), `Instaladores incorretos em ${dir}`)
    for (const name of expected) {
      const path = join(dir, name)
      const stat = await lstat(path)
      assert.ok(stat.isFile() && stat.size > 0, `Instalador inválido: ${name}`)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(path)) hash.update(chunk)
      files.push({ name, path, size: stat.size, digest: 'sha256:' + hash.digest('hex') })
    }
  }
  return files
}

function missingFiles(release, files) {
  const pending = new Map(files.map((file) => [file.name, file]))
  for (const asset of release.assets) {
    const file = pending.get(asset.name)
    assert.ok(file, `Arquivo inesperado ou duplicado: ${asset.name}`)
    if (release.draft && asset.state === 'starter') continue
    assert.ok(asset.state === 'uploaded' && file.size === asset.size && file.digest === asset.digest,
      `Conteúdo divergente: ${asset.name}`)
    pending.delete(asset.name)
  }
  return [...pending.values()]
}

export function publish(client, files) {
  let release = client.read()
  if (!release) {
    client.createDraft()
    release = client.read()
    assert.ok(release?.draft, 'Falha ao criar rascunho')
  }
  const missing = missingFiles(release, files)
  if (!release.draft) {
    assert.equal(missing.length, 0, 'Release publicada com arquivos ausentes')
    return
  }
  for (const file of missing) {
    const placeholder = release.assets.find((asset) => asset.name === file.name)
    if (placeholder) client.removePlaceholder(placeholder.id)
    client.upload(file)
  }
  const complete = client.read()
  assert.equal(complete?.id, release.id, 'A release mudou durante o upload')
  assert.equal(missingFiles(complete, files).length, 0, 'Upload incompleto')
  if (complete.draft) client.finalize(complete.id)
}

function github(tag, sha) {
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const pages = (endpoint) => JSON.parse(gh('api', '--paginate', '--slurp', endpoint)).flat()
  const releases = 'repos/{owner}/{repo}/releases'
  return {
    read() {
      const ref = 'refs/tags/' + tag
      const refs = execFileSync('git', ['ls-remote', '--tags', 'origin', ref, ref + '^{}'], { encoding: 'utf8' })
      const targets = new Map(refs.trim().split('\n').map((line) => line.split('\t').reverse()))
      const tagCommit = targets.get(ref + '^{}') ?? targets.get(ref)
      if (tagCommit) assert.equal(tagCommit, sha, 'Tag existente aponta para outro commit')
      const matches = pages(releases + '?per_page=100').filter((release) => release.tag_name === tag)
      assert.ok(matches.length <= 1, 'Mais de uma release usa a mesma tag')
      const release = matches[0]
      if (!release) return null
      if (release.draft) assert.equal(release.target_commitish, sha, 'Rascunho pertence a outro commit')
      else assert.equal(tagCommit, sha, 'Tag da release publicada ausente ou divergente')
      release.assets = pages(`${releases}/${release.id}/assets?per_page=100`)
      return release
    },
    createDraft: () => gh('release', 'create', tag, '--draft', '--target', sha, '--generate-notes', '--title', tag),
    removePlaceholder: (id) => gh('api', '-X', 'DELETE', `${releases}/assets/${id}`),
    upload: (file) => gh('release', 'upload', tag, file.path),
    finalize: (id) => gh('api', '-X', 'PATCH', `${releases}/${id}`, '-F', 'draft=false')
  }
}

// Exercita os mesmos passos de publicação com os cinco artefatos do build.
export function rehearsal(files) {
  let release = null
  let interrupt = true
  let uploads = 0
  let publications = 0
  const client = {
    read: () => release,
    createDraft() {
      assert.equal(release, null)
      release = { id: 1, draft: true, assets: [] }
    },
    upload(file) {
      if (interrupt && uploads === 1) throw new Error('interrupção simulada')
      uploads++
      release.assets.push({ ...file, state: 'uploaded' })
    },
    finalize() { release.draft = false; publications++ }
  }
  assert.throws(() => publish(client, files), /interrupção simulada/)
  interrupt = false
  publish(client, files)
  publish(client, files)
  assert.equal(uploads, files.length)
  assert.equal(publications, 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const files = await installers('artifacts', version)
  const mode = process.argv[2]
  if (mode === 'rehearse') rehearsal(files)
  else if (mode === 'publish') {
    assert.match(process.env.GITHUB_SHA ?? '', /^[0-9a-f]{40}$/)
    publish(github('v' + version, process.env.GITHUB_SHA), files)
  } else throw new Error('Use rehearse ou publish')
  for (const file of files) console.log(file.name, file.digest)
}
