import { describe, expect, it, vi } from 'vitest'
import { createCodeSaver } from '../src/renderer/src/lib/codeAutosave'

const initial = { name: 'Antes', color: '#111', description: '' }

describe('autosave de código', () => {
  it('não grava ao abrir/fechar sem alterações e normaliza espaços', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const saver = createCodeSaver(initial, write)
    await saver.flush()
    expect(write).not.toHaveBeenCalled()
    saver.change({ ...initial, name: ' Depois ', description: ' detalhe ' })
    await saver.flush()
    expect(write).toHaveBeenCalledWith({ ...initial, name: 'Depois', description: 'detalhe' })
    await saver.flush()
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('serializa as escritas e inclui a versão mais recente no mesmo flush', async () => {
    let finish!: () => void
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
      .mockResolvedValue(undefined)
    const saver = createCodeSaver(initial, write)
    saver.change({ ...initial, name: 'Primeira' })
    const pending = saver.flush()
    saver.change({ ...initial, name: 'Última', color: '#222' })
    expect(saver.flush()).toBe(pending)
    expect(write).toHaveBeenCalledTimes(1)
    finish()
    await pending
    expect(write).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenLastCalledWith({ ...initial, name: 'Última', color: '#222' })
  })

  it('mantém o rascunho para tentar novamente após uma falha', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('disco cheio')).mockResolvedValue(undefined)
    const saver = createCodeSaver(initial, write)
    saver.change({ ...initial, description: 'preservar' })
    await expect(saver.flush()).rejects.toThrow('disco cheio')
    await saver.flush()
    expect(write).toHaveBeenLastCalledWith({ ...initial, description: 'preservar' })
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('não grava nome vazio e permite recuperar o nome anterior', async () => {
    const write = vi.fn()
    const saver = createCodeSaver(initial, write)
    saver.change({ ...initial, name: '  ' })
    await expect(saver.flush()).rejects.toThrow('nome do código')
    expect(write).not.toHaveBeenCalled()
    saver.change(initial)
    await saver.flush()
    expect(write).not.toHaveBeenCalled()
  })

  it('persiste uma reversão feita enquanto a gravação anterior estava pendente', async () => {
    let finish!: () => void
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
      .mockResolvedValue(undefined)
    const saver = createCodeSaver(initial, write)
    saver.change({ ...initial, name: 'Depois' })
    const pending = saver.flush()
    saver.change(initial)
    finish()
    await pending
    expect(write).toHaveBeenLastCalledWith(initial)
  })

  it('preserva os espaços de campos importados que não foram editados', async () => {
    const imported = { name: ' Nome importado ', color: '#111', description: ' Descrição importada ' }
    const write = vi.fn().mockResolvedValue(undefined)
    const saver = createCodeSaver(imported, write)
    saver.change({ ...imported, color: '#222' })
    await saver.flush()
    expect(write).toHaveBeenCalledWith({ ...imported, color: '#222' })
  })

})
