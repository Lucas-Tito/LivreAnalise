import JSZip from 'jszip'
import { QDE_FILENAME, SOURCES_DIR } from './constants'
import { buildQde, parseQde } from './xml'
import type { ParsedQdpx, QdpxProject } from './model'
import { createZipTextReader, MAX_QDPX_BYTES } from './zipReader'

export async function serializeQdpx(project: QdpxProject): Promise<Buffer> {
  const xml = buildQde(project)
  const zip = new JSZip()
  zip.file(QDE_FILENAME, xml)
  const sources = zip.folder(SOURCES_DIR)!
  for (const doc of project.documents) {
    sources.file(`${doc.guid}.txt`, doc.plainText)
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

function findTextSource(zip: JSZip, path: string): JSZip.JSZipObject | null {
  if (/^(absolute|relative):\/\//i.test(path)) return null
  const relative = path.replace(/^internal:\/\//i, '').replace(/^\/+/, '')
  const known = zip.file(SOURCES_DIR + '/' + relative) ?? zip.file('sources/' + relative) ?? zip.file(relative)
  if (known) return known

  // Alguns exportadores incluem uma pasta externa no ZIP. Só tente o
  // caminho inteiro em uma fronteira de diretório, e rejeite ambiguidades.
  const matches = Object.values(zip.files).filter((entry) =>
    !entry.dir && entry.name.endsWith('/' + relative)
  )
  return matches.length === 1 ? matches[0] : null
}

export async function deserializeQdpx(buffer: Buffer): Promise<ParsedQdpx> {
  if (buffer.length > MAX_QDPX_BYTES) throw new Error('QDPX excede o limite de 128 MiB.')
  const zip = await JSZip.loadAsync(buffer)
  if (Object.keys(zip.files).length > 10000) throw new Error('QDPX contém entradas demais.')
  const readText = createZipTextReader()
  const root = zip.file(QDE_FILENAME)
  const candidates = root ? [root] : zip.file(/(?:^|\/)project\.qde$/i)
  if (candidates.length > 1) {
    throw new Error('Arquivo .qdpx inválido: há mais de um project.qde')
  }
  const [qde] = candidates
  if (!qde) {
    throw new Error('Arquivo .qdpx inválido: project.qde não encontrado')
  }
  const xml = await readText(qde)
  const { project, skipped, sourcePaths, origin } = parseQde(xml)

  const availableDocuments: QdpxProject['documents'] = []
  for (const doc of project.documents) {
    const path = sourcePaths.get(doc.guid)
    if (!doc.plainText && path) {
      const entry = findTextSource(zip, path)
      if (!entry) {
        const codings = doc.selections.flatMap((selection) => selection.codeGuids).length
        const notes = doc.noteGuids.length + doc.selections.flatMap((selection) => selection.noteGuids).length
        skipped.push(`Fonte de texto indisponível: "${doc.name}" (${path}). ${codings} vínculos de código e ${notes} vínculos de nota não puderam ser importados.`)
        continue
      }
      const source = await readText(entry)
      const text = /^LivreAnalise(?:\s|$)/i.test(origin) ? source : source.replace(/^\uFEFF/, '')
      // O QualCoder grava os offsets sobre o texto com LF, antes que a
      // escrita em modo texto acrescente CR no Windows.
      doc.plainText = /^QualCoder(?:\s|$)/i.test(origin) ? text.replace(/\r\n/g, '\n') : text
    }
    availableDocuments.push(doc)
  }
  project.documents = availableDocuments

  for (const note of project.notes) {
    if (note.plainText) continue
    const path = sourcePaths.get(`note:${note.guid}`)
    if (!path) continue
    const entry = findTextSource(zip, path)
    if (entry) note.plainText = await readText(entry)
    else skipped.push(`Conteúdo de nota ausente: ${note.name ?? note.guid} (${path})`)
  }

  return { project, skipped }
}
