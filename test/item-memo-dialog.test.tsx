// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoDialog, type MemoTarget } from '../src/renderer/src/components/workspace/MemoDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

const updateCode = vi.fn()
const updateCollection = vi.fn()
const setMemoDirty = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setMemoDirty } } })
  useAppStore.setState({ updateCode, updateCollection })
  updateCode.mockResolvedValue(undefined)
  updateCollection.mockResolvedValue(undefined)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('editor de memo', () => {
  it.each(['código', 'categoria', 'grupo'] as const)('salva o memo de %s ao voltar', async (kind) => {
    const close = vi.fn()
    const target: MemoTarget = { id: 1, name: 'Nome', kind, memo: '' }
    render(<MemoDialog target={target} onClose={close} />)
    expect(screen.getByRole('heading', { name: `Memo de ${kind}: Nome` })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Texto do memo'), { target: { value: 'linha 1\nlinha 2' } })
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(close).toHaveBeenCalled())
    expect(kind === 'grupo' ? updateCollection : updateCode).toHaveBeenCalledWith({ id: 1, memo: 'linha 1\nlinha 2' })
  })

  it('recupera a edição após desmontar quando o primeiro salvamento falha', async () => {
    const target: MemoTarget = { id: 7, name: 'Categoria', kind: 'categoria', memo: '' }
    const first = render(<MemoDialog target={target} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Texto do memo'), { target: { value: 'em andamento' } })
    updateCode.mockRejectedValueOnce(new Error('disco cheio'))
    await act(async () => first.unmount())
    render(<MemoDialog target={target} onClose={() => {}} />)
    expect((screen.getByLabelText('Texto do memo') as HTMLTextAreaElement).value).toBe('em andamento')
    expect(screen.getByRole('status').textContent).toBe('Alterações não salvas')
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(updateCode).toHaveBeenCalledTimes(2)
    expect(setMemoDirty).toHaveBeenLastCalledWith(false)
  })

  it('salva automaticamente após uma pausa e continua aberto', async () => {
    const close = vi.fn()
    render(<MemoDialog target={{ id: 1, name: 'Nome', kind: 'código', memo: '' }} onClose={close} />)
    fireEvent.change(screen.getByLabelText('Texto do memo'), { target: { value: 'rascunho' } })
    expect(screen.getByRole('status').textContent).toBe('Alterações não salvas')
    await waitFor(() => expect(updateCode).toHaveBeenCalledWith({ id: 1, memo: 'rascunho' }), { timeout: 2000 })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Salvo'))
    expect(close).not.toHaveBeenCalled()
  })

  it('salva a versão mais recente digitada durante uma gravação', async () => {
    let finishSave!: () => void
    updateCode.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSave = resolve }))
    const close = vi.fn()
    render(<MemoDialog target={{ id: 1, name: 'Nome', kind: 'código', memo: '' }} onClose={close} />)
    const field = screen.getByLabelText('Texto do memo') as HTMLTextAreaElement
    fireEvent.change(field, { target: { value: 'primeira' } })
    fireEvent.keyDown(field, { key: 's', ctrlKey: true })
    expect(updateCode).toHaveBeenCalledWith({ id: 1, memo: 'primeira' })
    fireEvent.change(field, { target: { value: 'mais recente' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).not.toHaveBeenCalled()
    await act(async () => finishSave())
    await waitFor(() => expect(close).toHaveBeenCalled())
    expect(updateCode).toHaveBeenLastCalledWith({ id: 1, memo: 'mais recente' })
  })

  it('mantém o rascunho aberto quando falha ao sair e permite tentar novamente', async () => {
    updateCode.mockRejectedValueOnce(new Error('disco cheio'))
    const close = vi.fn()
    render(<MemoDialog target={{ id: 1, name: 'Nome', kind: 'código', memo: '' }} onClose={close} />)
    fireEvent.change(screen.getByLabelText('Texto do memo'), { target: { value: 'preservar' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect((await screen.findByRole('alert')).textContent).toContain('disco cheio')
    expect(close).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Texto do memo') as HTMLTextAreaElement).value).toBe('preservar')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Salvo'))
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await waitFor(() => expect(close).toHaveBeenCalled())
  })
})
