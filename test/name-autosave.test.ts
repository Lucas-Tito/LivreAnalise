import { expect, it, vi } from 'vitest'
import { createNameSaver } from '../src/renderer/src/lib/nameAutosave'

it('ignora nomes sem alterações e normaliza espaços sem mudar o rascunho', async () => {
  const write = vi.fn().mockResolvedValue(undefined)
  const saver = createNameSaver('Antes', write)
  saver.change(' Antes ')
  await saver.flush()
  expect(write).not.toHaveBeenCalled()
  saver.change(' Depois ')
  await saver.flush()
  expect(write).toHaveBeenCalledWith('Depois')
})

it('serializa as escritas e inclui a versão mais recente no flush em andamento', async () => {
  let finish!: () => void
  const write = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    .mockResolvedValue(undefined)
  const saver = createNameSaver('Antes', write)
  saver.change('Primeiro')
  const pending = saver.flush()
  saver.change('Último')
  expect(saver.flush()).toBe(pending)
  expect(write).toHaveBeenCalledTimes(1)
  finish()
  await pending
  expect(write.mock.calls.map(([name]) => name)).toEqual(['Primeiro', 'Último'])
})

it('não esquece o rascunho se uma gravação falhar', async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error('disco cheio')).mockResolvedValue(undefined)
  const saver = createNameSaver('Antes', write)
  saver.change('Preservar')
  await expect(saver.flush()).rejects.toThrow('disco cheio')
  await saver.flush()
  expect(write).toHaveBeenCalledTimes(2)
  expect(write).toHaveBeenLastCalledWith('Preservar')
})

it('rejeita nomes vazios e permite cancelar voltando ao original sem gravações', async () => {
  const write = vi.fn()
  const saver = createNameSaver('Antes', write)
  saver.change(' ')
  await expect(saver.flush()).rejects.toThrow('nome não pode ficar vazio')
  saver.change('Antes')
  await saver.flush()
  expect(write).not.toHaveBeenCalled()
})

it('restaura o original mesmo quando cancelar ocorre durante a gravação', async () => {
  let finish!: () => void
  const write = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    .mockResolvedValue(undefined)
  const saver = createNameSaver('Antes', write)
  saver.change('Depois')
  const pending = saver.flush()
  saver.change('Antes')
  finish()
  await pending
  expect(write.mock.calls.map(([name]) => name)).toEqual(['Depois', 'Antes'])
})
