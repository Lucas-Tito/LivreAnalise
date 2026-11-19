// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
