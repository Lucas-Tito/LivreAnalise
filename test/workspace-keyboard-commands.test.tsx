// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { CodeWithCount, CodingWithCode, Collection, DocumentWithText, Note } from '../src/shared/types'

const doc: DocumentWithText = {
  id: 1, guid: 'd', name: 'Entrevista', plainText: 'Primeira linha\nSegunda linha',
  charCount: 28, importedAt: '', originalFormat: 'txt', sourceFilename: null
}
const otherDoc: DocumentWithText = { ...doc, id: 2, guid: 'd2', name: 'Outro documento' }
const code = (id: number, name: string, parentId: number | null = null): CodeWithCount => ({
  id, guid: `c${id}`, name, parentId, color: '#112233', description: null, memo: '',
  createdAt: '', sortOrder: id, usageCount: 0
})
const a = code(1, 'Alfa', 3)
const b = code(2, 'Beta', 3)
const category = { ...code(3, 'Categoria'), isCategory: true }
const collection: Collection = { id: 1, guid: 'g', name: 'Grupo', memo: '', createdAt: '' }
const otherCollection: Collection = { ...collection, id: 2, guid: 'g2', name: 'Outro grupo' }
const undo = vi.fn(async () => null)
const redo = vi.fn(async () => null)
const listByCode = vi.fn(async (_id: number): Promise<CodingWithCode[]> => [])

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 100, 28)
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    project: { name: 'Projeto' } as ReturnType<typeof useAppStore.getState>['project'],
    documents: [doc],
    currentDocument: doc,
    codes: [a, b, category],
    collections: [collection, otherCollection],
    collectionMembers: [collection, otherCollection].map(({ id }) => ({ collectionId: id, codeId: category.id })),
    bootstrap: async () => {},
    undo,
    redo
  })
  Object.defineProperty(window, 'api', {
    configurable: true, value: {
      app: { onCloseRequested: () => () => {}, setTextDirty: vi.fn(), setMemoDirty: vi.fn(), setNameDirty: vi.fn() },
      view: { onAction: () => () => {}, setFont: vi.fn(), fontChanged: vi.fn() },
      codings: { listByCode },
      versions: { onChanged: () => () => {}, list: async () => [] }
    }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

it('aciona o histórico no leitor protegido, mas não nos campos de edição', async () => {
  const user = userEvent.setup()
  render(<App />)
  const button = screen.getByRole('button', { name: 'Navegar pelo texto' })
  button.focus()
  await user.keyboard('{Enter}')
  const reader = screen.getByRole('textbox', { name: /Navegação somente leitura/ })
  expect(document.activeElement).toBe(reader)
  await user.keyboard('{Control>}z{/Control}{Control>}y{/Control}{Control>}{Shift>}Z{/Shift}{/Control}')
  expect(undo).toHaveBeenCalledOnce()
  expect(redo).toHaveBeenCalledTimes(2)
  await user.keyboard('{Control>}e{/Control}')
  const editor = screen.getByRole('textbox', { name: 'Texto de Entrevista' })
  expect(document.activeElement).toBe(editor)
  await user.keyboard('{Control>}z{/Control}')
  expect(undo).toHaveBeenCalledOnce()
})

it('navega e seleciona na árvore por ocorrência e abre as ações com Shift+F10', async () => {
  const user = userEvent.setup()
  render(<App />)
  screen.getByRole('button', { name: 'Documentos', exact: true }).focus()
  await user.keyboard('{ArrowRight}')
  const tree = screen.getByRole('tree')
  const group = within(tree).getByRole('treeitem', { name: 'Grupo' })
  const [categoryInGroup, secondOccurrence] = within(tree).getAllByRole('treeitem', { name: 'Categoria' })
  act(() => group.focus())
  await user.keyboard('{ArrowRight}')
  expect(document.activeElement).toBe(categoryInGroup)
  await user.keyboard('{ArrowRight}')
  const first = within(group).getByRole('treeitem', { name: 'Alfa' })
  const second = within(group).getByRole('treeitem', { name: 'Beta' })
  expect(document.activeElement).toBe(first)
  await user.keyboard(' {Shift>}{ArrowDown}{/Shift}')
  expect(document.activeElement).toBe(second)
  expect(first.getAttribute('aria-selected')).toBe('true')
  expect(second.getAttribute('aria-selected')).toBe('true')
  expect(within(secondOccurrence).getByRole('treeitem', { name: 'Alfa' }).getAttribute('aria-selected')).toBe('true')
  await user.keyboard('{Shift>}{F10}{/Shift}')
  expect(await screen.findByRole('menuitem', { name: /Mover para categoria/ })).toBeTruthy()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(second))
  expect(second.getAttribute('aria-selected')).toBe('true')
  await user.keyboard('{ArrowLeft}{ArrowLeft}')
  expect(document.activeElement).toBe(categoryInGroup)
  expect(categoryInGroup.getAttribute('aria-expanded')).toBe('false')
  expect(within(group).queryByRole('treeitem', { name: 'Beta' })).toBeNull()
})

it('abre memo pelo atalho e devolve o foco ao item da árvore ao fechar', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Códigos', exact: true }))
  const group = screen.getByRole('treeitem', { name: 'Grupo' })
  act(() => group.focus())
  await user.keyboard('{Control>}{Shift>}M{/Shift}{/Control}')
  const memo = await screen.findByRole('textbox', { name: 'Texto do memo' })
  expect(document.activeElement).toBe(memo)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(group))
})

