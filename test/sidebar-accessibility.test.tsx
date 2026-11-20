// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { Sidebar } from '../src/renderer/src/components/workspace/Sidebar'
vi.mock('../src/renderer/src/components/workspace/DocumentsPanel', () => ({ DocumentsPanel: () => null }))
vi.mock('../src/renderer/src/components/workspace/CodesPanel', () => ({ CodesPanel: () => null }))
afterEach(() => { cleanup(); localStorage.clear() })

it('allows resizing and persists the width using only the keyboard', async () => {
  render(<Sidebar onViewCode={() => {}} />)
  const separator = screen.getByRole('separator', { name: 'Largura da barra lateral' })
  separator.focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(separator.getAttribute('aria-valuenow')).toBe('304')
  expect(localStorage.getItem('sidebarWidth')).toBe('304')
  await userEvent.keyboard('{Home}')
  expect(separator.getAttribute('aria-valuenow')).toBe('220')
})
