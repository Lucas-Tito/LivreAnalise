// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/renderer/src/App'
import { CodeDialog } from '../src/renderer/src/components/workspace/CodeDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import { useThemeStore } from '../src/renderer/src/stores/themeStore'
import { useZoomStore } from '../src/renderer/src/stores/zoomStore'
import { closeDatabase, openDatabase } from '../src/main/db'
import * as repos from '../src/main/db/repositories'
import * as history from '../src/main/history/stack'

vi.mock('../src/renderer/src/components/workspace/Workspace', () => ({ Workspace: () => <EditorWorkspace /> }))

function EditorWorkspace() {
  const [open, setOpen] = useState(true)
  const code = useAppStore((s) => s.codes[0])
  return <CodeDialog open={open} existing={code} title="Editar código" onOpenChange={setOpen} onSubmit={async () => false} />
}

const update = vi.fn()
const undo = vi.fn()
beforeEach(async () => {
  vi.clearAllMocks()
  openDatabase(':memory:')
  repos.createCode({ name: 'Original', color: '#ef4444', description: 'Antes' })
  history.clearAllHistory()
  update.mockImplementation(repos.updateCode)
  undo.mockImplementation(history.historyUndo)
  Object.defineProperty(window, 'api', { configurable: true, value: {
    codes: { list: repos.listCodes, update },
    documents: { list: () => [] },
    collections: { list: () => [], allMembers: () => [] },
    notes: { listProject: () => [] },
    history: { state: history.historyState, undo, redo: history.historyRedo },
    app: { setCodeDirty: vi.fn(), onCloseRequested: () => () => {} },
    view: { onAction: () => () => {} }
  } })
  useThemeStore.setState({ init: vi.fn() })
  useZoomStore.setState({ init: vi.fn() })
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ project: {} as any, codes: repos.listCodes(), bootstrap: vi.fn() })
})
afterEach(() => { cleanup(); closeDatabase(); history.clearAllHistory(); vi.restoreAllMocks() })

describe('atalhos e histórico do editor de código', () => {
  it('Ctrl+Z fora dos campos salva o rascunho pendente, fecha e desfaz; Ctrl+Shift+Z refaz', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Alterado' } })
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Detalhe' } })
    await act(async () => { fireEvent.keyDown(screen.getAllByRole('button', { name: 'Fechar' })[0], { key: 'z', ctrlKey: true }) })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alterado', description: 'Detalhe' }))
    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useAppStore.getState().codes[0]).toMatchObject({ name: 'Original', description: 'Antes' })
    expect(useAppStore.getState().history.canRedo).toBe(true)
    await act(async () => { fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true }) })
    expect(useAppStore.getState().codes[0]).toMatchObject({ name: 'Alterado', description: 'Detalhe' })
  })

  it('Ctrl+Z no campo não aciona o histórico global e a reversão nativa também é persistida', async () => {
    render(<App />)
    const name = screen.getByLabelText('Nome')
    fireEvent.change(name, { target: { value: 'Alterado' } })
    await act(async () => { fireEvent.keyDown(name, { key: 's', ctrlKey: true }) })
    expect(repos.listCodes()[0].name).toBe('Alterado')
    expect(fireEvent.keyDown(name, { key: 'z', ctrlKey: true })).toBe(true)
    expect(undo).not.toHaveBeenCalled()
    // O JSDOM não implementa a edição nativa do navegador.
    fireEvent.input(name, { target: { value: 'Original' }, inputType: 'historyUndo' })
    await act(async () => { fireEvent.keyDown(name, { key: 's', ctrlKey: true }) })
    expect(repos.listCodes()[0].name).toBe('Original')
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('não executa o desfazer global se não conseguir salvar o rascunho', async () => {
    update.mockRejectedValueOnce(new Error('disco cheio'))
    render(<App />)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Não perder' } })
    await act(async () => { fireEvent.keyDown(screen.getAllByRole('button', { name: 'Fechar' })[0], { key: 'z', ctrlKey: true }) })
    expect(undo).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('disco cheio')
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Não perder')
    expect(repos.listCodes()[0].name).toBe('Original')
  })
})
