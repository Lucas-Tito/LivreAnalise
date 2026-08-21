import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

// O ffmpeg-static baixa o binario da plataforma na instalacao. Empacotado, ele
// vai para app.asar.unpacked: binario dentro do asar nao pode ser executado.
function bundledFfmpeg(): string | null {
  try {
    // require em vez de import: o caminho e resolvido em tempo de execucao
    const path = require('ffmpeg-static') as string | null
    if (!path) return null
    const unpacked = path.replace('app.asar', 'app.asar.unpacked')
    if (existsSync(unpacked)) return unpacked
    if (existsSync(path)) return path
    return null
  } catch {
    return null
  }
}

function systemFfmpeg(): string | null {
  const res = spawnSync('ffmpeg', ['-version'], { encoding: 'utf-8' })
  return res.status === 0 ? 'ffmpeg' : null
}

export function resolveFfmpeg(): string | null {
  return bundledFfmpeg() ?? systemFfmpeg()
}

const DURATION = /Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)/

// O ffmpeg-static nao traz ffprobe, mas o proprio ffmpeg escreve a duracao no
// stderr quando abre o arquivo. Sem essa duracao o progresso nao tem
// denominador e a barra vira uma roda girando.
export function parseFfmpegDuration(stderr: string): number | null {
  const match = DURATION.exec(stderr)
  if (!match) return null
  const fraction = Number(`0.${match[4]}`)
  return (
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction
  )
}

export function probeDuration(ffmpeg: string, mediaPath: string): number {
  // sem -i valido o ffmpeg sai com codigo != 0 de proposito; interessa o stderr
  const res = spawnSync(ffmpeg, ['-hide_banner', '-i', mediaPath], {
    encoding: 'utf-8'
  })
  return parseFfmpegDuration(`${res.stderr ?? ''}`) ?? 0
}

export function toWav(ffmpeg: string, mediaPath: string, wavPath: string): void {
  const res = spawnSync(
    ffmpeg,
    [
      '-y', '-hide_banner',
      '-i', mediaPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-c:a', 'pcm_s16le',
      wavPath
    ],
    { encoding: 'utf-8' }
  )
  if (res.status !== 0) {
    throw new Error(
      `ffmpeg falhou ao converter o audio: ${(res.stderr ?? '').slice(-400)}`
    )
  }
}
