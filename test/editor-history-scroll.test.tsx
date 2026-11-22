// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NotesPanel } from '../src/renderer/src/components/workspace/NotesPanel'
import { MemoEditor } from '../src/renderer/src/components/workspace/MemoDialog'
import { CodeDialog } from '../src/renderer/src/components/workspace/CodeDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

const code = { id: 1, guid: 'c', name: 'Código', color: '#000000', description: 'original', memo: 'original', parentId: null, isCategory: false, sortOrder: 0, createdAt: '', usageCount: 0 }

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', { configurable: true, value: {
    app: { setNotesDirty: vi.fn(), setCodeDirty: vi.fn(), setMemoDirty: vi.fn() }
  } })
})
afterEach(cleanup)

it.each(['nota', 'memo', 'descrição'])('preserva o desfazer/refazer nativo no editor de %s', (kind) => {
  if (kind === 'nota') {
    useAppStore.setState({ editorNoteId: 1, projectNotes: [{ id: 1, guid: 'n', scope: 'project', documentId: null,
      title: 'Nota', body: 'original', startPos: null, endPos: null, anchorStatus: 'attached', anchorText: null, createdAt: '', updatedAt: '' }] })
    render(<NotesPanel />)
  } else if (kind === 'memo') {
    render(<MemoEditor target={{ id: 1, kind: 'código', name: 'Código', memo: 'original' }} onClose={() => {}} />)
  } else {
    render(<CodeDialog open existing={code} title="Editar código" onOpenChange={() => {}} onSubmit={async () => true} />)
  }
  const label = kind === 'nota' ? 'Conteúdo da nota' : kind === 'memo' ? 'Texto do memo' : 'Descrição'
  const field = screen.getByRole('textbox', { name: label }) as HTMLTextAreaElement
  for (const [inputType, value] of [['historyUndo', 'anterior'], ['historyRedo', 'original']]) {
    field.scrollTop = 480
    fireEvent(field, new InputEvent('beforeinput', { bubbles: true, inputType }))
    field.scrollTop = 0
    fireEvent.input(field, { target: { value, selectionStart: 3, selectionEnd: 3 }, inputType })
    expect(field.value).toBe(value)
    expect(field.scrollTop).toBe(480)
    expect(field.selectionStart).toBe(3)
    expect(field.selectionEnd).toBe(3)
  }
})
