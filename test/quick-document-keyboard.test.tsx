// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QuickDocumentDialog } from '../src/renderer/src/components/workspace/QuickDocumentDialog'
import { useAppStore } from '../src/renderer/src/stores/appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    documents: [
      { id: 1, guid: 'a', name: 'Entrevista João', charCount: 10, importedAt: '', originalFormat: 'txt', sourceFilename: null },
      { id: 2, guid: 'b', name: 'Entrevista Maria', charCount: 10, importedAt: '', originalFormat: 'txt', sourceFilename: null }
    ]
  })
})
afterEach(() => cleanup())

it('filtra ignorando acentos e abre com Enter', async () => {
  const select = vi.fn(async () => true)
  const opened = vi.fn()
  const changed = vi.fn()
  useAppStore.setState({ selectDocument: select })
  const user = userEvent.setup()
  render(<QuickDocumentDialog open onOpenChange={changed} onOpened={opened} />)
  await user.type(screen.getByRole('combobox'), 'joao{Enter}')
  expect(select).toHaveBeenCalledWith(1)
  expect(changed).toHaveBeenCalledWith(false)
  expect(opened).toHaveBeenCalledOnce()
})

it('mantém a busca aberta quando a troca é cancelada', async () => {
  const select = vi.fn(async () => false)
  const changed = vi.fn()
  useAppStore.setState({ selectDocument: select })
  render(<QuickDocumentDialog open onOpenChange={changed} onOpened={vi.fn()} />)
  await userEvent.setup().keyboard('{ArrowDown}{Enter}')
  expect(select).toHaveBeenCalledWith(2)
  expect(changed).not.toHaveBeenCalled()
})

it('restaura o foco e a seleção anteriores ao cancelar', async () => {
  function Example(): React.JSX.Element {
    const [open, setOpen] = useState(false)
    return <>
      <textarea aria-label="Leitor" defaultValue="texto do documento" onKeyDown={(event) => {
        if (event.ctrlKey && event.key === 'p') { event.preventDefault(); setOpen(true) }
      }} />
      <QuickDocumentDialog open={open} onOpenChange={setOpen} onOpened={vi.fn()} />
    </>
  }
  const user = userEvent.setup()
  render(<Example />)
  const reader = screen.getByRole('textbox', { name: 'Leitor' }) as HTMLTextAreaElement
  reader.focus()
  reader.setSelectionRange(2, 8)
  await user.keyboard('{Control>}p{/Control}')
  expect(document.activeElement).toBe(screen.getByRole('combobox'))
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(reader))
  expect([reader.selectionStart, reader.selectionEnd]).toEqual([2, 8])
})
