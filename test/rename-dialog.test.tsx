// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RenameDialog } from '../src/renderer/src/components/workspace/RenameDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

const write = vi.fn()
const close = vi.fn()
const setNameDirty = vi.fn()
function editor() {
  return <RenameDialog title="Renomear grupo" label="Nome do grupo" initialName="Antes" write={write} onClose={close} />
}
async function pause() { await act(async () => { vi.advanceTimersByTime(800) }) }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  write.mockResolvedValue(undefined)
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setNameDirty } } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('salva automaticamente, agrupa a sessão e não reinicia o campo ao atualizar a lista', async () => {
  const view = render(editor())
  expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Primeiro' } })
  expect(write).not.toHaveBeenCalled()
  expect(setNameDirty).toHaveBeenLastCalledWith(true)
  await pause()
  expect(write).toHaveBeenCalledWith('Primeiro', expect.any(String))
  expect(screen.getByRole('status').textContent).toBe('Salvo')
  view.rerender(editor())
  expect((screen.getByLabelText('Nome do grupo') as HTMLInputElement).value).toBe('Primeiro')
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Último' } })
  await pause()
  expect(write.mock.calls[1][1]).toBe(write.mock.calls[0][1])
  expect(close).not.toHaveBeenCalled()
})

it.each(['Escape', 'Enter', 'Fechar'])('conclui as alterações pendentes por %s', async (via) => {
  render(editor())
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Depois' } })
  await act(async () => {
    if (via === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
    else if (via === 'Enter') fireEvent.keyDown(screen.getByLabelText('Nome do grupo'), { key: 'Enter' })
    else fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0])
  })
  expect(write).toHaveBeenCalledWith('Depois', expect.any(String))
  expect(close).toHaveBeenCalledTimes(1)
})

it('mantém o rascunho aberto ao falhar e oferece nova tentativa', async () => {
  write.mockRejectedValueOnce(new Error('disco cheio'))
  render(editor())
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Preservar' } })
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
  expect(screen.getByRole('alert').textContent).toContain('disco cheio')
  expect(close).not.toHaveBeenCalled()
  expect(setNameDirty).toHaveBeenLastCalledWith(true)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })) })
  expect(screen.getByRole('status').textContent).toBe('Salvo')
  expect((screen.getByLabelText('Nome do grupo') as HTMLInputElement).value).toBe('Preservar')
})

it('não salva nomes vazios nem fecha até o nome ser corrigido', async () => {
  render(editor())
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: ' ' } })
  await pause()
  await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
  expect(close).not.toHaveBeenCalled()
  expect(write).not.toHaveBeenCalled()
  expect(screen.getByRole('alert').textContent).toContain('vazio')
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Antes' } })
  await act(async () => { expect(await useAppStore.getState().sairDaRenomeacao!()).toBe(true) })
  expect(close).toHaveBeenCalledTimes(1)
  expect(write).not.toHaveBeenCalled()
})

it('aguarda a gravação em andamento, incluindo alterações digitadas depois', async () => {
  let finish!: () => void
  write.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  render(editor())
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Primeiro' } })
  await pause()
  fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Último' } })
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
  await act(async () => { finish() })
  expect(write).toHaveBeenLastCalledWith('Último', expect.any(String))
  expect(close).toHaveBeenCalledTimes(1)
})
