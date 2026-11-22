// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CodingPopover } from '../src/renderer/src/components/workspace/CodingPopover'
import { useAppStore } from '../src/renderer/src/stores/appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    codes: [
      { id: 1, guid: 'a', name: 'Primeiro', color: '#ff0000', description: null, memo: '', parentId: null, sortOrder: 0, createdAt: '', usageCount: 0 },
      { id: 2, guid: 'b', name: 'Último', color: '#00ff00', description: null, memo: '', parentId: null, sortOrder: 1, createdAt: '', usageCount: 0 }
    ],
    lastUsedCodeId: 2
  })
})
afterEach(() => cleanup())

it('aplica o último código apresentado primeiro e percorre as ações com setas', async () => {
  const apply = vi.fn()
  const note = vi.fn()
  const user = userEvent.setup()
  render(<CodingPopover x={10} y={10} onClose={vi.fn()} onApply={apply} onCreate={vi.fn()} selectedText="trecho" onAddNote={note} />)
  const input = screen.getByRole('combobox')
  expect(input.getAttribute('aria-activedescendant')).toBe('coding-option-0')
  expect(screen.getAllByRole('option')[0].textContent).toContain('Último')
  await user.keyboard('{Enter}')
  expect(apply).toHaveBeenCalledWith(2)
  await user.keyboard('{ArrowDown}{Enter}')
  expect(apply).toHaveBeenCalledWith(1)
  await user.keyboard('{ArrowDown}{Enter}')
  expect(note).toHaveBeenCalledOnce()
})

it('permite criar código pelo filtro e mantém Escape disponível', async () => {
  const create = vi.fn()
  const close = vi.fn()
  const user = userEvent.setup()
  render(<CodingPopover x={10} y={10} onClose={close} onApply={vi.fn()} onCreate={create} selectedText="trecho" />)
  await user.type(screen.getByRole('combobox'), 'novo{Enter}')
  expect(create).toHaveBeenCalledWith('novo')
  await user.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
})

it('não cria uma nota por padrão se não houver código aplicável', async () => {
  const note = vi.fn()
  const user = userEvent.setup()
  useAppStore.setState({ codes: [], lastUsedCodeId: null })
  render(<CodingPopover x={10} y={10} onClose={vi.fn()} onApply={vi.fn()} onCreate={vi.fn()} selectedText="trecho" onAddNote={note} />)
  await user.keyboard('{Enter}')
  expect(note).not.toHaveBeenCalled()
  await user.keyboard('{ArrowDown}{Enter}')
  expect(note).toHaveBeenCalledOnce()
})
