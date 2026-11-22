// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { CodesPanel } from '../src/renderer/src/components/workspace/CodesPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import { CODE_PALETTE } from '../src/renderer/src/lib/utils'
import type { CodeWithCount } from '../src/shared/types'

const code: CodeWithCount = {
  id: 1, guid: 'c', name: 'Demanda por informação', color: CODE_PALETTE[0],
  description: 'Descrição inicial', memo: 'Memo inicial', parentId: null,
  sortOrder: 0, createdAt: '', usageCount: 1
}
const coding = { id: 11, guid: 'q', documentId: 1, codeId: code.id, startPos: 6, endPos: 13, createdAt: '' }
const updateCode = vi.fn()
const removeCoding = vi.fn()
const deleteCode = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(window, 'api', { configurable: true, value: {
    app: { setCodeDirty: vi.fn(), setMemoDirty: vi.fn(), setNameDirty: vi.fn() }
  } })
  const getComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = getComputedStyle(element)
    if (element.classList.contains('transcript')) style.lineHeight = '28px'
    return style
  })
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 100, 28)
  Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 28)] as unknown as DOMRectList
  useAppStore.setState(useAppStore.getInitialState(), true)
  updateCode.mockImplementation(async (patch) => {
    useAppStore.setState((state) => ({ codes: state.codes.map((item) => item.id === patch.id ? { ...item, ...patch } : item) }))
  })
  removeCoding.mockResolvedValue(undefined)
  useAppStore.setState({
    currentDocument: { id: 1, guid: 'd', name: 'Entrevista', plainText: 'antes citação depois', charCount: 20, importedAt: '', originalFormat: 'txt', sourceFilename: null },
    codes: [code], codings: [coding], updateCode, removeCoding, deleteCode
  })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function openBarMenu() {
  fireEvent.contextMenu(screen.getByRole('button', { name: `Selecionar citação: ${code.name}` }), { clientX: 100, clientY: 100 })
  return screen.getByRole('menu', { name: 'Ações do código' })
}

it('abre as ações da etiqueta com o botão direito sem selecionar nem alterar a citação', () => {
  render(<TranscriptPanel />)
  const menu = openBarMenu()
  for (const name of ['Editar código', 'Abrir memo', 'Remover citação']) {
    expect(within(menu).getByRole('menuitem', { name })).toBeTruthy()
  }
  expect(screen.queryByRole('slider')).toBeNull()
  expect(updateCode).not.toHaveBeenCalled()
  expect(removeCoding).not.toHaveBeenCalled()
})

it('edita nome, cor e descrição pelo editor existente e atualiza a etiqueta', async () => {
  render(<TranscriptPanel />)
  await userEvent.click(within(openBarMenu()).getByRole('menuitem', { name: 'Editar código' }))
  expect(screen.getByRole('dialog', { name: 'Editar código' })).toBeTruthy()
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(code.name)
  expect((screen.getByLabelText('Descrição') as HTMLTextAreaElement).value).toBe(code.description)
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Nome atualizado' } })
  fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Nova descrição' } })
  await userEvent.click(screen.getByRole('button', { name: `Cor ${CODE_PALETTE[1]}` }))
  await act(async () => { expect(await useAppStore.getState().sairDoCodigo!()).toBe(true) })
  expect(updateCode).toHaveBeenCalledWith(expect.objectContaining({ id: code.id, name: 'Nome atualizado', color: CODE_PALETTE[1], description: 'Nova descrição' }))
  expect(screen.getByRole('button', { name: 'Selecionar citação: Nome atualizado' })).toBeTruthy()
  expect(useAppStore.getState().codings).toEqual([coding])
})

it('abre e salva o memo do código da etiqueta', async () => {
  render(<TranscriptPanel />)
  await userEvent.click(within(openBarMenu()).getByRole('menuitem', { name: 'Abrir memo' }))
  expect(screen.getByRole('dialog', { name: `Memo de código: ${code.name}` })).toBeTruthy()
  const field = screen.getByRole('textbox', { name: 'Texto do memo' })
  expect((field as HTMLTextAreaElement).value).toBe('Memo inicial')
  fireEvent.change(field, { target: { value: 'Memo atualizado' } })
  await act(async () => { expect(await useAppStore.getState().sairDoMemo!()).toBe(true) })
  expect(updateCode).toHaveBeenCalledWith({ id: code.id, memo: 'Memo atualizado' })
})

