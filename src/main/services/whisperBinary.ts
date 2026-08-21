import { spawnSync } from 'child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import JSZip from 'jszip'
import { downloadModel, type DownloadProgress } from './whisperModels'

// Releases do whisper.cpp trazem binario pronto para Linux e Windows. Para
// macOS nao existe asset de CLI publicado: nesses casos o usuario informa o
// caminho (por exemplo o `whisper-cli` do `brew install whisper-cpp`).
interface BinaryAsset {
  url: string
  archive: 'tar.gz' | 'zip'
}

const RELEASE = 'https://github.com/ggml-org/whisper.cpp/releases/latest/download'

const ASSETS: Record<string, BinaryAsset> = {
  'linux-x64': { url: `${RELEASE}/whisper-bin-ubuntu-x64.tar.gz`, archive: 'tar.gz' },
  'linux-arm64': { url: `${RELEASE}/whisper-bin-ubuntu-arm64.tar.gz`, archive: 'tar.gz' },
  'win32-x64': { url: `${RELEASE}/whisper-bin-x64.zip`, archive: 'zip' }
}

const EXECUTABLES = ['whisper-cli', 'whisper-cli.exe', 'main', 'main.exe']

export function binaryDir(): string {
  return join(app.getPath('userData'), 'whisper')
}

export function assetForPlatform(): BinaryAsset | null {
  return ASSETS[`${process.platform}-${process.arch}`] ?? null
}

function findExecutable(root: string): string | null {
  if (!existsSync(root)) return null
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (EXECUTABLES.includes(entry.name)) return full
    }
  }
  return null
}

// Ordem de resolucao: o caminho que o usuario informou, o binario embutido no
// pacote (quando o CI passar a compilar), o que ja foi baixado, e por fim o
// que estiver no PATH do sistema.
export function resolveWhisperBinary(configuredPath?: string | null): string | null {
  if (configuredPath && existsSync(configuredPath)) return configuredPath

  const bundled = join(process.resourcesPath ?? '', 'whisper')
  const fromBundle = findExecutable(bundled)
  if (fromBundle) return fromBundle

  const downloaded = findExecutable(binaryDir())
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

async function extract(archivePath: string, kind: BinaryAsset['archive'], dest: string): Promise<void> {
  mkdirSync(dest, { recursive: true })
  if (kind === 'tar.gz') {
    // tar existe no Linux e no macOS; evita dependencia nova so para isso
    const res = spawnSync('tar', ['-xzf', archivePath, '-C', dest], { encoding: 'utf-8' })
    if (res.status !== 0) throw new Error(`Falha ao extrair o binario: ${res.stderr}`)
    return
  }
  const zip = await JSZip.loadAsync(await readFile(archivePath))
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const target = join(dest, name)
    mkdirSync(join(target, '..'), { recursive: true })
    await writeFile(target, await entry.async('nodebuffer'))
  }
}

export async function downloadWhisperBinary(
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<string> {
  const asset = assetForPlatform()
  if (!asset) {
    throw new Error(
      'Nao ha binario pronto do whisper.cpp para este sistema. Instale o whisper-cli e informe o caminho em Avancado.'
    )
  }
  const dir = binaryDir()
  const archive = join(dir, `whisper.${asset.archive}`)
  await downloadModel(asset.url, archive, onProgress, signal)
  await extract(archive, asset.archive, dir)

  const executable = findExecutable(dir)
  if (!executable) throw new Error('O arquivo baixado nao contem o executavel do whisper')
  if (process.platform !== 'win32') chmodSync(executable, 0o755)
  return executable
}

export function modelsDir(): string {
  return join(app.getPath('userData'), 'models')
}

export function modelPath(file: string): string {
  return join(modelsDir(), file)
}

export function modelIsReady(file: string): boolean {
  const path = modelPath(file)
  return existsSync(path) && statSync(path).size > 0
}
