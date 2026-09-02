import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { unlink } from 'fs/promises'
import { dirname } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'

export interface DownloadProgress {
  receivedBytes: number
  totalBytes: number
}

export interface RemoteFileInfo {
  bytes: number | null
  sha256: string | null
}

// O Hugging Face expoe o sha256 do arquivo no header x-linked-etag, entao a
// integridade pode ser verificada sem hash chumbado no codigo.
export async function fetchRemoteInfo(url: string): Promise<RemoteFileInfo> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    const length = res.headers.get('content-length')
    const linked = res.headers.get('x-linked-etag') ?? res.headers.get('etag')
    const sha = linked?.replace(/"/g, '').trim() ?? null
    return {
      bytes: length ? Number(length) : null,
      sha256: sha && /^[0-9a-f]{64}$/.test(sha) ? sha : null
    }
  } catch {
    return { bytes: null, sha256: null }
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
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
  signal: AbortSignal
): Promise<void> {
  mkdirSync(dirname(dest), { recursive: true })
  const partial = `${dest}.part`
  const already = existsSync(partial) ? statSync(partial).size : 0

  const res = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: already > 0 ? { Range: `bytes=${already}-` } : {}
  })
  if (!res.ok && res.status !== 206) {
    throw new Error(`Falha ao baixar (HTTP ${res.status})`)
  }
  if (!res.body) throw new Error('Resposta sem corpo')

  const resuming = res.status === 206
  const remaining = Number(res.headers.get('content-length') ?? 0)
  const totalBytes = resuming ? already + remaining : remaining
  const expectedSha =
    (res.headers.get('x-linked-etag') ?? '').replace(/"/g, '').trim() || null
  let receivedBytes = resuming ? already : 0

  if (!resuming && already > 0) await unlink(partial).catch(() => undefined)

  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    counter((size) => {
      receivedBytes += size
      onProgress({ receivedBytes, totalBytes })
    }),
    createWriteStream(partial, { flags: resuming ? 'a' : 'w' })
  )

  const finalSize = statSync(partial).size
  if (totalBytes > 0 && finalSize !== totalBytes) {
    await unlink(partial).catch(() => undefined)
    throw new Error(
      `Download incompleto: ${finalSize} de ${totalBytes} bytes. Tente novamente.`
    )
  }

  // Tamanho igual nao garante conteudo igual: foi exatamente assim que um
  // arquivo corrompido passou desapercebido antes.
  if (expectedSha && /^[0-9a-f]{64}$/.test(expectedSha)) {
    const actual = await hashFile(partial)
    if (actual !== expectedSha) {
      await unlink(partial).catch(() => undefined)
      throw new Error('Arquivo baixado está corrompido (sha256 não confere). Tente novamente.')
    }
  }

  renameSync(partial, dest)
}
