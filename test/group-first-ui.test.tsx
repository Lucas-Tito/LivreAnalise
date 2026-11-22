// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { CodesPanel } from '../src/renderer/src/components/workspace/CodesPanel'
import { CollectionMembersDialog } from '../src/renderer/src/components/workspace/CollectionMembersDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('creates an empty group from the code panel context menu', async () => {
  const createCollection = vi.fn().mockResolvedValue({ id: 1, name: 'Objetivo' })
  useAppStore.setState({ codes: [], collections: [], collectionMembers: [], createCollection })
  const { container } = render(<CodesPanel onViewCode={() => {}} />)
  fireEvent.contextMenu(container.querySelector('[data-code-root]')!)
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Novo grupo' }))
  await userEvent.type(screen.getByLabelText('Nome do grupo'), 'Objetivo')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(createCollection).toHaveBeenCalledWith({ name: 'Objetivo' }))
})

it('creates an empty category from the code panel context menu', async () => {
  const createCode = vi.fn().mockResolvedValue({ id: 1, name: 'Tema' })
  useAppStore.setState({ codes: [], collections: [], collectionMembers: [], createCode })
  const { container } = render(<CodesPanel onViewCode={() => {}} />)
  fireEvent.contextMenu(container.querySelector('[data-code-root]')!)
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Nova categoria' }))
  await userEvent.type(screen.getByLabelText('Nome da categoria'), 'Tema')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(createCode).toHaveBeenCalledWith(expect.objectContaining({ name: 'Tema', isCategory: true })))
})

