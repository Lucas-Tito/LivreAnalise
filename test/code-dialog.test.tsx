// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CodeDialog } from '../src/renderer/src/components/workspace/CodeDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import { CODE_PALETTE } from '../src/renderer/src/lib/utils'
import type { CodeWithCount } from '../src/shared/types'

const code: CodeWithCount = {
  id: 1, guid: 'code', name: 'Antes', color: CODE_PALETTE[0], description: 'Descrição inicial',
  parentId: null, sortOrder: 0, createdAt: '', usageCount: 0
}
const updateCode = vi.fn()
const setCodeDirty = vi.fn()
const close = vi.fn()
const submit = vi.fn()

function editor() {
  return <CodeDialog open title="Editar código" existing={code} onOpenChange={close} onSubmit={submit} />
}
async function pause() {
  await act(async () => { vi.advanceTimersByTime(800) })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ updateCode })
  updateCode.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setCodeDirty } } })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('editar código com autosave', () => {
  it('salva nome e descrição após uma pausa, sem fechar nem exigir confirmação', async () => {
    render(editor())
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Depois' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Nova descrição' } })
    expect(setCodeDirty).toHaveBeenLastCalledWith(true)
    expect(updateCode).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Alterações não salvas')
    await pause()
    expect(updateCode).toHaveBeenCalledTimes(1)
    expect(updateCode).toHaveBeenCalledWith({
      id: code.id, name: 'Depois', color: code.color, description: 'Nova descrição', historyGroup: expect.any(String)
    })
    expect(screen.getByRole('status').textContent).toBe('Salvo')
    expect(setCodeDirty).toHaveBeenLastCalledWith(false)
    expect(close).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('salva a cor imediatamente e mantém a sessão ao atualizar a lista', async () => {
    const view = render(editor())
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rascunho' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Cor ${CODE_PALETTE[1]}` })) })
    expect(updateCode).toHaveBeenCalledTimes(1)
    expect(updateCode).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Rascunho', color: CODE_PALETTE[1] }))
    view.rerender(<CodeDialog open title="Editar código" existing={{ ...code }}
      initial={{ name: code.name, color: code.color }} onOpenChange={close} onSubmit={submit} />)
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Rascunho')
    expect(screen.getByRole('button', { name: `Cor ${CODE_PALETTE[1]}` }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Detalhe' } })
    await pause()
    expect(updateCode.mock.calls[1][0].historyGroup).toBe(updateCode.mock.calls[0][0].historyGroup)
  })

  it.each(['botão', 'Escape', 'X', 'Enter'])('conclui as alterações pendentes ao fechar por %s', async (via) => {
    render(editor())
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Fechar rápido' } })
    await act(async () => {
      if (via === 'Escape') fireEvent.keyDown(document, { key: 'Escape' })
      else if (via === 'Enter') fireEvent.keyDown(screen.getByLabelText('Nome'), { key: 'Enter' })
      else fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[via === 'X' ? 1 : 0])
    })
    expect(updateCode).toHaveBeenCalledWith(expect.objectContaining({ name: 'Fechar rápido' }))
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith(false)
    await pause()
    expect(updateCode).toHaveBeenCalledTimes(1)
  })

  it('aguarda a gravação em andamento e inclui o que foi digitado depois', async () => {
    let finish!: () => void
    updateCode.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    render(editor())
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Primeira' } })
    await pause()
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Última' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).not.toHaveBeenCalled()
    await act(async () => { finish() })
    expect(updateCode).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Última' }))
    expect(close).toHaveBeenCalledWith(false)
  })

  it('mantém o rascunho aberto quando falha e permite tentar novamente', async () => {
    updateCode.mockRejectedValueOnce(new Error('disco cheio'))
    render(editor())
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Preservar' } })
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(screen.getByRole('alert').textContent).toContain('disco cheio')
    expect(close).not.toHaveBeenCalled()
    expect(setCodeDirty).toHaveBeenLastCalledWith(true)
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Preservar')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })) })
    expect(screen.getByRole('status').textContent).toBe('Salvo')
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(close).toHaveBeenCalledWith(false)
  })

  it('não grava um nome vazio nem permite sair sem corrigi-lo', async () => {
    render(editor())
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: ' ' } })
    await pause()
    expect(updateCode).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('nome do código')
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: code.name } })
    await act(async () => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(close).toHaveBeenCalledWith(false)
    expect(updateCode).not.toHaveBeenCalled()
  })

  it('não intercepta Ctrl+Z nos campos e salva também a reversão da digitação', async () => {
    render(editor())
    const name = screen.getByLabelText('Nome')
    fireEvent.change(name, { target: { value: 'Depois' } })
    await pause()
    expect(fireEvent.keyDown(name, { key: 'z', ctrlKey: true })).toBe(true)
    // JSDOM não implementa undo nativo: simula o input produzido pelo navegador.
    fireEvent.input(name, { target: { value: code.name }, inputType: 'historyUndo' })
    await pause()
    expect(updateCode).toHaveBeenLastCalledWith(expect.objectContaining({ name: code.name }))
  })

  it('registra uma saída que salva antes de desfazer ou trocar de projeto', async () => {
    render(editor())
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: '' } })
    await act(async () => { expect(await useAppStore.getState().sairDoCodigo!()).toBe(true) })
    expect(updateCode).toHaveBeenCalledWith(expect.objectContaining({ description: null }))
    expect(close).toHaveBeenCalledWith(false)
  })

  it('reinicia os campos e o agrupamento ao reabrir', async () => {
    const view = render(editor())
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Primeira sessão' } })
    await pause()
    const firstGroup = updateCode.mock.calls[0][0].historyGroup
    view.rerender(<CodeDialog open={false} title="Editar código" onOpenChange={close} onSubmit={submit} />)
    expect(useAppStore.getState().sairDoCodigo).toBeNull()
    view.rerender(editor())
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(code.name)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Segunda sessão' } })
    await pause()
    expect(updateCode.mock.calls[1][0].historyGroup).not.toBe(firstGroup)
  })
})

describe('novo código', () => {
  it('só cria após confirmação e mantém o rascunho quando a criação falha', async () => {
    submit.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<CodeDialog open title="Novo código" initial={{ color: code.color }} onOpenChange={close} onSubmit={submit} />)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: ' Novo ' } })
    await pause()
    expect(submit).not.toHaveBeenCalled()
    expect(updateCode).not.toHaveBeenCalled()
    expect(useAppStore.getState().sairDoCodigo).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar' })) })
    expect(submit).toHaveBeenCalledWith({ name: 'Novo', color: code.color, description: '' })
    expect(close).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(' Novo ')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Criar' })) })
    expect(close).toHaveBeenCalledWith(false)
  })
})
