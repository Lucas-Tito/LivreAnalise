// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppCloseDialog } from '../src/renderer/src/components/workspace/AppCloseDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

let requestClose: () => Promise<void>
const confirmClose = vi.fn()
const cancelClose = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', { configurable: true, value: { app: {
    onCloseRequested: (listener: typeof requestClose) => { requestClose = listener; return () => {} },
    confirmClose, cancelClose
  } } })
})
afterEach(cleanup)

it.each(['sairDoCodigo', 'sairDaRenomeacao'] as const)('aguarda %s antes de confirmar o fechamento do aplicativo', async (hook) => {
  let finish!: (ok: boolean) => void
  useAppStore.setState({ [hook]: () => new Promise<boolean>((resolve) => { finish = resolve }) })
  render(<AppCloseDialog />)
  const pending = requestClose()
  expect(confirmClose).not.toHaveBeenCalled()
  await act(async () => { finish(true); await pending })
  expect(confirmClose).toHaveBeenCalledTimes(1)
  expect(cancelClose).not.toHaveBeenCalled()
})

it.each(['sairDoCodigo', 'sairDaRenomeacao'] as const)('permite repetir e descartar quando %s falha', async (hook) => {
  const save = vi.fn(async () => false)
  useAppStore.setState({ [hook]: save })
  const user = userEvent.setup()
  render(<AppCloseDialog />)

  await act(requestClose)
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  expect(save).toHaveBeenCalledTimes(2)
  expect(confirmClose).not.toHaveBeenCalled()
  expect(cancelClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }))
  expect(confirmClose).toHaveBeenCalledOnce()
})

it('consulta novamente o rascunho da transcrição após salvar a renomeação na segunda tentativa', async () => {
  const saveName = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const podeSairDoTexto = vi.fn(async () => false)
  useAppStore.setState({ sairDaRenomeacao: saveName, podeSairDoTexto })
  const user = userEvent.setup()
  render(<AppCloseDialog />)

  await act(requestClose)
  expect(podeSairDoTexto).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))

  expect(podeSairDoTexto).toHaveBeenCalledOnce()
  expect(cancelClose).toHaveBeenCalledOnce()
  expect(confirmClose).not.toHaveBeenCalled()
})
