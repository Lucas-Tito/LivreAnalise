import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs'
import { createServer, type Server } from 'http'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { downloadFile, fetchRemoteInfo } from '../src/main/services/download'

let server: Server
let dir: string
let url: string
let content: string
let etag: string
let rangeHeader: string | undefined
let invalidRange: boolean
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')
const signal = (): AbortSignal => new AbortController().signal

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'liva-download-'))
  content = 'ABCDef'; etag = '"version1"'; invalidRange = false; rangeHeader = undefined
  server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/file', 'x-linked-etag': `"${digest(content)}"` }); res.end(); return
    }
    res.setHeader('etag', etag)
    if (req.method === 'HEAD') { res.setHeader('content-length', content.length); res.end(); return }
    rangeHeader = req.headers.range
    const start = rangeHeader ? Number(rangeHeader.match(/\d+/)![0]) : 0
    if (start >= content.length) { res.writeHead(416); res.end(); return }
    if (rangeHeader) {
      res.statusCode = 206
      res.setHeader('content-range', `bytes ${invalidRange ? 0 : start}-${content.length - 1}/${content.length}`)
    }
    res.setHeader('content-length', content.length - start)
    res.end(content.slice(start))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}/file`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(dir, { recursive: true, force: true })
})

function partial(text: string, identity = etag): string {
  const dest = join(dir, 'model')
  writeFileSync(`${dest}.part`, text)
  writeFileSync(`${dest}.part.json`, JSON.stringify({ url, identity }))
  return dest
}

it('resumes only the same object and validates the complete file', async () => {
  const sha = digest(content)
  const dest = partial('ABCD', sha)
  await downloadFile(url, dest, () => {}, signal(), sha)
  expect(rangeHeader).toBe('bytes=4-')
  expect(readFileSync(dest, 'utf8')).toBe(content)
})

it('restarts when the remote object has changed', async () => {
  const dest = partial('xxxx')
  etag = '"version2"'
  await downloadFile(url, dest, () => {}, signal())
  expect(rangeHeader).toBeUndefined()
  expect(readFileSync(dest, 'utf8')).toBe(content)
})

it('rejects a mismatched range and clears the invalid resume state', async () => {
  const dest = partial('ABCD')
  invalidRange = true
  await expect(downloadFile(url, dest, () => {}, signal())).rejects.toThrow('Intervalo')
  expect(existsSync(`${dest}.part`)).toBe(false)
})

it('promotes a complete verified partial without requesting an invalid range', async () => {
  const sha = digest(content)
  const dest = partial(content, sha)
  await downloadFile(url, dest, () => {}, signal(), sha)
  expect(readFileSync(dest, 'utf8')).toBe(content)
  expect(rangeHeader).toBeUndefined()
})

it('rejects same-size corruption using the pinned digest', async () => {
  const dest = partial('xxxxxx', digest(content))
  await expect(downloadFile(url, dest, () => {}, signal(), digest(content))).rejects.toThrow('sha256')
  expect(existsSync(dest)).toBe(false)
})

it('keeps the content digest announced before a redirect', async () => {
  expect((await fetchRemoteInfo(url.replace('/file', '/redirect'))).sha256).toBe(digest(content))
})