it('allows viewing citations on a code that became a category', async () => {
  const parent = { id: 2, guid: 'parent', name: 'Categoria', color: '#000000', description: null,
    parentId: null, isCategory: true, sortOrder: 0, createdAt: '', usageCount: 1 }
  const child = { ...parent, id: 3, guid: 'child', name: 'Filho', parentId: 2, isCategory: false, usageCount: 0 }
  const onViewCode = vi.fn()
  useAppStore.setState({ codes: [parent, child], collections: [], collectionMembers: [] })
  render(<CodesPanel onViewCode={onViewCode} />)
  await userEvent.click(screen.getByRole('button', { name: 'Ações de Categoria' }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Ver trechos' }))
  expect(onViewCode).toHaveBeenCalledWith(parent, screen.getByRole('treeitem', { name: 'Categoria' }))
})

it('offers loose codes for membership in an empty group', async () => {
  const addCollectionMember = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({
    codes: [{ id: 2, guid: 'code', name: 'Código solto', color: '#000000', description: null,
      parentId: null, sortOrder: 0, createdAt: '', usageCount: 0 }],
    collections: [{ id: 1, guid: 'group', name: 'Objetivo', description: null, sortOrder: 0 }],
    addCollectionMember
  })
  Object.assign(window, { api: { collections: { members: vi.fn().mockResolvedValue([]) } } })
  render(<CollectionMembersDialog collection={{ id: 1, guid: 'group', name: 'Objetivo', description: null, sortOrder: 0 }} onOpenChange={() => {}} />)
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Código solto' }))
  await waitFor(() => expect(addCollectionMember).toHaveBeenCalledWith(1, 2))
})

it('adds a category created from a grouped code to that group', async () => {
  const createGroup = vi.fn().mockResolvedValue({ id: 3, name: 'Categoria' })
  const addCollectionMember = vi.fn().mockResolvedValue(undefined)
  useAppStore.setState({
    codes: [{ id: 2, guid: 'code', name: 'Código solto', color: '#000000', description: null,
      parentId: null, sortOrder: 0, createdAt: '', usageCount: 0 }],
    collections: [{ id: 1, guid: 'group', name: 'Objetivo', description: null, sortOrder: 0 }],
    collectionMembers: [{ collectionId: 1, codeId: 2 }],
    createGroup,
    addCollectionMember
  })
  const { container } = render(<CodesPanel onViewCode={() => {}} />)
  fireEvent.contextMenu(container.querySelector('[data-code-row="2"]')!)
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Criar categoria com este código' }))
  await userEvent.type(screen.getByLabelText('Nome da categoria'), 'Categoria')
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  await waitFor(() => expect(createGroup).toHaveBeenCalledWith({ name: 'Categoria', color: '#000000', codeId: 2, collectionId: 1 }))
  expect(addCollectionMember).not.toHaveBeenCalled()
})

class TestPointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}

it.each(['código', 'categoria', 'categoria e filho (filho selecionado primeiro)', 'categoria e filho (categoria selecionada primeiro)'])('adds a dragged %s to the group without changing its parent', async (kind) => {
  const addCollectionMember = vi.fn().mockResolvedValue(undefined)
  const moveCodes = vi.fn()
  const code = { id: 2, guid: 'code', name: 'Item', color: '#000000', description: null,
    parentId: null, sortOrder: 0, createdAt: '', usageCount: 1 }
  const child = { ...code, id: 3, guid: 'child', name: 'Filho', parentId: 2 }
  useAppStore.setState({
    codes: kind === 'código' ? [code] : [{ ...code, isCategory: true }, child],
    collections: [{ id: 1, guid: 'group', name: 'Objetivo', description: null, sortOrder: 0 }],
    collectionMembers: [], addCollectionMember, moveCodes
  })
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  try {
    const { container } = render(<CodesPanel onViewCode={() => {}} />)
    const row = container.querySelector('[data-code-row="2"]')!
    if (kind.startsWith('categoria e filho')) {
      const child = container.querySelector('[data-code-row="3"]')!
      const order = kind.includes('filho selecionado') ? [child, row] : [row, child]
      for (const item of order) fireEvent.click(item, { ctrlKey: true })
    }
    const group = container.querySelector('[data-collection-row="1"]')!
    vi.stubGlobal('document', document)
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [group] })
    fireEvent.pointerDown(row, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 })
    expect(screen.getByRole('status').textContent).toContain('Adicionar ao grupo')
    fireEvent.pointerUp(window, { pointerId: 1, pointerType: 'mouse', clientX: 50, clientY: 50 })
    await waitFor(() => expect(addCollectionMember).toHaveBeenCalledWith(1, 2))
    expect(addCollectionMember).toHaveBeenCalledTimes(1)
    expect(moveCodes).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
    delete (document as Document & { elementsFromPoint?: unknown }).elementsFromPoint
  }
})

it('creates a category in the group where a code is dropped on another code', async () => {
  const createGroupFrom = vi.fn().mockResolvedValue({ id: 4 })
  const code = { id: 2, guid: 'left', name: 'Primeiro', color: '#000000', description: null,
    parentId: null, sortOrder: 0, createdAt: '', usageCount: 0 }
  useAppStore.setState({
    codes: [code, { ...code, id: 3, guid: 'right', name: 'Segundo' }],
    collections: [{ id: 1, guid: 'group', name: 'Objetivo', description: null, sortOrder: 0 }],
    collectionMembers: [{ collectionId: 1, codeId: 2 }, { collectionId: 1, codeId: 3 }],
    createGroupFrom
  })
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  try {
    const { container } = render(<CodesPanel onViewCode={() => {}} />)
    const first = container.querySelector('[data-code-row="2"]')!
    const second = container.querySelector('[data-code-row="3"]')!
    Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [second] })
    fireEvent.pointerDown(first, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 50, clientY: 50 })
    fireEvent.pointerUp(window, { clientX: 50, clientY: 50 })
    await userEvent.type(screen.getByLabelText('Nome da categoria'), 'Categoria')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(createGroupFrom).toHaveBeenCalledWith({
      name: 'Categoria', color: '#000000', codeIds: [2, 3], collectionId: 1
    }))
  } finally {
    vi.unstubAllGlobals()
    delete (document as Document & { elementsFromPoint?: unknown }).elementsFromPoint
  }
})
