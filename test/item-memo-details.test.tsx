// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CodeQuotationsDialog } from '../src/renderer/src/components/workspace/CodeQuotationsDialog'
import { CategoryCodesDialog } from '../src/renderer/src/components/workspace/CategoryCodesDialog'
import { CollectionMembersDialog } from '../src/renderer/src/components/workspace/CollectionMembersDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

const code = { id: 1, guid: 'c', name: 'Item', color: '#000000', description: null, memo: 'memo salvo', parentId: null, isCategory: false, sortOrder: 0, createdAt: '', usageCount: 0 }
const category = { ...code, isCategory: true }
const group = { id: 2, guid: 'g', name: 'Grupo', description: null, memo: 'memo do grupo', sortOrder: 0 }
const updateCode = vi.fn()
const updateCollection = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { configurable: true, value: {
    app: { setMemoDirty: vi.fn() },
    codings: { listByCode: vi.fn().mockResolvedValue([]) },
    collections: { members: vi.fn().mockResolvedValue([]) }
  } })
  updateCode.mockResolvedValue(undefined)
  updateCollection.mockResolvedValue(undefined)
  useAppStore.setState({ codes: [code], collections: [group], documents: [], currentDocument: null, updateCode, updateCollection })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each(['código', 'categoria', 'grupo'] as const)('edita o memo dentro da janela de %s', async (kind) => {
  const close = vi.fn()
  if (kind === 'código') render(<CodeQuotationsDialog code={code} onOpenChange={close} />)
  else if (kind === 'categoria') render(<CategoryCodesDialog category={category} onOpenChange={close} />)
  else render(<CollectionMembersDialog collection={group} onOpenChange={close} />)
  await userEvent.click(screen.getByRole('button', { name: /Memo/ }))
  const field = screen.getByLabelText('Texto do memo') as HTMLTextAreaElement
  expect(field.value).toBe(kind === 'grupo' ? 'memo do grupo' : 'memo salvo')
  await userEvent.clear(field)
  await userEvent.type(field, 'novo{enter}memo')
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  await waitFor(() => expect(kind === 'grupo' ? updateCollection : updateCode).toHaveBeenCalledWith({ id: kind === 'grupo' ? 2 : 1, memo: 'novo\nmemo' }))
  expect(screen.queryByLabelText('Texto do memo')).toBeNull()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(close).not.toHaveBeenCalled()
})

it('salva antes de trocar de aba ou fechar a janela', async () => {
  const close = vi.fn()
  render(<CategoryCodesDialog category={category} onOpenChange={close} />)
  await userEvent.click(screen.getByRole('button', { name: /Memo/ }))
  await userEvent.type(screen.getByLabelText('Texto do memo'), ' alterado')
  await userEvent.click(screen.getByRole('button', { name: 'Códigos' }))
  await waitFor(() => expect(updateCode).toHaveBeenCalledWith({ id: 1, memo: 'memo salvo alterado' }))
  await waitFor(() => expect(screen.queryByLabelText('Texto do memo')).toBeNull())
  expect(close).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(close).toHaveBeenCalledWith(false))
})

it('uses Enter to open the Memo tab and closes when undo removes the code', async () => {
  const close = vi.fn()
  const locateOccurrence = vi.fn()
  useAppStore.setState({ locateOccurrence })
  vi.mocked(window.api.codings.listByCode).mockResolvedValue([
    { id: 1, guid: 'q', documentId: 1, codeId: code.id, startPos: 0, endPos: 1,
      createdAt: '', codeName: code.name, codeColor: code.color, text: 'Trecho visível' }
  ])
  const user = userEvent.setup()
  const scrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  try {
    render(<CodeQuotationsDialog code={code} onOpenChange={close} />)
    await screen.findByText('Trecho visível')
    screen.getByRole('button', { name: /Memo/ }).focus()
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Texto do memo')).toBeTruthy()
    expect(locateOccurrence).not.toHaveBeenCalled()

    act(() => useAppStore.setState({ codes: [] }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(close).toHaveBeenCalledWith(false)
    expect(updateCode).not.toHaveBeenCalled()
  } finally {
    Element.prototype.scrollIntoView = scrollIntoView
  }
})

it.each(['categoria', 'grupo'] as const)('preserva o rascunho quando o item de %s desaparece', async (kind) => {
  const close = vi.fn()
  if (kind === 'categoria') render(<CategoryCodesDialog category={category} onOpenChange={close} />)
  else render(<CollectionMembersDialog collection={group} onOpenChange={close} />)
  await userEvent.click(screen.getByRole('button', { name: /Memo/ }))
  const field = screen.getByLabelText('Texto do memo') as HTMLTextAreaElement
  await userEvent.type(field, ' rascunho')
  act(() => useAppStore.setState(kind === 'categoria' ? { codes: [] } : { collections: [] }))
  expect(field.value).toMatch(/rascunho$/)
  expect(field.readOnly).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Descartar rascunho' }))
  expect(close).toHaveBeenCalledWith(false)
  expect(window.api.app.setMemoDirty).toHaveBeenLastCalledWith(false)
  expect(updateCode).not.toHaveBeenCalled()
  expect(updateCollection).not.toHaveBeenCalled()
})

it('navigates quotation results from the search input without moving focus', async () => {
  const locateOccurrence = vi.fn().mockResolvedValue(true)
  useAppStore.setState({ locateOccurrence })
  const quotes = [1, 2].map((id) => ({
    id, guid: String(id), documentId: 1, codeId: code.id, startPos: 0, endPos: 1,
    createdAt: '', codeName: code.name, codeColor: code.color, text: 'Entrevista ' + id
  }))
  vi.mocked(window.api.codings.listByCode).mockResolvedValue(quotes)
  const scrollIntoView = Element.prototype.scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
  const user = userEvent.setup()
  try {
    render(<CodeQuotationsDialog code={code} onOpenChange={vi.fn()} />)
    await screen.findByText('Entrevista 2')
    await user.click(screen.getByRole('button', { name: 'Buscar por documento ou texto do trecho' }))
    const input = screen.getByRole('textbox', { name: 'Nome do documento ou texto do trecho' })
    await user.type(input, 'Entrevista')
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(input)
    await user.keyboard('{Enter}')
    expect(locateOccurrence).toHaveBeenCalledWith(quotes[1])
  } finally {
    Element.prototype.scrollIntoView = scrollIntoView
  }
})
