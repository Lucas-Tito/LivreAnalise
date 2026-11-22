// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'
import { DocumentsPanel } from '../src/renderer/src/components/workspace/DocumentsPanel'
import { CodesPanel } from '../src/renderer/src/components/workspace/CodesPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import { useThemeStore } from '../src/renderer/src/stores/themeStore'
import { useZoomStore } from '../src/renderer/src/stores/zoomStore'
import { closeDatabase, openDatabase } from '../src/main/db'
import * as repos from '../src/main/db/repositories'
import * as history from '../src/main/history/stack'

vi.mock('../src/renderer/src/components/workspace/Workspace', () => ({ Workspace: () => <TestWorkspace /> }))
let mode: 'document' | 'category' | 'group'
function TestWorkspace() {
  return mode === 'document' ? <DocumentsPanel /> : <CodesPanel onViewCode={() => {}} />
}

const renameDocument = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  mode = 'document'
  openDatabase(':memory:')
  repos.createDocument({ name: 'Entrevista', plainText: 'Texto', originalFormat: 'txt', sourceFilename: 'entrevista.txt' })
  repos.createCode({ name: 'Categoria', color: '#ef4444', isCategory: true })
  repos.createCollection({ name: 'Grupo' })
  history.clearAllHistory()
  renameDocument.mockImplementation(repos.renameDocument)
  Object.defineProperty(window, 'api', { configurable: true, value: {
    documents: { list: repos.listDocuments, get: repos.getDocument, rename: renameDocument },
    codes: { list: repos.listCodes, update: repos.updateCode },
    collections: { list: repos.listCollections, allMembers: repos.listAllCollectionMembers, update: repos.updateCollection },
    codings: { listByDocument: repos.listCodingsByDocument },
    notes: { listProject: repos.listProjectNotes, listByDocument: repos.listNotesByDocument },
    history: { state: history.historyState, undo: history.historyUndo, redo: history.historyRedo },
    app: { setNameDirty: vi.fn(), onCloseRequested: () => () => {} }, view: { onAction: () => () => {} }
  } })
  useThemeStore.setState({ init: vi.fn() })
  useZoomStore.setState({ init: vi.fn() })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ project: {} as any, bootstrap: vi.fn(), documents: repos.listDocuments(),
    currentDocument: repos.getDocument(repos.listDocuments()[0].id), codes: repos.listCodes(), collections: repos.listCollections() })
})
afterEach(() => { cleanup(); closeDatabase(); history.clearAllHistory(); vi.restoreAllMocks() })

it('F2/Enter renomeia o documento e Ctrl+Z/Ctrl+Shift+Z desfaz e refaz', async () => {
  render(<App />)
  fireEvent.keyDown(document.body, { key: 'F2' })
  fireEvent.change(screen.getByLabelText('Nome do documento'), { target: { value: 'Novo nome' } })
  await act(async () => { fireEvent.keyDown(screen.getByLabelText('Nome do documento'), { key: 'Enter' }) })
  expect(useAppStore.getState().currentDocument?.name).toBe('Novo nome')
  await act(async () => { fireEvent.keyDown(document.activeElement!, { key: 'z', ctrlKey: true }) })
  expect(useAppStore.getState().currentDocument?.name).toBe('Entrevista')
  expect(useAppStore.getState().documents[0].name).toBe('Entrevista')
  await act(async () => { fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true }) })
  expect(useAppStore.getState().currentDocument?.name).toBe('Novo nome')
})

it('o Ctrl+Z global conclui uma renomeação pendente antes de desfazê-la', async () => {
  render(<App />)
  fireEvent.keyDown(document.body, { key: 'F2' })
  fireEvent.change(screen.getByLabelText('Nome do documento'), { target: { value: 'Novo nome' } })
  await act(async () => { fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true }) })
  expect(renameDocument).toHaveBeenCalledTimes(1)
  expect(screen.queryByLabelText('Nome do documento')).toBeNull()
  expect(repos.listDocuments()[0].name).toBe('Entrevista')
  expect(history.historyState().canRedo).toBe(true)
})

it('o Ctrl+Z no campo preserva o undo nativo sem mexer no histórico do projeto', () => {
  render(<App />)
  fireEvent.keyDown(document.body, { key: 'F2' })
  const field = screen.getByLabelText('Nome do documento')
  fireEvent.change(field, { target: { value: 'Rascunho' } })
  expect(fireEvent.keyDown(field, { key: 'z', ctrlKey: true })).toBe(true)
  expect(renameDocument).not.toHaveBeenCalled()
  expect(history.historyState().canUndo).toBe(false)
  expect(screen.getByLabelText('Nome do documento')).toBeTruthy()
})

it.each(['category', 'group'] as const)('renomeia %s pelo menu com autosave e desfazer/refazer', async (kind) => {
  mode = kind
  const name = kind === 'category' ? 'Categoria' : 'Grupo'
  const label = kind === 'category' ? 'Nome da categoria' : 'Nome do grupo'
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: `Ações de ${name}` }))
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
  const field = await screen.findByLabelText(label)
  expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
  fireEvent.change(field, { target: { value: 'Renomeado' } })
  await waitFor(() => {
    expect(kind === 'category' ? repos.listCodes()[0].name : repos.listCollections()[0].name).toBe('Renomeado')
  }, { timeout: 2000 })
  expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe('Renomeado')
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => { fireEvent.keyDown(screen.getAllByRole('button', { name: 'Fechar' })[0], { key: 'z', ctrlKey: true }) })
  expect(kind === 'category' ? repos.listCodes()[0].name : repos.listCollections()[0].name).toBe(name)
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(async () => { fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true }) })
  expect(kind === 'category' ? repos.listCodes()[0].name : repos.listCollections()[0].name).toBe('Renomeado')
})
