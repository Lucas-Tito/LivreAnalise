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

export async function deserializeQdpx(buffer: Buffer): Promise<ParsedQdpx> {
  if (buffer.length > MAX_QDPX_BYTES) throw new Error('QDPX excede o limite de 128 MiB.')
  const zip = await JSZip.loadAsync(buffer)
  if (Object.keys(zip.files).length > 10000) throw new Error('QDPX contém entradas demais.')
  const readText = createZipTextReader()
  const qde = zip.file(QDE_FILENAME) ?? zip.file(/project\.qde$/i)[0]
  if (!qde) {
    throw new Error('Arquivo .qdpx inválido: project.qde não encontrado')
  }
  const xml = await readText(qde)
  const { project, skipped, sourcePaths } = parseQde(xml)

  const availableDocuments: QdpxProject['documents'] = []
  for (const doc of project.documents) {
    const path = sourcePaths.get(doc.guid)
    if (!doc.plainText && path) {
      const rel = path.replace(/^internal:\/\//, '')
      const entry = /^(absolute|relative):\/\//i.test(path)
        ? null
        : zip.file(`${SOURCES_DIR}/${rel}`) ??
          zip.file(new RegExp(`${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))[0]
      if (!entry) {
        const codings = doc.selections.flatMap((selection) => selection.codeGuids).length
        const notes = doc.noteGuids.length + doc.selections.flatMap((selection) => selection.noteGuids).length
        skipped.push(`Fonte de texto indisponível: "${doc.name}" (${path}). ${codings} vínculos de código e ${notes} vínculos de nota não puderam ser importados.`)
        continue
      }
      doc.plainText = await readText(entry)
    }
    availableDocuments.push(doc)
  }
  project.documents = availableDocuments

  for (const note of project.notes) {
    if (note.plainText) continue
    const path = sourcePaths.get(`note:${note.guid}`)
    if (!path) continue
    const rel = path.replace(/^internal:\/\//, '')
    const entry =
      zip.file(`${SOURCES_DIR}/${rel}`) ??
      zip.file(
        new RegExp(`${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      )[0]
    if (entry) note.plainText = await readText(entry)
    else skipped.push(`Conteúdo de nota ausente: ${note.name ?? note.guid} (${path})`)
  }

  return { project, skipped }
}
