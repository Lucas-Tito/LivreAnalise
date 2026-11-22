// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { UnsavedTextDialog } from '../src/renderer/src/components/workspace/UnsavedTextDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

const original = 'a'.repeat(2000)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setTextDirty: vi.fn() } } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    currentDocument: { id: 1, guid: 'd', name: 'Entrevista', plainText: original, charCount: original.length, importedAt: '', originalFormat: 'txt', sourceFilename: null },
    updateDocumentText: async (_id, plainText) => {
      useAppStore.setState({ currentDocument: { ...useAppStore.getState().currentDocument!, plainText } })
    }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 100))
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = function () {
    const startNode = this.startContainer
    const parent = startNode instanceof HTMLElement ? startNode : startNode.parentElement!
    const scroller = parent.closest('.overflow-auto')!
    const start = startNode.nodeType === Node.TEXT_NODE ? Number(parent.dataset.pos ?? 0) + this.startOffset : 0
    const end = this.endContainer.nodeType === Node.TEXT_NODE
      ? Number(this.endContainer.parentElement?.dataset.pos ?? 0) + this.endOffset : this.endContainer.textContent!.length
    const firstLine = Math.floor(start / 20)
    const lastLine = Math.floor((Math.max(start + 1, end) - 1) / 20)
    return new DOMRect(0, 100 + firstLine * 20 - (scroller?.scrollTop ?? 0), 400, (lastLine - firstLine + 1) * 20)
  }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function openEditor(dirty = true) {
  const { container } = render(<><TranscriptPanel /><UnsavedTextDialog /></>)
  const reading = container.querySelector('.overflow-auto') as HTMLElement
  reading.scrollTop = 407
  fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }))
  const field = screen.getByRole('textbox', { name: 'Texto de Entrevista' }) as HTMLTextAreaElement
  expect(field.scrollTop).toBe(407)
  if (dirty) {
    fireEvent.change(field, { target: { value: 'x'.repeat(40) + original } })
    field.scrollTop = 447
    fireEvent.scroll(field)
  }
  return { container, field }
}

it('Cancelar → Descartar volta ao mesmo trecho, mapeando a edição anterior a ele', async () => {
  const { container } = openEditor()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true })) })
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descartar' })) })
  expect(screen.queryByRole('textbox', { name: 'Texto de Entrevista' })).toBeNull()
  expect((container.querySelector('.overflow-auto') as HTMLElement).scrollTop).toBe(407)
  expect(useAppStore.getState().currentDocument?.plainText).toBe(original)
  expect(useAppStore.getState().textoSujo).toBe(false)
})

it('Continuar editando mantém o rascunho e sua posição', async () => {
  const { field } = openEditor()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' })) })
  expect(screen.getByRole('textbox', { name: 'Texto de Entrevista' })).toBe(field)
  expect(field.scrollTop).toBe(447)
  expect(field.value).toBe('x'.repeat(40) + original)
})

it('Cancelar → Salvar preserva a posição do texto salvo, sem remapeá-la para o original', async () => {
  const { container } = openEditor()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true })) })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar', exact: true })) })
  expect((container.querySelector('.overflow-auto') as HTMLElement).scrollTop).toBe(447)
  expect(useAppStore.getState().currentDocument?.plainText).toBe('x'.repeat(40) + original)
})

it('cancelar sem alterações também preserva a posição e não abre confirmação', async () => {
  const { container } = openEditor(false)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true })) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect((container.querySelector('.overflow-auto') as HTMLElement).scrollTop).toBe(407)
})
