import { describe, expect, it } from 'vitest'
import {
  sanitizeProjectFileName,
  sidecarPaths,
  targetProjectPath
} from '../src/main/services/projectPath'

describe('sanitizeProjectFileName', () => {
  it('keeps accents, spaces and parentheses', () => {
    expect(sanitizeProjectFileName('SBSI (Cabeçudo Lindo 2026-06-24)')).toBe(
      'SBSI (Cabeçudo Lindo 2026-06-24)'
    )
  })

  // esses caracteres o Windows recusa no nome do arquivo
  it('replaces characters that are invalid in a file name', () => {
    expect(sanitizeProjectFileName('a/b\\c:d*e?f"g<h>i|j')).toBe(
      'a-b-c-d-e-f-g-h-i-j'
    )
  })

  it('drops trailing dots and spaces', () => {
    expect(sanitizeProjectFileName('projeto...  ')).toBe('projeto')
  })

  it('returns empty for a name made only of invalid parts', () => {
    expect(sanitizeProjectFileName('   ...   ')).toBe('')
  })
})

describe('targetProjectPath', () => {
  it('keeps the directory and the extension', () => {
    expect(targetProjectPath('/home/lucas/antigo.liva', 'Pesquisa X')).toBe(
      '/home/lucas/Pesquisa X.liva'
    )
  })

  it('returns null when the name would not change the file', () => {
    expect(targetProjectPath('/home/lucas/igual.liva', 'igual')).toBeNull()
  })

  it('returns null when the name has nothing usable', () => {
    expect(targetProjectPath('/home/lucas/x.liva', '   ')).toBeNull()
  })

  it('does not leave the original directory', () => {
    // as barras somem no saneamento, entao o resultado e um nome literal
    const target = targetProjectPath('/home/lucas/x.liva', '../../etc/passwd')
    expect(target).toBe('/home/lucas/..-..-etc-passwd.liva')
  })

  it('returns null for names that would mean a directory', () => {
    expect(targetProjectPath('/home/lucas/x.liva', '..')).toBeNull()
    expect(targetProjectPath('/home/lucas/x.liva', '.')).toBeNull()
  })
})

describe('sidecarPaths', () => {
  // o SQLite em WAL deixa esses dois ao lado; renomear so o principal os orfana
  it('points at the wal and shm neighbours', () => {
    expect(sidecarPaths('/home/lucas/x.liva')).toEqual([
      '/home/lucas/x.liva-wal',
      '/home/lucas/x.liva-shm'
    ])
  })
})
