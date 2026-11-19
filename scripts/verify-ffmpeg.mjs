import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export function executableArchitecture(buffer) {
  if (buffer.length < 20) throw new Error('Executável incompleto')
  if (buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    const machine = buffer[5] === 1 ? buffer.readUInt16LE(18) : buffer.readUInt16BE(18)
    return machine === 62 ? 'x64' : machine === 183 ? 'arm64' : 'unknown'
  }
  const magic = buffer.readUInt32LE(0)
  if (magic === 0xfeedfacf || magic === 0xcffaedfe) {
    const cpu = magic === 0xfeedfacf ? buffer.readUInt32LE(4) : buffer.readUInt32BE(4)
    return cpu === 0x01000007 ? 'x64' : cpu === 0x0100000c ? 'arm64' : 'unknown'
  }
  if (buffer.length >= 64 && buffer.toString('ascii', 0, 2) === 'MZ') {
    const offset = buffer.readUInt32LE(60)
    if (offset + 6 <= buffer.length && buffer.readUInt32LE(offset) === 0x00004550) {
      const machine = buffer.readUInt16LE(offset + 4)
      return machine === 0x8664 ? 'x64' : machine === 0xaa64 ? 'arm64' : 'unknown'
    }
  }
  throw new Error('Formato de executável desconhecido')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2] ?? process.arch
  let executable
  if (process.argv[3] === '--packaged') {
    const candidates = readdirSync('dist', { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join('dist', entry.name, process.platform === 'darwin'
        ? 'LivreAnalise.app/Contents/Resources' : 'resources', 'app.asar.unpacked/node_modules'))
      .filter((path) => existsSync(path))
    if (candidates.length !== 1) throw new Error('Pacote descompactado ausente ou ambíguo')
    const modules = candidates[0]
    executable = join(modules, 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    const sqlite = join(modules, 'better-sqlite3/build/Release/better_sqlite3.node')
    if (executableArchitecture(readFileSync(sqlite)) !== target) throw new Error('SQLite empacotado na arquitetura incorreta')
  } else {
    const require = createRequire(import.meta.url)
    executable = require('ffmpeg-static')
  }
  if (!executable) throw new Error('ffmpeg-static não forneceu um executável')
  const actual = executableArchitecture(readFileSync(executable))
  if (actual !== target) throw new Error(`ffmpeg ${actual} não corresponde ao pacote ${target}`)
  if (target === process.arch) {
    const result = spawnSync(executable, ['-version'], { timeout: 15000, encoding: 'utf8' })
    if (result.status !== 0) throw new Error(`ffmpeg não executa: ${result.error?.message ?? result.stderr}`)
  }
  console.log(`ffmpeg verificado: ${actual}`)
}
