// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import { useZoomStore } from '../src/renderer/src/stores/zoomStore'
import { UnsavedTextDialog } from '../src/renderer/src/components/workspace/UnsavedTextDialog'

beforeEach(() => {
  localStorage.clear()
  useZoomStore.setState({ zoom: 1 })
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
afterEach(() => { cleanup(); localStorage.clear(); useZoomStore.setState({ zoom: 1 }); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['ctrlKey', 'metaKey'])('com %s, E alterna a edição e S salva com foco nos botões', async (modifier) => {
  const save = vi.fn(async () => {})
  useAppStore.setState({ updateDocumentText: save })
  render(<TranscriptPanel />)
  fireEvent.keyDown(window, { key: 'e', [modifier]: true })
  const field = screen.getByRole('textbox', { name: 'Texto de Entrevista' })
  expect(document.activeElement).toBe(field)
  await act(async () => { fireEvent.keyDown(field, { key: 'e', [modifier]: true }) })
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.keyDown(window, { key: 'e', [modifier]: true })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'texto alterado' } })
  const button = screen.getByRole('button', { name: 'Salvar texto' })
  button.focus()
  await act(async () => { fireEvent.keyDown(button, { key: 's', [modifier]: true }) })
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenCalledWith(1, 'texto alterado')
  expect(screen.queryByRole('textbox')).toBeNull()
})

it('Ctrl+E pede confirmação antes de sair de um rascunho e não atua dentro do diálogo', async () => {
  render(<><TranscriptPanel /><UnsavedTextDialog /></>)
  fireEvent.keyDown(window, { key: 'e', ctrlKey: true })
  const field = screen.getByRole('textbox')
  fireEvent.change(field, { target: { value: 'rascunho' } })
  await act(async () => { fireEvent.keyDown(field, { key: 'e', ctrlKey: true }) })
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 's', ctrlKey: true })
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'e', ctrlKey: true })
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect((field as HTMLTextAreaElement).value).toBe('rascunho')
  await userEvent.setup().click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(screen.getByRole('textbox')).toBe(field)
})

it('não intercepta campos externos, teclas repetidas ou combinações com Shift', () => {
  const save = vi.fn(async () => {})
  useAppStore.setState({ updateDocumentText: save })
  render(<><TranscriptPanel /><input aria-label="Nota" /></>)
  const note = screen.getByRole('textbox', { name: 'Nota' })
  fireEvent.keyDown(note, { key: 'e', ctrlKey: true })
  fireEvent.keyDown(window, { key: 'e', ctrlKey: true, repeat: true })
  fireEvent.keyDown(window, { key: 'e', ctrlKey: true, shiftKey: true })
  expect(screen.queryByRole('textbox', { name: 'Texto de Entrevista' })).toBeNull()
  fireEvent.keyDown(window, { key: 'e', ctrlKey: true })
  fireEvent.keyDown(note, { key: 's', ctrlKey: true })
  expect(save).not.toHaveBeenCalled()
})

it('Ctrl+S salva com foco no texto e preserva o rascunho quando há erro', async () => {
  render(<TranscriptPanel />)
  fireEvent.keyDown(window, { key: 'e', ctrlKey: true })
  const field = screen.getByRole('textbox') as HTMLTextAreaElement
  fireEvent.change(field, { target: { value: 'rascunho' } })
  await act(async () => { fireEvent.keyDown(field, { key: 's', ctrlKey: true }) })
  expect(screen.getByRole('alert').textContent).toContain('disco cheio')
  expect(field.value).toBe('rascunho')
})

