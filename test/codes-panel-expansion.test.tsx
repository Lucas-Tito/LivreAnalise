// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { CodesPanel } from '../src/renderer/src/components/workspace/CodesPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { CodeWithCount } from '../src/shared/types'

const category: CodeWithCount = {
  id: 1, guid: 'category', name: 'Categoria no grupo', color: '#000000',
  description: null, parentId: null, isCategory: true, sortOrder: 0,
  createdAt: '', usageCount: 0
}
const child: CodeWithCount = {
  ...category, id: 2, guid: 'child', name: 'Código no grupo', parentId: 1, isCategory: false
}
const looseCategory: CodeWithCount = {
  ...category, id: 3, guid: 'loose-category', name: 'Categoria sem grupo'
}
const looseChild: CodeWithCount = {
  ...child, id: 4, guid: 'loose-child', name: 'Código sem grupo', parentId: 3
}

beforeEach(() => {
  useAppStore.setState({
    codes: [category, child, looseCategory, looseChild],
    collections: [{ id: 1, guid: 'group', name: 'Grupo', description: null, sortOrder: 0 }],
    collectionMembers: [{ collectionId: 1, codeId: 1 }]
  })
})
afterEach(cleanup)

it('collapses and expands groups and categories, including categories inside groups', async () => {
  render(<CodesPanel onViewCode={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Recolher tudo' }))
  expect(screen.queryByText('Categoria no grupo')).toBeNull()
  expect(screen.queryByText('Código no grupo')).toBeNull()
  expect(screen.queryByText('Código sem grupo')).toBeNull()
  expect(screen.getByText('Categoria sem grupo')).toBeTruthy()

  // Abrir só o grupo não deve abrir também sua categoria.
  await userEvent.click(screen.getByRole('button', { name: 'Expandir Grupo' }))
  expect(screen.getByText('Categoria no grupo')).toBeTruthy()
  expect(screen.queryByText('Código no grupo')).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: 'Expandir tudo' }))
  expect(screen.getByText('Código no grupo')).toBeTruthy()
  expect(screen.getByText('Código sem grupo')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Recolher tudo' })).toBeTruthy()
})

it('offers expand all when just one group is collapsed', async () => {
  render(<CodesPanel onViewCode={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Recolher Grupo' }))
  await userEvent.click(screen.getByRole('button', { name: 'Expandir tudo' }))
  expect(screen.getByText('Código no grupo')).toBeTruthy()
  expect(screen.getByText('Código sem grupo')).toBeTruthy()
})

it('keeps search results expanded and restores collapsed state after search', async () => {
  render(<CodesPanel onViewCode={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Recolher tudo' }))
  await userEvent.click(screen.getByRole('button', { name: 'Buscar código, categoria ou grupo' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Código, categoria ou grupo' }), 'Código')
  expect(screen.getByText('Código no grupo')).toBeTruthy()
  expect(screen.getByText('Código sem grupo')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Expandir tudo' }) as HTMLButtonElement).disabled).toBe(true)

  await userEvent.click(screen.getByRole('button', { name: 'Fechar a busca' }))
  expect(screen.queryByText('Código no grupo')).toBeNull()
  expect(screen.queryByText('Código sem grupo')).toBeNull()
  expect((screen.getByRole('button', { name: 'Expandir tudo' }) as HTMLButtonElement).disabled).toBe(false)
})

it('disables the button when there are no groups or categories to collapse', () => {
  useAppStore.setState({ codes: [{ ...child, parentId: null }], collections: [], collectionMembers: [] })
  render(<CodesPanel onViewCode={() => {}} />)
  expect((screen.getByRole('button', { name: 'Recolher tudo' }) as HTMLButtonElement).disabled).toBe(true)
})
