// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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
