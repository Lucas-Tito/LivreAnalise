import type JSZip from 'jszip'
import type { Readable } from 'stream'

export const MAX_QDPX_BYTES = 128 * 1024 * 1024

export function createZipTextReader(): (entry: JSZip.JSZipObject) => Promise<string> {
  let total = 0
  return (entry) => new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const stream = entry.nodeStream('nodebuffer') as Readable
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length
      total += chunk.length
      if (size > 32 * 1024 * 1024 || total > 256 * 1024 * 1024) {
        stream.pause()
        chunks.length = 0
        reject(new Error('O conteúdo expandido do QDPX excede o limite de segurança.'))
        stream.destroy()
        return
      }
      chunks.push(chunk)
    }).on('error', reject).on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))).resume()
  })
}
