import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../src/renderer/src/stores/appStore'
import type { DocumentWithText } from '../src/shared/types'

const doc = (id: number): DocumentWithText => ({
  id,
  guid: `d${id}`,
  name: `Entrevista ${id}`,
  originalFormat: 'txt',
  sourceFilename: null,
  charCount: 5,
  importedAt: '2026-10-13',
  plainText: 'texto'
})

// Texto editado e não salvo (#31): sair do documento pergunta antes, e a
// resposta decide se a saída acontece.
describe('saída com texto não salvo', () => {
  const setTextDirty = vi.fn()
  const get = vi.fn(async (id: number) => doc(id))

  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    vi.stubGlobal('window', {
      api: {
        app: { setTextDirty },
        documents: { get },
        codings: { listByDocument: async () => [] },
        notes: { listByDocument: async () => [] }
      }
    })
    useAppStore.setState({ currentDocument: doc(1) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setTextDirty.mockClear()
    get.mockClear()
  })

  it('lets the switch through when nothing is pending', async () => {
    expect(await useAppStore.getState().selectDocument(2)).toBe(true)
    expect(useAppStore.getState().currentDocument?.id).toBe(2)
  })

  it('tells the main process when the text becomes dirty and clean again', () => {
    useAppStore.getState().setTextoSujo(true)
    useAppStore.getState().setTextoSujo(true)
    useAppStore.getState().setTextoSujo(false)
    expect(setTextDirty.mock.calls).toEqual([[true], [false]])
  })

  it('keeps the document when the person chooses to keep editing', async () => {
    useAppStore.getState().setTextoSujo(true)
    const troca = useAppStore.getState().selectDocument(2)
    expect(useAppStore.getState().saidaDoTexto).not.toBeNull()
    useAppStore.getState().responderSaidaDoTexto(false)
    expect(await troca).toBe(false)
    expect(useAppStore.getState().currentDocument?.id).toBe(1)
    expect(get).not.toHaveBeenCalled()
  })

  it('switches after the person saves or discards', async () => {
    useAppStore.getState().setTextoSujo(true)
    const troca = useAppStore.getState().selectDocument(2)
    useAppStore.getState().responderSaidaDoTexto(true)
    expect(await troca).toBe(true)
    expect(useAppStore.getState().currentDocument?.id).toBe(2)
  })

  // o salvar recarrega o próprio documento por selectDocument: perguntar aí
  // travaria o salvar atrás da pergunta que ele mesmo responde
  it('does not ask when reloading the same document', async () => {
    useAppStore.getState().setTextoSujo(true)
    expect(await useAppStore.getState().selectDocument(1)).toBe(true)
    expect(useAppStore.getState().saidaDoTexto).toBeNull()
  })

  it('does not leave the project when flushing a note fails', async () => {
    const close = vi.fn()
    window.api.project = { close } as any
    useAppStore.setState({ notesFlush: async () => { throw new Error('disco cheio') } })
    await expect(useAppStore.getState().closeProject()).rejects.toThrow('disco cheio')
    expect(close).not.toHaveBeenCalled()
    expect(useAppStore.getState().currentDocument?.id).toBe(1)
  })

  it('preserves the note editor and panel when a flush fails', async () => {
    useAppStore.setState({
      editorNoteId: 7, notesPanelOpen: true,
      notesFlush: async () => { throw new Error('disco cheio') }
    })
    await expect(useAppStore.getState().openNoteEditor(8)).rejects.toThrow('disco cheio')
    await expect(useAppStore.getState().toggleNotesPanel()).rejects.toThrow('disco cheio')
    expect(useAppStore.getState().editorNoteId).toBe(7)
    expect(useAppStore.getState().notesPanelOpen).toBe(true)
  })
})
