// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 100, 28)
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    currentDocument: { id: 1, guid: 'd', name: 'Entrevista', plainText: '🙂\r\npalavra', charCount: 11, importedAt: '', originalFormat: 'txt', sourceFilename: null },
    codes: [{ id: 1, guid: 'c', name: 'Código', color: '#ff0000', description: null, memo: '', parentId: null, sortOrder: 0, createdAt: '', usageCount: 0 }]
  })
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setTextDirty: vi.fn() } } })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('codifica seleção por teclado sem alterar o texto e mapeia CRLF e emoji', async () => {
  const addCoding = vi.fn(async () => {})
  useAppStore.setState({ addCoding })
  const user = userEvent.setup()
  render(<TranscriptPanel />)
  await user.click(screen.getByRole('button', { name: 'Navegar pelo texto' }))
  const reader = screen.getByRole('textbox', { name: /Navegação somente leitura/ }) as HTMLTextAreaElement
  expect(reader.getAttribute('aria-readonly')).toBe('true')
  expect(reader.value).toBe('🙂\npalavra')
  expect(screen.getByText(/Modo de análise — texto protegido/)).toBeTruthy()
  reader.setSelectionRange(3, 10)
  fireEvent.select(reader)
  fireEvent.keyDown(reader, { key: 'Enter', ctrlKey: true })
  expect(screen.getByRole('dialog', { name: 'Codificar trecho' })).toBeTruthy()
  await user.keyboard('{Enter}')
  await waitFor(() => expect(addCoding).toHaveBeenCalledWith(1, 4, 11))
  await waitFor(() => expect(document.activeElement).toBe(reader))
  expect(reader.selectionStart).toBe(10)
  expect(reader.selectionEnd).toBe(10)
})

it('usa a coluna de texto e a altura visível do painel para posicionar o leitor', async () => {
  const user = userEvent.setup()
  const { container } = render(<TranscriptPanel />)
  const viewport = container.querySelector('div.h-full.overflow-auto') as HTMLElement
  Object.defineProperty(viewport, 'clientHeight', { value: 300 })
  await user.click(screen.getByRole('button', { name: 'Navegar pelo texto' }))

  const reader = screen.getByRole('textbox', { name: /Navegação somente leitura/ }) as HTMLTextAreaElement
  expect(reader.closest('.transcript')).toBe(viewport.querySelector('.transcript'))
  expect(reader.style.height).toBe('300px')
  expect(reader.classList.contains('w-full')).toBe(true)
})

it('bloqueia alterações e recupera o foco e a seleção ao reativar a navegação', async () => {
  const user = userEvent.setup()
  render(<TranscriptPanel />)
  const button = screen.getByRole('button', { name: 'Navegar pelo texto' })
  await user.click(button)
  const reader = screen.getByRole('textbox', { name: /Navegação somente leitura/ }) as HTMLTextAreaElement
  reader.setSelectionRange(3, 7)
  fireEvent.select(reader)
  const beforeInput = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: 'x' })
  expect(reader.dispatchEvent(beforeInput)).toBe(false)
  await user.type(reader, 'x{Backspace}')
  expect(reader.value).toBe('🙂\npalavra')
  reader.setSelectionRange(3, 7)
  fireEvent.select(reader)
  await user.click(button)
  expect(document.activeElement).toBe(reader)
  expect([reader.selectionStart, reader.selectionEnd]).toEqual([3, 7])
})

it('Escape no menu restaura a seleção; Escape na leitura sai do modo', async () => {
  const user = userEvent.setup()
  render(<TranscriptPanel />)
  await user.click(screen.getByRole('button', { name: 'Navegar pelo texto' }))
  const reader = screen.getByRole('textbox', { name: /Navegação somente leitura/ }) as HTMLTextAreaElement
  reader.setSelectionRange(3, 7)
  fireEvent.select(reader)
  fireEvent.keyDown(reader, { key: 'Enter', ctrlKey: true })
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(reader))
  expect(reader.selectionStart).toBe(3)
  expect(reader.selectionEnd).toBe(7)
  await act(async () => { await user.keyboard('{Escape}') })
  expect(screen.queryByRole('textbox', { name: /Navegação somente leitura/ })).toBeNull()
})

it('Ctrl+E continua disponível a partir da leitura protegida', async () => {
  const user = userEvent.setup()
  render(<TranscriptPanel />)
  await user.click(screen.getByRole('button', { name: 'Navegar pelo texto' }))
  fireEvent.keyDown(screen.getByRole('textbox', { name: /Navegação somente leitura/ }), { key: 'e', ctrlKey: true })
  expect(screen.getByRole('textbox', { name: 'Texto de Entrevista' })).toBeTruthy()
})
