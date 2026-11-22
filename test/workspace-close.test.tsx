// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AppCloseDialog } from '../src/renderer/src/components/workspace/AppCloseDialog'
import { MemoEditor } from '../src/renderer/src/components/workspace/MemoDialog'
import { Workspace } from '../src/renderer/src/components/workspace/Workspace'
import { useAppStore } from '../src/renderer/src/stores/appStore'

vi.mock('../src/renderer/src/components/workspace/TopBar', () => ({ TopBar: () => null }))
vi.mock('../src/renderer/src/components/workspace/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('../src/renderer/src/components/workspace/TranscriptPanel', () => ({ TranscriptPanel: () => null }))
vi.mock('../src/renderer/src/components/workspace/CodeQuotationsDialog', () => ({ CodeQuotationsDialog: () => null }))

afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})

it('retries failed saves, keeps the window open on cancel, and closes on explicit discard', async () => {
  let requestClose!: () => Promise<void>
  const confirmClose = vi.fn()
  const cancelClose = vi.fn()
  const notesFlush = vi.fn().mockRejectedValue(new Error('disco cheio'))
  Object.defineProperty(window, 'api', { configurable: true, value: {
    app: {
      confirmClose, cancelClose,
      onCloseRequested: (callback: typeof requestClose) => {
        requestClose = callback
        return () => undefined
      }
    }
  } })
  useAppStore.setState({ notesFlush })
  const user = userEvent.setup()
  render(<><Workspace /><AppCloseDialog /></>)

  await act(requestClose)
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(notesFlush).toHaveBeenCalledTimes(2)
  expect(confirmClose).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(cancelClose).toHaveBeenCalledOnce()

  await act(requestClose)
  await user.click(screen.getByRole('button', { name: 'Sair sem salvar' }))
  expect(confirmClose).toHaveBeenCalledOnce()
})

it('does not confirm closing with a late unsaved memo edit', async () => {
  let requestClose!: () => Promise<void>
  let finishNote!: () => void
  const writes: string[] = []
  let writesAtClose: string[] | undefined
  Object.defineProperty(window, 'api', { configurable: true, value: { app: {
    confirmClose: () => { writesAtClose = [...writes] },
    cancelClose: vi.fn(), setMemoDirty: vi.fn(),
    onCloseRequested: (fn: typeof requestClose) => { requestClose = fn; return () => {} }
  }}})
  useAppStore.setState({
    updateCode: vi.fn(async ({ memo }) => { writes.push(memo!) }),
    notesFlush: () => new Promise<void>((resolve) => { finishNote = resolve })
  })
  try {
    render(<><MemoEditor target={{ id: 1, kind: 'código', name: 'Código', memo: 'memo' }} onClose={() => {}} /><AppCloseDialog /></>)
    const user = userEvent.setup()
    const field = screen.getByLabelText('Texto do memo') as HTMLTextAreaElement
    await user.type(field, ' A')
    let closing!: Promise<void>
    await act(async () => { closing = requestClose() })
    await waitFor(() => expect(finishNote).toBeTypeOf('function'))
    expect(writes).toEqual(['memo A'])
    expect(field.readOnly).toBe(true)
    await user.type(field, ' B')
    await act(async () => { finishNote(); await closing })
    expect(field.value).toBe('memo A')
    expect(writesAtClose).toEqual(['memo A'])
  } finally {
    cleanup()
  }
})
