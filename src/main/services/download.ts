import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'fs'
import { unlink } from 'fs/promises'
import { dirname } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { writeAtomicFile } from './atomicFile'

export interface DownloadProgress {
  receivedBytes: number
  totalBytes: number
}

export interface RemoteFileInfo {
  bytes: number | null
  sha256: string | null
  etag: string | null
}

// O Hugging Face expoe o sha256 do arquivo no header x-linked-etag, entao a
// integridade pode ser verificada sem hash chumbado no codigo.
export async function fetchRemoteInfo(url: string, signal?: AbortSignal): Promise<RemoteFileInfo> {
  try {
    let sha256: string | null = null
    for (let n = 0; n < 8; n++) {
      const res = await fetch(url, {
        method: 'HEAD', redirect: 'manual',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)
      })
      const linked = res.headers.get('x-linked-etag')?.replace(/"/g, '').trim()
      if (linked && /^[0-9a-f]{64}$/.test(linked)) sha256 = linked
      const location = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url).href
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const length = Number(res.headers.get('content-length'))
      return {
        bytes: Number.isSafeInteger(length) && length > 0 ? length : null,
        sha256,
        etag: res.headers.get('etag')
      }
    }
    throw new Error('Redirecionamentos em excesso')
  } catch {
    signal?.throwIfAborted()
    return { bytes: null, sha256: null, etag: null }
  }
}

export async function hashFile(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash, { signal })
  return hash.digest('hex')
}

// Conta os bytes por um Transform no meio do pipeline. Escutar 'data' no corpo
// da resposta poe o stream em flowing mode e atropela o backpressure do
// pipeline: o arquivo sai com o tamanho certo e o conteudo corrompido.
function counter(onChunk: (size: number) => void): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      onChunk(chunk.length)
      callback(null, chunk)
    }
  })
}

export async function downloadFile(
  url: string,
  dest: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal,
  sha256?: string
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const partial = `${dest}.part`
  const metadata = `${partial}.json`
  const info = await fetchRemoteInfo(url, signal)
  const expectedSha = sha256 ?? info.sha256
  const identity = expectedSha ?? info.etag
  const discard = async (): Promise<void> => {
    await unlink(partial).catch(() => undefined)
    await unlink(metadata).catch(() => undefined)
  }
  let already = existsSync(partial) ? statSync(partial).size : 0
  let previous: { url?: string; identity?: string } = {}
  try { previous = JSON.parse(readFileSync(metadata, 'utf8')) } catch { /* sem identidade confiável */ }
  if (already && (!identity || previous.url !== url || previous.identity !== identity || (info.bytes && already > info.bytes))) {
    await discard()
    already = 0
  }
  const promote = async (total: number): Promise<void> => {
    signal.throwIfAborted()
    if (total > 0 && statSync(partial).size !== total) {
      await discard()
      throw new Error('Download incompleto. Tente novamente.')
    }
    if (expectedSha && await hashFile(partial, signal) !== expectedSha) {
      await discard()
      throw new Error('Arquivo baixado está corrompido (sha256 não confere). Tente novamente.')
    }
    signal.throwIfAborted()
    renameSync(partial, dest)
    await unlink(metadata).catch(() => undefined)
  }
  if (already > 0 && already === info.bytes) {
    await promote(info.bytes)
    return
  }

  const res = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: already > 0 ? {
      Range: `bytes=${already}-`,
      ...(info.etag && !info.etag.startsWith('W/') ? { 'If-Range': info.etag } : {})
    } : {}
  })
  if (res.status === 416) {
    await discard()
    throw new Error('A retomada do download expirou. Tente novamente para baixar do início.')
  }
  if (!res.ok && res.status !== 206) {
    throw new Error(`Falha ao baixar (HTTP ${res.status})`)
  }
  if (!res.body) throw new Error('Resposta sem corpo')

  const resuming = res.status === 206
  const remaining = Number(res.headers.get('content-length') ?? 0)
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
  if (resuming && (!range || Number(range[1]) !== already || Number(range[2]) < already ||
    Number(range[3]) <= Number(range[2]) || (remaining > 0 && Number(range[2]) - already + 1 !== remaining) ||
    (info.bytes != null && Number(range[3]) !== info.bytes))) {
    await res.body.cancel()
    await discard()
    throw new Error('Intervalo de retomada inválido. Tente novamente.')
  }
  const totalBytes = resuming ? Number(range![3]) : info.bytes ?? remaining
  let receivedBytes = resuming ? already : 0

  if (!resuming && already > 0) await unlink(partial).catch(() => undefined)
  writeAtomicFile(metadata, JSON.stringify({ url, identity }))

  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    counter((size) => {
      receivedBytes += size
      onProgress({ receivedBytes, totalBytes })
    }),
    createWriteStream(partial, { flags: resuming ? 'a' : 'w', mode: 0o600 }),
    { signal }
  )

  await promote(totalBytes)
}