it('abre com Enter a citação destacada pelas setas, sem bloquear Enter nos botões do diálogo', async () => {
  const user = userEvent.setup()
  const first: CodingWithCode = {
    id: 1, guid: 'q1', documentId: doc.id, codeId: a.id, startPos: 0, endPos: 8,
    createdAt: '', codeName: a.name, codeColor: a.color, text: 'Primeira'
  }
  const second = { ...first, id: 2, guid: 'q2', startPos: 15, endPos: 22, text: 'Segunda' }
  const locateOccurrence = vi.fn(async () => true)
  listByCode.mockResolvedValueOnce([first, second])
  useAppStore.setState({ locateOccurrence })
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Códigos', exact: true }))
  const row = screen.getAllByRole('treeitem', { name: 'Alfa' })[0]
  act(() => row.focus())
  await user.keyboard('{Enter}')
  const dialog = await screen.findByRole('dialog', { name: /Trechos de "Alfa"/ })
  await within(dialog).findByRole('button', { name: /Segunda/ })
  const memo = within(dialog).getByRole('button', { name: 'Memo' })
  memo.focus()
  await user.keyboard('{Enter}')
  expect(locateOccurrence).not.toHaveBeenCalled()
  expect(within(dialog).getByRole('textbox', { name: 'Texto do memo' })).toBeTruthy()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(within(dialog).queryByRole('textbox', { name: 'Texto do memo' })).toBeNull())
  within(dialog).getByRole('button', { name: 'Trechos' }).focus()
  await user.keyboard('{ArrowDown}')
  expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: /Segunda/ }))
  await user.keyboard('{Enter}')
  expect(locateOccurrence).toHaveBeenCalledTimes(1)
  expect(locateOccurrence).toHaveBeenCalledWith(second)
  await waitFor(() => expect(document.activeElement).toBe(row))
})

it('cria nota do trecho pelo atalho e retorna ao leitor sem perder a seleção', async () => {
  const user = userEvent.setup()
  const createNote = vi.fn(async (input): Promise<Note> => {
    const note: Note = {
      ...input, id: 1, guid: 'n', body: '', title: null, anchorStatus: 'attached',
      anchorText: 'Primeira', createdAt: '', updatedAt: ''
    }
    useAppStore.setState({ documentNotes: [note] })
    return note
  })
  useAppStore.setState({ createNote })
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Navegar pelo texto' }))
  const reader = screen.getByRole('textbox', { name: /Navegação somente leitura/ }) as HTMLTextAreaElement
  reader.setSelectionRange(0, 8)
  fireEvent.select(reader)
  await user.keyboard('{Control>}{Shift>}N{/Shift}{/Control}')
  expect(createNote).toHaveBeenCalledWith({ scope: 'excerpt', documentId: 1, startPos: 0, endPos: 8 })
  const title = await screen.findByRole('textbox', { name: 'Título da nota' })
  expect(document.activeElement).toBe(title)
  await user.keyboard('{F6}')
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'LivreAnalise' }))
  await user.keyboard('{Shift>}{F6}{/Shift}')
  expect(document.activeElement).toBe(title)
  await user.click(screen.getByRole('button', { name: 'Voltar' }))
  await waitFor(() => expect(document.activeElement).toBe(reader))
  expect([reader.selectionStart, reader.selectionEnd]).toEqual([0, 8])
})

