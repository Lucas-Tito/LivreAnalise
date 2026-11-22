// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocumentsPanel } from '../src/renderer/src/components/workspace/DocumentsPanel'
import { Sidebar } from '../src/renderer/src/components/workspace/Sidebar'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { DocumentWithText } from '../src/shared/types'

const docs: DocumentWithText[] = [1, 2].map((id) => ({
  id, guid: `doc-${id}`, name: `Entrevista ${id}`, originalFormat: 'txt', sourceFilename: null,
  charCount: 5, importedAt: '', plainText: 'Texto'
}))
const rename = vi.fn()
const setNameDirty = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ documents: docs, currentDocument: docs[0], renameDocument: rename,
    selectDocument: vi.fn().mockResolvedValue(true), importDocuments: vi.fn().mockResolvedValue(undefined) })
  rename.mockImplementation(async (id: number, name: string) => {
    const state = useAppStore.getState()
    useAppStore.setState({
      documents: state.documents.map((doc) => doc.id === id ? { ...doc, name } : doc),
      currentDocument: state.currentDocument?.id === id ? { ...state.currentDocument, name } : state.currentDocument
    })
  })
  Object.defineProperty(window, 'api', { configurable: true, value: { app: { setNameDirty } } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

function f2(target: HTMLElement = document.body) { fireEvent.keyDown(target, { key: 'F2' }) }
function nameField() { return screen.getByRole('textbox', { name: 'Nome do documento' }) as HTMLInputElement }

describe('renomear documento em linha', () => {
  it('F2 edita o documento selecionado na lista e seleciona seu nome inteiro', () => {
    render(<DocumentsPanel />)
    f2()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nameField().value).toBe('Entrevista 1')
    expect(document.activeElement).toBe(nameField())
    expect(nameField().selectionStart).toBe(0)
    expect(nameField().selectionEnd).toBe('Entrevista 1'.length)
    expect(rename).not.toHaveBeenCalled()
  })

  it('F2 prioriza o documento com foco sem alterar a seleção de leitura', () => {
    render(<DocumentsPanel />)
    const second = screen.getByRole('button', { name: 'Entrevista 2' })
    second.focus()
    f2(second)
    expect(nameField().value).toBe('Entrevista 2')
    expect(useAppStore.getState().currentDocument?.id).toBe(1)
  })

  it('aceita F2 enviado à janela sem depender de um elemento HTML como alvo', () => {
    render(<DocumentsPanel />)
    fireEvent.keyDown(window, { key: 'F2' })
    expect(nameField().value).toBe('Entrevista 1')
  })

  it('o menu abre a edição em linha com foco, sem janela', async () => {
    render(<DocumentsPanel />)
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Entrevista 2' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /Renomear/ }))
    await screen.findByRole('textbox', { name: 'Nome do documento' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(nameField().value).toBe('Entrevista 2')
    expect(document.activeElement).toBe(nameField())
  })

  it('Enter salva, normaliza o nome e devolve o foco à linha', async () => {
    render(<DocumentsPanel />)
    f2()
    fireEvent.change(nameField(), { target: { value: ' Novo nome ' } })
    expect(rename).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Enter' }) })
    expect(rename).toHaveBeenCalledTimes(1)
    expect(rename).toHaveBeenCalledWith(1, 'Novo nome', expect.any(String))
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Novo nome' }))
    expect(setNameDirty).toHaveBeenLastCalledWith(false)
  })

  it('clicar fora salva automaticamente sem roubar o foco do destino', async () => {
    render(<DocumentsPanel />)
    f2()
    fireEvent.change(nameField(), { target: { value: 'Alterado' } })
    const destination = screen.getByRole('button', { name: 'Importar documentos' })
    await userEvent.click(destination)
    await waitFor(() => expect(rename).toHaveBeenCalledWith(1, 'Alterado', expect.any(String)))
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).toBeNull()
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Alterado' }))
  })

  it('devolve o foco à busca quando o novo nome deixa de corresponder ao filtro', async () => {
    const user = userEvent.setup()
    render(<DocumentsPanel />)

    await user.click(screen.getByRole('button', { name: 'Buscar documento' }))
    const search = screen.getByRole('textbox', { name: 'Nome do documento' })
    await user.type(search, 'Entrevista 1')
    const row = screen.getByRole('button', { name: 'Entrevista 1' })
    row.focus()
    await user.keyboard('{F2}')
    await user.keyboard('Outro nome{Enter}')

    await waitFor(() => expect(document.activeElement).toBe(search))
    expect(search.getAttribute('placeholder')).toBe('Nome do documento')
    expect(rename).toHaveBeenCalledWith(1, 'Outro nome', expect.any(String))
    expect(screen.queryByRole('button', { name: 'Outro nome' })).toBeNull()
  })

  it('Esc cancela sem gravar nem criar um passo no histórico', async () => {
    render(<DocumentsPanel />)
    f2()
    fireEvent.change(nameField(), { target: { value: 'Descartar' } })
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Escape' }) })
    expect(rename).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Entrevista 1' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Entrevista 1' }))
  })

  it('não salva um nome vazio, preserva o rascunho e permite cancelar', async () => {
    render(<DocumentsPanel />)
    f2()
    fireEvent.change(nameField(), { target: { value: ' ' } })
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Enter' }) })
    expect(rename).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('vazio')
    expect(nameField().value).toBe(' ')
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Escape' }) })
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).toBeNull()
    expect(rename).not.toHaveBeenCalled()
  })

  it('mantém o rascunho em caso de falha e permite tentar novamente', async () => {
    rename.mockRejectedValueOnce(new Error('disco cheio'))
    render(<DocumentsPanel />)
    f2()
    fireEvent.change(nameField(), { target: { value: 'Não perder' } })
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Enter' }) })
    expect(nameField().value).toBe('Não perder')
    expect(screen.getByRole('alert').textContent).toContain('disco cheio')
    expect(setNameDirty).toHaveBeenLastCalledWith(true)
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(rename).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: 'Não perder' })).toBeTruthy()
  })

  it('preserva o texto mais recente enquanto a gravação está pendente', async () => {
    let finish!: () => void
    rename.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<DocumentsPanel />)
    f2()
    fireEvent.change(nameField(), { target: { value: 'Primeiro' } })
    fireEvent.keyDown(nameField(), { key: 'Enter' })
    fireEvent.change(nameField(), { target: { value: 'Último' } })
    fireEvent.keyDown(nameField(), { key: 'Enter' })
    expect(rename).toHaveBeenCalledTimes(1)
    expect(nameField().value).toBe('Último')
    await act(async () => { finish() })
    expect(rename).toHaveBeenLastCalledWith(1, 'Último', expect.any(String))
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).toBeNull()
  })

  it('F2 não interfere com campos de texto, atalhos modificados ou outras janelas', () => {
    const { container } = render(<DocumentsPanel />)
    fireEvent.keyDown(document.body, { key: 'F2', ctrlKey: true })
    const field = document.createElement('textarea')
    container.append(field)
    f2(field)
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    container.append(dialog)
    f2()
    expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).toBeNull()
  })

  it('não intercepta o Ctrl+Z nativo da digitação', async () => {
    render(<DocumentsPanel />)
    f2()
    fireEvent.change(nameField(), { target: { value: 'Mudança' } })
    expect(fireEvent.keyDown(nameField(), { key: 'z', ctrlKey: true })).toBe(true)
    // O JSDOM não implementa o desfazer nativo.
    fireEvent.input(nameField(), { target: { value: 'Entrevista 1' }, inputType: 'historyUndo' })
    await act(async () => { fireEvent.keyDown(nameField(), { key: 'Enter' }) })
    expect(rename).not.toHaveBeenCalled()
  })
})

