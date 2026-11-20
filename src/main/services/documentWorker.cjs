const { parentPort, workerData } = require('node:worker_threads')
const { readFile, stat } = require('node:fs/promises')
const JSZip = require('jszip')
const mammoth = require('mammoth')

// A extração roda fora do main, com limite de heap e prazo controlados pelo
// chamador. Também limitamos os bytes REAIS expandidos, não só o tamanho
// declarado no diretório ZIP (que pode ser falso).
const MAX_INPUT = 50 * 1024 * 1024
const MAX_ENTRY = 16 * 1024 * 1024
const MAX_TOTAL = 32 * 1024 * 1024

async function extract(path) {
  if ((await stat(path)).size > MAX_INPUT) throw new Error('DOCX excede o limite de 50 MiB.')
  const buffer = await readFile(path)
  if (buffer.length > MAX_INPUT) throw new Error('DOCX excede o limite de 50 MiB.')
  const zip = await JSZip.loadAsync(buffer)
  const entries = Object.values(zip.files)
  if (entries.length > 2000) throw new Error('DOCX contém entradas demais.')
  const safe = new JSZip()
  let total = 0
  for (const entry of entries) {
    // Texto puro não precisa expandir imagens, vídeos ou objetos embutidos.
    if (entry.dir || !/\.(xml|rels)$/i.test(entry.name)) continue
    const data = await new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      const stream = entry.internalStream('nodebuffer')
      stream.on('data', (chunk) => {
        size += chunk.length
        total += chunk.length
        if (size > MAX_ENTRY || total > MAX_TOTAL) {
          stream.pause()
          reject(new Error('O conteúdo expandido do DOCX excede o limite de segurança.'))
          return
        }
        chunks.push(chunk)
      }).on('error', reject).on('end', () => resolve(Buffer.concat(chunks))).resume()
    })
    safe.file(entry.name, data)
  }
  const sanitized = await safe.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
  const result = await mammoth.extractRawText({ buffer: sanitized })
  return result.value
}

extract(workerData).then(
  (text) => parentPort.postMessage({ text }),
  (error) => parentPort.postMessage({ error: error.message })
)
