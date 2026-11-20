// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 100, 28)
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setTextDirty: vi.fn() } } })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    currentDocument: { id: 1, guid: 'd', name: 'Entrevista', plainText: 'original', charCount: 8, importedAt: '', originalFormat: 'txt', sourceFilename: null },
    updateDocumentText: async () => { throw new Error('disco cheio') }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the edited text and shows an actionable error if saving fails', async () => {
  const user = userEvent.setup()
  render(<TranscriptPanel />)
  await user.click(screen.getByRole('button', { name: 'Editar texto' }))
  const input = screen.getByRole('textbox', { name: 'Texto de Entrevista' }) as HTMLTextAreaElement
  await user.clear(input)
  await user.type(input, 'rascunho preservado')
  await user.click(screen.getByRole('button', { name: 'Salvar texto' }))
  expect((await screen.findByRole('alert')).textContent).toContain('disco cheio')
  expect(input.value).toBe('rascunho preservado')
  expect(useAppStore.getState().textoSujo).toBe(true)
})

it('does not save browser line-ending normalization as document edits', async () => {
  const original = 'primeira linha\r\nsim\r\nterceira linha\r\nfim'
  const save = vi.fn(async () => {})
  useAppStore.setState({
    currentDocument: { ...useAppStore.getState().currentDocument!, plainText: original },
    updateDocumentText: save
  })
  const user = userEvent.setup()
  render(<TranscriptPanel />)
  await user.click(screen.getByRole('button', { name: 'Editar texto' }))
  const input = screen.getByRole('textbox', { name: 'Texto de Entrevista' })
  await user.click(input)
  await user.keyboard('{Control>}{End}{/Control}!')
  await user.click(screen.getByRole('button', { name: 'Salvar texto' }))
  expect(save).toHaveBeenCalledWith(1, original + '!')
})

it('makes the draft read-only until the Ctrl+S save finishes', async () => {
  let saved!: () => void
  const save = vi.fn(() => new Promise<void>((resolve) => { saved = resolve }))
  useAppStore.setState({ updateDocumentText: save })
  const user = userEvent.setup()
  render(<TranscriptPanel />)
  await user.click(screen.getByRole('button', { name: 'Editar texto' }))
  const input = screen.getByRole('textbox', { name: 'Texto de Entrevista' }) as HTMLTextAreaElement
  await user.clear(input)
  await user.type(input, 'nova versão')
  await user.keyboard('{Control>}s{/Control}')
  expect(input.readOnly).toBe(true)
  await user.keyboard(' texto durante a gravação{Control>}s{/Control}')
  expect(input.value).toBe('nova versão')
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith(1, 'nova versão')
  await act(async () => saved())
  expect(screen.queryByRole('textbox', { name: 'Texto de Entrevista' })).toBeNull()
})

it.each(['🙂', '👩‍💻'])('moves quotation handles past %s and restores keyboard focus', async (emoji) => {
  const code = { id: 1, guid: 'c', name: 'Código', color: '#123456', description: null,
    memo: '', parentId: null, isCategory: false, sortOrder: 0, createdAt: '', usageCount: 1 }
  const end = emoji.length + 3
  const coding = { id: 1, guid: 'q', documentId: 1, codeId: 1, startPos: 1, endPos: end, createdAt: '' }
  const updateCoding = vi.fn(async (_id: number, startPos: number, endPos: number) => {
    useAppStore.setState({ codings: [{ ...coding, startPos, endPos }] })
  })
  useAppStore.setState({
    currentDocument: { ...useAppStore.getState().currentDocument!, plainText: 'A' + emoji + 'BC', charCount: end },
    codes: [code], codings: [coding], updateCoding
  })
  render(<TranscriptPanel />)
  fireEvent.click(screen.getByText(emoji + 'BC'))
  const start = screen.getByRole('slider', { name: 'Início da citação' })
  start.focus()
  await act(async () => fireEvent.keyDown(start, { key: 'ArrowRight' }))
  expect(updateCoding).toHaveBeenLastCalledWith(1, 1 + emoji.length, end)
  const moved = screen.getByRole('slider', { name: 'Início da citação' })
  expect(document.activeElement).toBe(moved)
  await act(async () => fireEvent.keyDown(moved, { key: 'ArrowLeft' }))
  expect(updateCoding).toHaveBeenLastCalledWith(1, 1, end)
})
