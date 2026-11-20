// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NotesPanel } from '../src/renderer/src/components/workspace/NotesPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { Note, UpdateNoteInput } from '../src/shared/types'

const note: Note = {
  id: 1, guid: 'n', scope: 'project', documentId: null, title: null, body: '',
  startPos: null, endPos: null, anchorStatus: 'attached', anchorText: null,
  createdAt: '2026-10-16', updatedAt: '2026-10-16'
}
beforeEach(() => {
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setNotesDirty: vi.fn() } } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ projectNotes: [note], editorNoteId: note.id, notesPanelOpen: true })
})
afterEach(cleanup)

it('flushes the newest draft even when a previous save is still in flight', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const writes: string[] = []
  useAppStore.setState({ updateNote: async (input) => {
    writes.push(input.body!)
    if (writes.length === 1) await gate
    return { ...note, title: input.title ?? null, body: input.body! }
  } })
  const user = userEvent.setup()
  render(<NotesPanel />)
  const input = screen.getByRole('textbox', { name: 'Conteúdo da nota' })
  await user.type(input, 'primeira')
  let flushing!: Promise<void>
  act(() => { flushing = useAppStore.getState().notesFlush!() })
  await user.type(input, ' e última')
  await act(async () => { release(); await flushing })
  expect(writes).toEqual(['primeira', 'primeira e última'])
  expect(useAppStore.getState().notasSujo).toBe(false)
  expect(screen.getByRole('status').textContent).toBe('Salvo')
})

it('keeps a note open with its draft when leaving cannot save it', async () => {
  useAppStore.setState({ updateNote: async () => { throw new Error('disco cheio') } })
  render(<NotesPanel />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo da nota' }), 'não perder')
  await act(async () => {
    await expect(useAppStore.getState().toggleNotesPanel()).rejects.toThrow('disco cheio')
  })
  expect(useAppStore.getState().notesPanelOpen).toBe(true)
  expect(useAppStore.getState().notasSujo).toBe(true)
  expect((screen.getByRole('textbox', { name: 'Conteúdo da nota' }) as HTMLTextAreaElement).value).toBe('não perder')
  expect(screen.getByText('disco cheio')).toBeTruthy()
})

it('clears pending-note state when its document is deleted', async () => {
  Object.assign(window.api, {
    documents: { delete: vi.fn(async () => {}), list: async () => [] },
    notes: { listProject: async () => [] },
    codes: { list: async () => [] },
    history: { state: async () => ({}) },
    project: { close: async () => {}, recents: async () => [] }
  })
  useAppStore.setState({
    projectNotes: [], documentNotes: [{ ...note, scope: 'document', documentId: 1 }],
    currentDocument: { id: 1, plainText: 'texto' } as any
  })
  render(<NotesPanel />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Conteúdo da nota' }), 'rascunho')
  expect(useAppStore.getState().notasSujo).toBe(true)
  await act(async () => { await useAppStore.getState().deleteDocument(1) })
  expect(useAppStore.getState().notesFlush).toBeNull()
  expect(useAppStore.getState().notasSujo).toBe(false)
  expect(window.api.app.setNotesDirty).toHaveBeenLastCalledWith(false)
  await act(async () => { await useAppStore.getState().closeProject() })
  expect(useAppStore.getState().notasSujo).toBe(false)
})

it('retains unsaved text after an unguarded unmount and retries on remount', async () => {
  const write = vi.fn<(input: UpdateNoteInput) => Promise<Note>>()
    .mockRejectedValue(new Error('disco cheio'))
  useAppStore.setState({ updateNote: write })
  const user = userEvent.setup()
  const editor = render(<NotesPanel />)
  await user.type(screen.getByRole('textbox', { name: 'Conteúdo da nota' }), 'rascunho')
  editor.unmount()
  await act(async () => {
    await expect(useAppStore.getState().notesFlush?.()).rejects.toThrow('disco cheio')
  })
  expect(useAppStore.getState().notasSujo).toBe(true)

  write.mockResolvedValueOnce({ ...note, body: 'rascunho' })
  render(<NotesPanel />)
  const body = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Conteúdo da nota' })
  expect(body.value).toBe('rascunho')
  await act(async () => { await useAppStore.getState().notesFlush?.() })
  expect(useAppStore.getState().notasSujo).toBe(false)
  expect(screen.getByRole('status').textContent).toBe('Salvo')
})

it('blocks note edits between the last save and project close', async () => {
  let completeClose!: () => void
  const closing = new Promise<void>((resolve) => { completeClose = resolve })
  const close = vi.fn(() => closing)
  Object.assign(window.api, { project: { close, recents: async () => [] } })
  const updateNote = vi.fn(async (input: UpdateNoteInput) => ({ ...note, body: input.body! }))
  useAppStore.setState({ updateNote })
  const user = userEvent.setup()
  render(<NotesPanel />)
  const input = screen.getByRole('textbox', { name: 'Conteúdo da nota' }) as HTMLTextAreaElement
  await user.type(input, 'texto salvo')
  let transition!: Promise<void>
  await act(async () => { transition = useAppStore.getState().closeProject() })
  expect(close).toHaveBeenCalledOnce()
  expect(input.readOnly).toBe(true)
  await user.type(input, ' edição tardia')
  expect(input.value).toBe('texto salvo')
  await act(async () => { completeClose(); await transition })
  expect(updateNote).toHaveBeenCalledTimes(1)
  expect(useAppStore.getState().notasSujo).toBe(false)
  expect(window.api.app.setNotesDirty).toHaveBeenLastCalledWith(false)
})
