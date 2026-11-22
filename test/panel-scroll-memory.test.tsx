// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Sidebar } from '../src/renderer/src/components/workspace/Sidebar'
import { NotesPanel } from '../src/renderer/src/components/workspace/NotesPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { Note } from '../src/shared/types'

const note: Note = {
  id: 1, guid: 'n', scope: 'project', documentId: null, title: 'Minha nota', body: 'Conteúdo',
  startPos: null, endPos: null, anchorStatus: 'attached', anchorText: null,
  createdAt: '', updatedAt: ''
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setNotesDirty: vi.fn() } } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

it('mantém posições independentes ao alternar entre Documentos e Códigos', async () => {
  const { container } = render(<Sidebar onViewCode={() => {}} />)
  const documents = container.querySelector('.overflow-auto') as HTMLElement
  documents.scrollTop = 480
  fireEvent.scroll(documents)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Códigos', exact: true })) })
  const codes = container.querySelector('[data-code-root]') as HTMLElement
  codes.scrollTop = 720
  fireEvent.scroll(codes)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Documentos', exact: true })) })
  expect((container.querySelector('.overflow-auto') as HTMLElement).scrollTop).toBe(480)
  expect(container.querySelector('[data-code-root]')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Códigos', exact: true })) })
  expect((container.querySelector('[data-code-root]') as HTMLElement).scrollTop).toBe(720)
})

it('restaura a posição da lista de notas ao abrir uma nota e voltar, inclusive repetidamente', async () => {
  useAppStore.setState({ projectNotes: [note] })
  const { container } = render(<NotesPanel />)
  for (const top of [480, 720]) {
    const list = container.querySelector('.space-y-4.overflow-auto') as HTMLElement
    list.scrollTop = top
    fireEvent.scroll(list)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Minha nota/ })) })
    expect(screen.getByRole('textbox', { name: 'Conteúdo da nota' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Voltar' })) })
    expect((container.querySelector('.space-y-4.overflow-auto') as HTMLElement).scrollTop).toBe(top)
  }
})
