import { spawnSync } from 'child_process'
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join, relative } from 'path'
import { app } from 'electron'
import JSZip from 'jszip'
import { downloadModel, WHISPER_MODELS, type DownloadProgress } from './whisperModels'
import { runProcess } from './process'
import { hashFile } from './download'

// Releases do whisper.cpp trazem binario pronto para Linux e Windows. Para
// macOS nao existe asset de CLI publicado: nesses casos o usuario informa o
// caminho (por exemplo o `whisper-cli` do `brew install whisper-cpp`).
//
// A URL e fixada numa release com assets publicados (v1.9.2): a `latest`
// atual (v1.9.4) nao publica binario nenhum, entao `latest/download` devolve
// 404 e o botao "Baixar o programa" quebra. Revisitar quando o upstream
// voltar a anexar os zips/tarballs na latest.
interface BinaryAsset {
  url: string
  archive: 'tar.gz' | 'zip'
  sha256: string
}

const RELEASE = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2'

export const BINARY_ASSETS: Record<string, BinaryAsset> = {
  'linux-x64': { url: `${RELEASE}/whisper-bin-ubuntu-x64.tar.gz`, archive: 'tar.gz', sha256: '46811a3ecf584307480a220b9ef5ff81b7b22dc41577cbc274ce3afc61f753b1' },
  'linux-arm64': { url: `${RELEASE}/whisper-bin-ubuntu-arm64.tar.gz`, archive: 'tar.gz', sha256: '7e26fa6a36d9174d5c0bf033ccbc026c3b5e569e2ee787058241346ef5392719' },
  'win32-x64': { url: `${RELEASE}/whisper-bin-x64.zip`, archive: 'zip', sha256: '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a' }
}

// Ordem de preferencia, nao ordem do diretorio: nos releases atuais o `main`
// e apenas um stub que imprime aviso de depreciacao e sai com erro.
const EXECUTABLES = ['whisper-cli', 'whisper-cli.exe', 'main', 'main.exe']

export function binaryDir(): string {
  return join(app.getPath('userData'), 'whisper')
}

export function assetForPlatform(): BinaryAsset | null {
  return BINARY_ASSETS[`${process.platform}-${process.arch}`] ?? null
}

function findExecutable(root: string, skip = new Set<string>(), requireAccess = true): string | null {
  if (!existsSync(root) || !statSync(root).isDirectory()) return null
  const found = new Map<string, string>()
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (skip.has(full) || entry.name.startsWith('.install-')) continue
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && EXECUTABLES.includes(entry.name) && !found.has(entry.name)) {
        try {
          if (statSync(full).size === 0) continue
          if (requireAccess) accessSync(full, process.platform === 'win32' ? constants.R_OK : constants.X_OK)
          found.set(entry.name, full)
        } catch {
          // Uma extração antiga pode ter sido interrompida antes do chmod.
        }
      }
    }
  }
  for (const name of EXECUTABLES) {
    const path = found.get(name)
    if (path) return path
  }
  return null
}

function findDownloadedBinary(): string | null {
  const legacyDir = binaryDir()
  const installed = join(legacyDir, 'installed')
  // A 0.7.0 extraía no próprio diretório whisper. Use a instalação no lugar
  // para manter as bibliotecas ao lado do executável e permitir voltar à 0.7.0.
  return findExecutable(installed) ?? findExecutable(legacyDir, new Set([installed]))
}

// Ordem de resolucao: o caminho que o usuario informou, o binario embutido no
// pacote (quando o CI passar a compilar), o que ja foi baixado, e por fim o
// que estiver no PATH do sistema.
export function resolveWhisperBinary(configuredPath?: string | null): string | null {
  if (configuredPath) {
    try {
      if (!statSync(configuredPath).isFile()) return null
      accessSync(configuredPath, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
      return configuredPath
    } catch { return null }
  }

  const bundled = join(process.resourcesPath ?? '', 'whisper')
  const fromBundle = findExecutable(bundled)
  if (fromBundle) return fromBundle

  const downloaded = findDownloadedBinary()
  if (downloaded) return downloaded

  for (const name of ['whisper-cli', 'whisper']) {
    const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
      encoding: 'utf-8'
    })
    if (which.status === 0) {
      const found = which.stdout.split(/\r?\n/)[0].trim()
      if (found && existsSync(found)) return found
    }
  }
  return null
}

