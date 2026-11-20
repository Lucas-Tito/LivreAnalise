import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import JSZip from 'jszip'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { extractText } from '../src/main/services/textExtract'
import { createZipTextReader } from '../src/main/qdpx/zipReader'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'liva-docx-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function docx(text: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('word/document.xml', `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

it('extracts an ordinary document in an isolated worker', async () => {
  const path = join(dir, 'ordinary.docx')
  writeFileSync(path, await docx('Ação e pesquisa'))
  expect((await extractText(path)).text.trim()).toBe('Ação e pesquisa')
})

it('rejects excessive real DOCX expansion before parsing the XML', async () => {
  const path = join(dir, 'compressed.docx')
  const archive = await docx('x'.repeat(17 * 1024 * 1024))
  expect(archive.length).toBeLessThan(100000)
  writeFileSync(path, archive)
  await expect(extractText(path)).rejects.toThrow('limite de segurança')
})

it('bounds the real expansion of QDPX entries too', async () => {
  const zip = new JSZip()
  zip.file('large.txt', 'x'.repeat(33 * 1024 * 1024))
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const parsed = await JSZip.loadAsync(archive)
  await expect(createZipTextReader()(parsed.file('large.txt')!)).rejects.toThrow('limite de segurança')
})
