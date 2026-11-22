import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '../src/renderer/src/stores/appStore'

type State = ReturnType<typeof useAppStore.getState>
const actions: [string, (s: State) => Promise<unknown>][] = [
  ['desfazer', (s) => s.undo()],
  ['refazer', (s) => s.redo()],
  ['novo projeto', (s) => s.createProject()],
  ['abrir projeto', (s) => s.openProject()],
  ['abrir recente', (s) => s.openRecent('projeto.liva')],
  ['fechar projeto', (s) => s.closeProject()],
  ['restaurar versão', (s) => s.restoreVersion('versão')],
  ['criar versão', (s) => s.createVersion('Versão')]
]
beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  // Nenhum IPC deve acontecer antes de concluir o salvamento do código.
  vi.stubGlobal('window', { api: {} })
})
afterEach(() => { vi.unstubAllGlobals() })

it.each(actions)('bloqueia %s quando o código não pôde ser salvo', async (_, action) => {
  const leave = vi.fn().mockResolvedValue(false)
  useAppStore.setState({ sairDoCodigo: leave })
  await action(useAppStore.getState())
  expect(leave).toHaveBeenCalledTimes(1)
})

it.each([...actions,
  ['trocar documento', (s: State) => s.selectDocument(2)],
  ['excluir documento', (s: State) => s.deleteDocument(1)]
] as typeof actions)('bloqueia %s quando uma renomeação não pôde ser salva', async (_, action) => {
  const leave = vi.fn().mockResolvedValue(false)
  useAppStore.setState({ sairDaRenomeacao: leave })
  await action(useAppStore.getState())
  expect(leave).toHaveBeenCalledTimes(1)
})

it('aguarda o salvamento antes de desfazer', async () => {
  let finish!: (ok: boolean) => void
  const undo = vi.fn().mockResolvedValue('editar código')
  vi.stubGlobal('window', { api: { history: { undo } } })
  useAppStore.setState({
    sairDoCodigo: () => new Promise<boolean>((resolve) => { finish = resolve }),
    refreshDocuments: async () => {}, refreshCodes: async () => {}, refreshCollections: async () => {},
    refreshNotes: async () => {}, refreshHistory: async () => {}
  })
  const pending = useAppStore.getState().undo()
  expect(undo).not.toHaveBeenCalled()
  finish(true)
  expect(await pending).toBe('editar código')
  expect(undo).toHaveBeenCalledTimes(1)
})