async function extract(archivePath: string, kind: BinaryAsset['archive'], dest: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  mkdirSync(dest, { recursive: true })
  if (kind === 'tar.gz') {
    // tar existe no Linux e no macOS; evita dependencia nova so para isso
    const res = await runProcess('tar', ['-xzf', archivePath, '-C', dest], { signal })
    if (res.code !== 0) throw new Error(`Falha ao extrair o binario: ${res.stderr}`)
    return
  }
  const zip = await JSZip.loadAsync(await readFile(archivePath))
  for (const [name, entry] of Object.entries(zip.files)) {
    signal.throwIfAborted()
    if (entry.dir) continue
    const target = join(dest, name)
    mkdirSync(join(target, '..'), { recursive: true })
    const buffer = await entry.async('nodebuffer')
    signal.throwIfAborted()
    await writeFile(target, buffer)
  }
}

export async function downloadWhisperBinary(
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<string> {
  const asset = assetForPlatform()
  if (!asset) {
    throw new Error(
      'Não há binário pronto do whisper.cpp para este sistema. Instale o whisper-cli e informe o caminho em Avançado.'
    )
  }
  const dir = binaryDir()
  const installed = join(dir, 'installed')
  const existing = findDownloadedBinary()
  if (existing) return existing
  mkdirSync(dir, { recursive: true })
  const archive = join(dir, `whisper.${asset.archive}`)
  await downloadModel(asset.url, archive, onProgress, signal, asset.sha256)
  const staging = mkdtempSync(join(dir, '.install-'))
  try {
    await extract(archive, asset.archive, staging, signal)
    signal.throwIfAborted()
    const executable = findExecutable(staging, undefined, false)
    if (!executable) throw new Error('O arquivo baixado não contém o executável do whisper')
    if (process.platform !== 'win32') chmodSync(executable, 0o755)
    accessSync(executable, process.platform === 'win32' ? constants.R_OK : constants.X_OK)
    // Outro download pode ter concluído durante a extração.
    const ready = findDownloadedBinary()
    if (ready) return ready
    rmSync(installed, { recursive: true, force: true })
    renameSync(staging, installed)
    return join(installed, relative(staging, executable))
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export function modelsDir(): string {
  return join(app.getPath('userData'), 'models')
}

export function modelPath(file: string): string {
  return join(modelsDir(), file)
}

function modelFingerprint(path: string): string | null {
  try {
    const info = statSync(path)
    if (!info.isFile() || info.size === 0) return null
    return JSON.stringify([info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs])
  } catch {
    return null
  }
}

const verifiedModels = new Map<string, { fingerprint: string; sha256: string }>()
const verifyingModels = new Map<string, {
  controller: AbortController
  result: Promise<boolean>
  users: number
}>()

// A listagem consulta só metadados. Um arquivo sem hash em cache é tratado
// como baixado, e a transcrição verifica o conteúdo antes de usá-lo.
export function modelIsDownloaded(file: string): boolean {
  const path = modelPath(file)
  const fingerprint = modelFingerprint(path)
  const expected = WHISPER_MODELS.find((model) => model.file === file)?.sha256
  if (!fingerprint || !expected) return false
  const cached = verifiedModels.get(path)
  return cached?.fingerprint !== fingerprint || cached.sha256 === expected
}

export async function modelIsReady(file: string, signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted()
  const path = modelPath(file)
  const expected = WHISPER_MODELS.find((model) => model.file === file)?.sha256
  const fingerprint = modelFingerprint(path)
  if (!expected || !fingerprint) return false
  const cached = verifiedModels.get(path)
  if (cached?.fingerprint === fingerprint) return cached.sha256 === expected

  const key = JSON.stringify([path, fingerprint, expected])
  let pending = verifyingModels.get(key)
  if (!pending || pending.controller.signal.aborted) {
    const controller = new AbortController()
    const result = hashFile(path, controller.signal).then((sha256) => {
      if (modelFingerprint(path) !== fingerprint) return false
      verifiedModels.set(path, { fingerprint, sha256 })
      return sha256 === expected
    }).catch(() => false).finally(() => {
      if (verifyingModels.get(key)?.controller === controller) verifyingModels.delete(key)
    })
    pending = { controller, result, users: 0 }
    verifyingModels.set(key, pending)
  }

  let cancel: (() => void) | undefined
  pending.users++
  try {
    if (!signal) return await pending.result
    const canceled = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(signal.reason)
      signal.addEventListener('abort', cancel, { once: true })
    })
    return await Promise.race([pending.result, canceled])
  } finally {
    if (cancel) signal?.removeEventListener('abort', cancel)
    if (--pending.users === 0 && signal?.aborted) pending.controller.abort()
  }
}
