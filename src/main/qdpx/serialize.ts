import JSZip from 'jszip'
import { QDE_FILENAME, SOURCES_DIR } from './constants'
import { buildQde, parseQde } from './xml'
import type { ParsedQdpx, QdpxProject } from './model'

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
  const zip = await JSZip.loadAsync(buffer)
  const qde = zip.file(QDE_FILENAME) ?? zip.file(/project\.qde$/i)[0]
  if (!qde) {
    throw new Error('Arquivo .qdpx invalido: project.qde nao encontrado')
  }
  const xml = await qde.async('string')
  const { project, skipped, sourcePaths } = parseQde(xml)

  for (const doc of project.documents) {
    if (doc.plainText) continue
    const path = sourcePaths.get(doc.guid)
    if (!path) continue
    const rel = path.replace(/^internal:\/\//, '')
    const entry =
      zip.file(`${SOURCES_DIR}/${rel}`) ??
      zip.file(
        new RegExp(`${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      )[0]
    if (entry) doc.plainText = await entry.async('string')
  }

  return { project, skipped }
}
