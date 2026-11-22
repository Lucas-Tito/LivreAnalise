// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { NotesPanel } from '../src/renderer/src/components/workspace/NotesPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { Note } from '../src/shared/types'

const text = 'a'.repeat(2000)
const note: Note = {
  id: 1, guid: 'n', scope: 'excerpt', documentId: 1, title: null, body: '',
  startPos: 440, endPos: 450, anchorStatus: 'attached', anchorText: text.slice(440, 450),
  createdAt: '', updatedAt: ''
}

function Reader() {
  const open = useAppStore((s) => s.notesPanelOpen)
  return <><TranscriptPanel />{open && <NotesPanel />}</>
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setTextDirty: vi.fn() } } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    currentDocument: { id: 1, guid: 'd', name: 'Entrevista', plainText: text, charCount: text.length, importedAt: '', originalFormat: 'txt', sourceFilename: null }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 100))
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = function () {
    const node = this.startContainer
    const parent = node instanceof HTMLElement ? node : node.parentElement!
    const scroller = parent.closest('.overflow-auto')
    const start = node.nodeType === Node.TEXT_NODE ? Number(parent.dataset.pos ?? 0) + this.startOffset : 0
    const end = this.endContainer.nodeType === Node.TEXT_NODE
      ? Number(this.endContainer.parentElement?.dataset.pos ?? 0) + this.endOffset : this.endContainer.textContent!.length
    // A geometria depende do DOM já renderizado, não do estado do store.
    const width = screen.queryByRole('button', { name: 'Fechar painel de notas' }) ? 10 : 20
    const first = Math.floor(start / width)
    const last = Math.floor((Math.max(start + 1, end) - 1) / width)
    return new DOMRect(0, 100 + first * 20 - (scroller?.scrollTop ?? 0), 400, (last - first + 1) * 20)
  }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('preserva o trecho visível ao abrir e fechar a lista de notas', async () => {
  const { container } = render(<Reader />)
  const scroller = container.querySelector('.overflow-auto') as HTMLElement
  scroller.scrollTop = 407
  await act(async () => { await useAppStore.getState().toggleNotesPanel() })
  expect(scroller.scrollTop).toBe(807)
  await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }) })
  expect(scroller.scrollTop).toBe(407)
})

it('mantém o trecho recém-anotado na mesma altura, não apenas a primeira linha', async () => {
  useAppStore.setState({ createNote: async () => {
    useAppStore.setState({ documentNotes: [note] })
    return note
  } })
  const { container } = render(<Reader />)
  const scroller = container.querySelector('.overflow-auto') as HTMLElement
  scroller.scrollTop = 407
  const span = container.querySelector('[data-pos="0"]')!
  const range = document.createRange()
  range.setStart(span.firstChild!, 440)
  range.setEnd(span.firstChild!, 450)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  fireEvent.mouseUp(span)
  await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'Adicionar nota ao trecho' })) })
  expect(useAppStore.getState().editorNoteId).toBe(note.id)
  expect(scroller.scrollTop).toBe(847)
  await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }) })
  expect(scroller.scrollTop).toBe(407)
})

it('preserva a rolagem do editor ao abrir e fechar as notas sem mudar a seleção', async () => {
  render(<Reader />)
  fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }))
  const field = screen.getByRole('textbox', { name: 'Texto de Entrevista' }) as HTMLTextAreaElement
  field.scrollTop = 407
  field.setSelectionRange(500, 510)
  fireEvent.scroll(field)
  await act(async () => { await useAppStore.getState().toggleNotesPanel() })
  expect(field.scrollTop).toBe(807)
  expect([field.selectionStart, field.selectionEnd]).toEqual([500, 510])
  await act(async () => { fireEvent.keyDown(field, { key: 'Escape' }) })
  expect(field.scrollTop).toBe(407)
})

it('ao fechar as notas após rolar o documento, mantém a leitura atual em vez de voltar à nota', async () => {
  useAppStore.setState({ documentNotes: [note], editorNoteId: note.id, notesPanelOpen: true })
  const { container } = render(<Reader />)
  const scroller = container.querySelector('.overflow-auto') as HTMLElement
  scroller.scrollTop = 1207
  await act(async () => { fireEvent.keyDown(document.body, { key: 'Escape' }) })
  expect(scroller.scrollTop).toBe(607)
})

it('Esc fecha primeiro o seletor de códigos sobreposto, sem fechar as notas', async () => {
  useAppStore.setState({ notesPanelOpen: true })
  const { container } = render(<Reader />)
  const span = container.querySelector('[data-pos="0"]')!
  const range = document.createRange()
  range.setStart(span.firstChild!, 0)
  range.setEnd(span.firstChild!, 10)
  window.getSelection()!.removeAllRanges()
  window.getSelection()!.addRange(range)
  fireEvent.mouseUp(span)
  const input = screen.getByPlaceholderText('Buscar ou criar código...')
  await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }) })
  expect(screen.queryByPlaceholderText('Buscar ou criar código...')).toBeNull()
  expect(useAppStore.getState().notesPanelOpen).toBe(true)
})
