import { readFile } from 'fs/promises'
import { extname } from 'path'
import mammoth from 'mammoth'
import type { DocumentFormat } from '@shared/types'

export interface ExtractedText {
  format: DocumentFormat
  text: string
}

export function normalizeText(input: string): string {
  let text = input.replace(/^\uFEFF/, '')
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return text
}

export async function extractText(filePath: string): Promise<ExtractedText> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.docx') {
    const buffer = await readFile(filePath)
    const result = await mammoth.extractRawText({ buffer })
    return { format: 'docx', text: normalizeText(result.value) }
  }
  if (ext === '.txt') {
    const raw = await readFile(filePath, 'utf-8')
    return { format: 'txt', text: normalizeText(raw) }
  }
  throw new Error(`Formato nao suportado: ${ext}`)
}