it('trocar de aba aguarda o salvamento do nome antes de desmontar o editor', async () => {
  let finish!: () => void
  rename.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
  render(<Sidebar onViewCode={() => {}} />)
  f2()
  fireEvent.change(nameField(), { target: { value: 'Salvar antes de sair' } })
  await userEvent.click(screen.getByRole('button', { name: 'Códigos' }))
  expect(nameField().value).toBe('Salvar antes de sair')
  expect(screen.getByRole('button', { name: 'Documentos' }).getAttribute('aria-pressed')).toBe('true')
  await act(async () => { finish() })
  expect(screen.getByRole('button', { name: 'Códigos' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('textbox', { name: 'Nome do documento' })).toBeNull()
})

it('não troca de aba se a renomeação não puder ser salva', async () => {
  rename.mockRejectedValue(new Error('disco cheio'))
  render(<Sidebar onViewCode={() => {}} />)
  f2()
  fireEvent.change(nameField(), { target: { value: 'Preservar' } })
  await userEvent.click(screen.getByRole('button', { name: 'Códigos' }))
  expect(nameField().value).toBe('Preservar')
  expect(screen.getByRole('alert').textContent).toContain('disco cheio')
  expect(screen.getByRole('button', { name: 'Documentos' }).getAttribute('aria-pressed')).toBe('true')
})
