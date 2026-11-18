import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { extname, join } from 'path'
import { Worker } from 'worker_threads'
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
    const compiled = join(__dirname, 'documentWorker.js')
    const text = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(existsSync(compiled) ? compiled : join(__dirname, 'documentWorker.cjs'), {
        workerData: filePath, resourceLimits: { maxOldGenerationSizeMb: 256 }
      })
      const timer = setTimeout(() => {
        void worker.terminate()
        reject(new Error('A extração do DOCX excedeu o prazo de 30 segundos.'))
      }, 30000)
      const cleanup = (): void => { clearTimeout(timer) }
      worker.once('message', (result: { text?: string; error?: string }) => {
        cleanup()
        void worker.terminate()
        if (result.error) reject(new Error(result.error))
        else if (typeof result.text === 'string') resolve(result.text)
        else reject(new Error('Resposta inválida ao extrair o DOCX.'))
      })
      worker.once('error', (error) => {
        cleanup()
        reject(new Error('Não foi possível extrair o DOCX dentro dos limites de memória.', { cause: error }))
      })
      worker.once('exit', (code) => {
        cleanup()
        if (code !== 0) reject(new Error('A extração do DOCX foi interrompida.'))
      })
    })
    return { format: 'docx', text: normalizeText(text) }
  }
  if (ext === '.txt') {
    if ((await stat(filePath)).size > 32 * 1024 * 1024) throw new Error('TXT excede o limite de 32 MiB.')
    const raw = await readFile(filePath, 'utf-8')
    return { format: 'txt', text: normalizeText(raw) }
  }
  throw new Error(`Formato não suportado: ${ext}`)
}