it.each([
  ['abrir configuracoes', 'Configurações'],
  ['ver versoes do projeto', 'Versões do projeto'],
  ['exportar texto para ia', 'Exportar para IA']
])('devolve ao leitor o foco após fechar %s aberta pela paleta', async (query, dialogName) => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Navegar pelo texto' }))
  const reader = screen.getByRole('textbox', { name: /Navegação somente leitura/ })
  await user.keyboard('{Control>}k{/Control}')
  await user.type(screen.getByRole('combobox', { name: 'Buscar comando' }), `${query}{Enter}`)
  expect(await screen.findByRole('dialog', { name: dialogName })).toBeTruthy()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(reader))
})

it('busca comandos e atalhos, mostra indisponibilidade e só abre a ação após fechar a paleta', async () => {
  const user = userEvent.setup()
  render(<App />)
  const documents = screen.getByRole('button', { name: 'Documentos', exact: true })
  documents.focus()
  await user.keyboard('{Control>}k{/Control}')
  const search = screen.getByRole('combobox', { name: 'Buscar comando' })
  await user.type(search, 'desfazer{Enter}')
  expect(screen.getByRole('option', { name: /Nada para desfazer/ }).getAttribute('aria-disabled')).toBe('true')
  expect(undo).not.toHaveBeenCalled()
  await user.clear(search)
  await user.type(search, 'criar codigo{Enter}')
  const codeDialog = await screen.findByRole('dialog', { name: 'Novo código' })
  expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).toBeNull()
  expect(document.activeElement).toBe(within(codeDialog).getByRole('textbox', { name: 'Nome' }))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(documents))
  await user.keyboard('{F1}')
  await user.type(screen.getByRole('textbox', { name: 'Buscar atalho' }), 'ctrl+enter')
  expect(screen.getByText('Codificar o trecho selecionado')).toBeTruthy()
  expect(screen.queryByText('Abrir documento', { exact: true })).toBeNull()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(documents))
})

it('devolve o foco a Novo código quando a paleta foi aberta a partir de uma linha de documento', async () => {
  const user = userEvent.setup()
  render(<App />)

  screen.getByRole('button', { name: doc.name }).focus()
  await user.keyboard('{Control>}k{/Control}')
  await user.type(screen.getByRole('combobox', { name: 'Buscar comando' }), 'criar codigo{Enter}')
  await screen.findByRole('dialog', { name: 'Novo código' })
  await user.keyboard('{Escape}')

  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Novo código' })))
})

it('a abertura rápida respeita o rascunho e Esc fecha apenas a confirmação', async () => {
  const user = userEvent.setup()
  useAppStore.setState({ documents: [doc, otherDoc] })
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Editar texto' }))
  const editor = screen.getByRole('textbox', { name: 'Texto de Entrevista' })
  await user.type(editor, 'rascunho')
  await user.keyboard('{Control>}p{/Control}')
  const search = screen.getByRole('combobox', { name: 'Buscar documento' })
  await user.type(search, 'outro{Enter}')
  expect(await screen.findByRole('dialog', { name: 'Alterações não salvas no texto' })).toBeTruthy()
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(search))
  expect(useAppStore.getState().currentDocument?.id).toBe(doc.id)
  expect(useAppStore.getState().textoSujo).toBe(true)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(editor))
  expect((editor as HTMLTextAreaElement).value).toContain('rascunho')
})


it('renomeia com F2 a partir da aba Códigos e devolve o foco ao documento', async () => {
  const user = userEvent.setup()
  const renameDocument = vi.fn(async () => {})
  useAppStore.setState({ renameDocument })
  render(<App />)

  await user.click(screen.getByRole('button', { name: 'Códigos', exact: true }))
  await user.keyboard('{F2}')
  const editor = await screen.findByRole('textbox', { name: 'Nome do documento' })
  expect(document.activeElement).toBe(editor)
  await user.type(editor, 'Novo nome{Enter}', { skipClick: true })
  await waitFor(() => expect(renameDocument).toHaveBeenCalledWith(doc.id, 'Novo nome', expect.any(String)))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: doc.name })))
})


it('devolve o foco para Editar texto depois de confirmar o descarte', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Editar texto' }))
  const editor = screen.getByRole('textbox', { name: 'Texto de Entrevista' })
  await user.type(editor, ' Rascunho')
  await user.keyboard('{Control>}e{/Control}')
  const dialog = await screen.findByRole('dialog', { name: 'Alterações não salvas no texto' })
  await user.click(within(dialog).getByRole('button', { name: 'Descartar' }))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Editar texto' })))
})