it('remove somente a citação acionada, sem excluir o código', async () => {
  removeCoding.mockImplementationOnce(async (id) => {
    useAppStore.setState((state) => ({ codings: state.codings.filter((item) => item.id !== id) }))
  })
  render(<TranscriptPanel />)
  await userEvent.click(within(openBarMenu()).getByRole('menuitem', { name: 'Remover citação' }))
  expect(removeCoding).toHaveBeenCalledTimes(1)
  expect(removeCoding).toHaveBeenCalledWith(coding.id)
  expect(deleteCode).not.toHaveBeenCalled()
  expect(updateCode).not.toHaveBeenCalled()
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.queryByRole('button', { name: `Selecionar citação: ${code.name}` })).toBeNull()
  expect(document.body.style.pointerEvents).not.toBe('none')
})

it('mostra o erro se não conseguir remover a citação', async () => {
  removeCoding.mockRejectedValueOnce(new Error('Falha ao remover'))
  render(<TranscriptPanel />)
  await userEvent.click(within(openBarMenu()).getByRole('menuitem', { name: 'Remover citação' }))
  expect(screen.getByText('Falha ao remover')).toBeTruthy()
  expect(useAppStore.getState().codes).toEqual([code])
})

it('preserva o clique esquerdo e permite fechar o menu com Escape sem alterar o código', async () => {
  render(<TranscriptPanel />)
  await userEvent.click(screen.getByRole('button', { name: `Selecionar citação: ${code.name}` }))
  expect(screen.getByRole('slider', { name: 'Início da citação' })).toBeTruthy()
  openBarMenu()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.getByRole('slider', { name: 'Início da citação' })).toBeTruthy()
  expect(updateCode).not.toHaveBeenCalled()
  expect(removeCoding).not.toHaveBeenCalled()
})

it('identifica cada código numa etiqueta agrupada e executa a ação no alvo correto', async () => {
  const middleCode = { ...code, id: 2, guid: 'c2', name: 'Código intermediário' }
  const otherCode = { ...code, id: 3, guid: 'c3', name: 'Outro código' }
  const middleCoding = { ...coding, id: 22, guid: 'q2', codeId: middleCode.id }
  const otherCoding = { ...coding, id: 33, guid: 'q3', codeId: otherCode.id }
  useAppStore.setState({ codes: [code, middleCode, otherCode], codings: [coding, middleCoding, otherCoding] })
  // A terceira citação multilinha ocupa uma etiqueta já usada pelas anteriores.
  Range.prototype.getClientRects = () => [new DOMRect(0, 0, 100, 28), new DOMRect(0, 28, 100, 28)] as unknown as DOMRectList
  render(<TranscriptPanel />)
  const menu = openBarMenu()
  const group = within(menu).getByRole('group', { name: otherCode.name })
  await userEvent.click(within(group).getByRole('menuitem', { name: 'Remover citação' }))
  expect(removeCoding).toHaveBeenCalledTimes(1)
  expect(removeCoding).toHaveBeenCalledWith(otherCoding.id)
  const secondMenu = openBarMenu()
  await userEvent.click(within(within(secondMenu).getByRole('group', { name: otherCode.name })).getByRole('menuitem', { name: 'Editar código' }))
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(otherCode.name)
  await act(async () => { await useAppStore.getState().sairDoCodigo!() })
})

it('também oferece Editar código no menu de botão direito da lista à esquerda', async () => {
  const { container } = render(<CodesPanel onViewCode={() => {}} />)
  fireEvent.contextMenu(container.querySelector(`[data-code-row="${code.id}"]`)!)
  await userEvent.click(screen.getByRole('menuitem', { name: 'Editar código' }))
  expect(screen.getByRole('dialog', { name: 'Editar código' })).toBeTruthy()
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(code.name)
  await act(async () => { await useAppStore.getState().sairDoCodigo!() })
})

it('oferece renomear em vez de editar cor e descrição para categorias', async () => {
  useAppStore.setState({ codes: [{ ...code, isCategory: true }] })
  const { container } = render(<CodesPanel onViewCode={() => {}} />)
  fireEvent.contextMenu(container.querySelector(`[data-code-row="${code.id}"]`)!)
  expect(screen.queryByRole('menuitem', { name: 'Editar código' })).toBeNull()
  await userEvent.click(screen.getByRole('menuitem', { name: 'Renomear categoria' }))
  expect(screen.getByRole('dialog', { name: 'Renomear categoria' })).toBeTruthy()
})
