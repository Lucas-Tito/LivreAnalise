// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'

const original = 'a'.repeat(2000)

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Range.prototype.getBoundingClientRect = vi.fn(() => new DOMRect(0, 0, 100, 20))
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setTextDirty: vi.fn() } } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    currentDocument: { id: 1, guid: 'd', name: 'Entrevista', plainText: original, charCount: original.length, importedAt: '', originalFormat: 'txt', sourceFilename: null }
  })
})

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function openEditor() {
  const { container } = render(<TranscriptPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }))
  const textarea = screen.getByRole('textbox', { name: 'Texto de Entrevista' }) as HTMLTextAreaElement
  const backdrop = container.querySelector('[aria-hidden="true"].overflow-auto') as HTMLDivElement
  // Vinte caracteres por linha de 20px; o topo exibe o caractere 400,
  // parcialmente cortado. A mesma geometria vale após a atualização do texto.
  vi.spyOn(backdrop, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 100))
  vi.mocked(Range.prototype.getBoundingClientRect).mockImplementation(function (this: Range) {
    const startNode = this.startContainer
    const endNode = this.endContainer
    const start = startNode.nodeType === Node.TEXT_NODE
      ? Number(startNode.parentElement?.dataset.pos ?? 0) + this.startOffset : 0
    const end = endNode.nodeType === Node.TEXT_NODE
      ? Number(endNode.parentElement?.dataset.pos ?? 0) + this.endOffset : endNode.textContent!.length
    const firstLine = Math.floor(start / 20)
    const lastLine = Math.floor((Math.max(start + 1, end) - 1) / 20)
    return new DOMRect(0, 100 + firstLine * 20 - backdrop.scrollTop, 400, (lastLine - firstLine + 1) * 20)
  })
  textarea.scrollTop = 407
  fireEvent.scroll(textarea)
  return { textarea, backdrop }
}

function nativeHistory(textarea: HTMLTextAreaElement, backdrop: HTMLDivElement, inputType: string, value: string) {
  fireEvent(textarea, new InputEvent('beforeinput', { bubbles: true, inputType }))
  // Simula a restauração da rolagem antiga pelo Chromium, antes do input.
  textarea.scrollTop = 0
  fireEvent.scroll(textarea)
  expect(backdrop.scrollTop).toBe(0)
  fireEvent.input(textarea, { target: { value, selectionStart: 450, selectionEnd: 450 }, inputType })
}

it.each(['historyUndo', 'historyRedo'])('preserva o trecho visível no %s nativo, sem alterar a seleção', (inputType) => {
  const { textarea, backdrop } = openEditor()
  nativeHistory(textarea, backdrop, inputType, original.slice(0, 450) + '!' + original.slice(450))
  expect(textarea.scrollTop).toBe(407)
  expect(backdrop.scrollTop).toBe(407)
  expect(textarea.selectionStart).toBe(450)
  expect(textarea.selectionEnd).toBe(450)
  expect(useAppStore.getState().textoSujo).toBe(true)
})

it('reposiciona o trecho visível quando o desfazer altera o texto anterior a ele', () => {
  const { textarea, backdrop } = openEditor()
  nativeHistory(textarea, backdrop, 'historyUndo', 'x'.repeat(40) + original)
  expect(textarea.scrollTop).toBe(447)
  expect(backdrop.scrollTop).toBe(447)
})

it('não força a rolagem antiga durante a digitação normal após desfazer', () => {
  const { textarea, backdrop } = openEditor()
  const undone = original + '!'
  nativeHistory(textarea, backdrop, 'historyUndo', undone)
  textarea.scrollTop = 600
  fireEvent.scroll(textarea)
  fireEvent(textarea, new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }))
  fireEvent.input(textarea, { target: { value: undone + '?' }, inputType: 'insertText' })
  expect(textarea.scrollTop).toBe(600)
  expect(backdrop.scrollTop).toBe(600)
})