it.each([1, 1.5])('mantém a geometria da leitura ao editar com zoom %s e faixa redimensionada', async (zoom) => {
  useZoomStore.setState({ zoom })
  const { container } = render(<TranscriptPanel />)
  const reading = container.querySelector('.transcript') as HTMLElement
  const fontSize = reading.style.fontSize
  const lineHeight = reading.style.lineHeight
  const fontFamily = reading.style.fontFamily
  const separator = screen.getByRole('separator', { name: 'Largura da faixa de códigos' })
  fireEvent.keyDown(separator, { key: 'ArrowLeft' })
  const laneWidth = Number(separator.getAttribute('aria-valuenow'))

  await userEvent.setup().click(screen.getByRole('button', { name: 'Editar texto' }))
  const field = screen.getByRole('textbox', { name: 'Texto de Entrevista' }) as HTMLTextAreaElement
  const backdrop = container.querySelector('[aria-hidden="true"].overflow-auto') as HTMLElement
  for (const layer of [field, backdrop]) {
    expect(layer.style.fontSize).toBe(fontSize)
    expect(layer.style.lineHeight).toBe(lineHeight)
    expect(layer.style.fontFamily).toBe(fontFamily)
    expect(layer.style.paddingLeft).toBe('4.75rem')
    expect(layer.style.paddingRight).toBe(`calc(${laneWidth}px + 1.875rem)`)
    expect(layer.classList.contains('py-5')).toBe(true)
  }
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe(String(laneWidth))
})

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

it('uses the selected quotation for the grouped delete label without remeasuring on hover', async () => {
  const geometry = vi.spyOn(Range.prototype, 'getClientRects').mockReturnValue([
    new DOMRect(0, 0, 50, 20), new DOMRect(0, 28, 50, 20)
  ] as unknown as DOMRectList)
  const getStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    const style = getStyle(el)
    if (el.classList.contains('transcript')) style.lineHeight = '28px'
    return style
  })
  const removeCoding = vi.fn(async () => {})
  const codes = ['Alfa', 'Beta', 'Gama'].map((name, i) => ({
    id: i + 1, guid: name, name, color: '#123456', description: null, memo: '',
    parentId: null, sortOrder: i, createdAt: '', usageCount: 1
  }))
  useAppStore.setState({
    codes, removeCoding,
    codings: codes.map(({ id, guid }) => ({
      id, guid, documentId: 1, codeId: id, startPos: 0, endPos: 8, createdAt: ''
    }))
  })
  render(<TranscriptPanel />)
  const grouped = screen.getByRole('button', { name: 'Selecionar citação: Alfa' })
  expect(grouped.textContent).toContain('+1')
  geometry.mockClear()
  fireEvent.mouseEnter(grouped.parentElement!)
  fireEvent.mouseLeave(grouped.parentElement!)
  expect(geometry).not.toHaveBeenCalled()
  fireEvent.click(grouped)
  fireEvent.click(screen.getByRole('button', { name: /Selecionar código\s*Gama/ }))
  expect(screen.queryByRole('button', { name: 'Remover citação: Alfa' })).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Remover citação: Gama' })) })
  expect(removeCoding).toHaveBeenCalledWith(3)
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

it('shows a removable quotation for a newline without text rectangles', async () => {
  const getStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    const style = getStyle(el)
    if (el.classList.contains('transcript')) style.lineHeight = '28px'
    return style
  })
  const originalRect = Element.prototype.getBoundingClientRect
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this.hasAttribute('data-transcript-line') ? new DOMRect(0, 20, 200, 28) : originalRect.call(this)
  })
  const removeCoding = vi.fn(async () => {})
  useAppStore.setState({
    currentDocument: { ...useAppStore.getState().currentDocument!, plainText: 'A\nB', charCount: 3 },
    codes: [{ id: 1, guid: 'c', name: 'Quebra', color: '#123456', description: null, memo: '',
      parentId: null, isCategory: false, sortOrder: 0, createdAt: '', usageCount: 1 }],
    codings: [{ id: 9, guid: 'q', documentId: 1, codeId: 1, startPos: 1, endPos: 2, createdAt: '' }],
    removeCoding
  })
  render(<TranscriptPanel />)
  const remove = screen.getByRole('button', { name: 'Remover citação: Quebra' })
  await act(async () => fireEvent.click(remove))
  expect(removeCoding).toHaveBeenCalledWith(9)
})
