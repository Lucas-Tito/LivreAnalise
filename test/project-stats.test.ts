import { createRequire } from 'module'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
let nativeOk = true
try {
  require('better-sqlite3')
} catch {
  nativeOk = false
}

describe.skipIf(!nativeOk)('readProjectStats', () => {
  let db: typeof import('../src/main/db')
  let repos: typeof import('../src/main/db/repositories')
  let readProjectStats: typeof import('../src/main/db/projectStats').readProjectStats
  let projectPath = ''
  let tempDir = ''

  beforeEach(async () => {
    db = await import('../src/main/db')
    repos = await import('../src/main/db/repositories')
    readProjectStats = (await import('../src/main/db/projectStats')).readProjectStats
    tempDir = mkdtempSync(join(tmpdir(), 'atlas-stats-'))
    projectPath = join(tempDir, 'proj.liva')
    db.openDatabase(projectPath)
  })

  it('returns aggregated stats for a project file', () => {
    const codeA = repos.createCode({ name: 'A', color: '#f00' })
    const codeB = repos.createCode({ name: 'B', color: '#0f0' })
    const d1 = repos.createDocument({
      name: 'Doc 1',
      plainText: 'hello',
      originalFormat: 'txt'
    })
    const d2 = repos.createDocument({
      name: 'Doc 2',
      plainText: 'world!',
      originalFormat: 'txt'
    })
    repos.createCoding({ documentId: d1.id, codeId: codeA.id, startPos: 0, endPos: 2 })
    repos.createCoding({ documentId: d1.id, codeId: codeB.id, startPos: 0, endPos: 2 })
    repos.createCoding({ documentId: d2.id, codeId: codeA.id, startPos: 0, endPos: 1 })

    db.closeDatabase()

    expect(readProjectStats(projectPath)).toEqual({
      documents: 2,
      quotes: 3,
      codesUsed: 2
    })

    rmSync(tempDir, { recursive: true, force: true })
  })
})
