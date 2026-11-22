// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Workspace } from '../src/renderer/src/components/workspace/Workspace'
import { useAppStore } from '../src/renderer/src/stores/appStore'

vi.mock('../src/renderer/src/components/workspace/TopBar', () => ({ TopBar: () => <button>Barra</button> }))
vi.mock('../src/renderer/src/components/workspace/Sidebar', () => ({
  Sidebar: () => <>
    <button>Lateral</button>
    <button key={sidebarRevision} data-focus-key="sidebar-other">Outro lateral</button>
  </>
}))
vi.mock('../src/renderer/src/components/workspace/TranscriptPanel', () => ({ TranscriptPanel: () => <button data-area-default>Documento</button> }))
vi.mock('../src/renderer/src/components/workspace/NotesPanel', () => ({ NotesPanel: () => <button>Notas</button> }))
vi.mock('../src/renderer/src/components/workspace/CodeQuotationsDialog', () => ({ CodeQuotationsDialog: () => null }))
vi.mock('../src/renderer/src/components/workspace/UnsavedTextDialog', () => ({ UnsavedTextDialog: () => null }))

let sidebarRevision = 0
beforeEach(() => {
  sidebarRevision = 0
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { onCloseRequested: () => () => {} } } })
})

it('F6 encontra o mesmo controle pelo identificador depois de remontado', () => {
  const { rerender } = render(<Workspace />)
  const previous = screen.getByRole('button', { name: 'Outro lateral' })
  previous.focus()
  fireEvent.keyDown(window, { key: 'F6' })
  sidebarRevision++
  rerender(<Workspace />)
  const replacement = screen.getByRole('button', { name: 'Outro lateral' })
  expect(replacement).not.toBe(previous)
  fireEvent.keyDown(window, { key: 'F6', shiftKey: true })
  expect(document.activeElement).toBe(replacement)
})
afterEach(cleanup)

it('F6 alterna as áreas e retorna ao último controle de cada uma', () => {
  useAppStore.setState({ notesPanelOpen: true })
  render(<Workspace />)
  screen.getByRole('button', { name: 'Outro lateral' }).focus()
  fireEvent.keyDown(window, { key: 'F6' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Documento' }))
  fireEvent.keyDown(window, { key: 'F6' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Notas' }))
  fireEvent.keyDown(window, { key: 'F6', shiftKey: true })
  fireEvent.keyDown(window, { key: 'F6', shiftKey: true })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outro lateral' }))
})

it('Ctrl+P abre a busca e F6 não atravessa o diálogo', () => {
  render(<Workspace />)
  screen.getByRole('button', { name: 'Lateral' }).focus()
  fireEvent.keyDown(window, { key: 'p', ctrlKey: true })
  const search = screen.getByRole('combobox', { name: 'Buscar documento' })
  expect(document.activeElement).toBe(search)
  fireEvent.keyDown(search, { key: 'F6' })
  expect(document.activeElement).toBe(search)
})
