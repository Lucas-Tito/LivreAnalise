// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { SimplePromptDialog } from '../src/renderer/src/components/workspace/SimplePromptDialog'

afterEach(cleanup)
it('retains the draft and displays async failures instead of closing', async () => {
  const close = vi.fn()
  const save = vi.fn().mockRejectedValue(new Error('disco cheio'))
  render(<SimplePromptDialog open onOpenChange={close} title="Renomear" label="Nome" initialValue="Preservar" onSubmit={save} />)
  await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  expect((await screen.findByRole('alert')).textContent).toContain('disco cheio')
  expect((screen.getByRole('textbox', { name: 'Nome' }) as HTMLInputElement).value).toBe('Preservar')
  expect(close).not.toHaveBeenCalled()
})

it('does not submit twice while waiting and closes only after success', async () => {
  let done!: () => void
  const save = vi.fn(() => new Promise<void>((resolve) => { done = resolve }))
  const close = vi.fn()
  render(<SimplePromptDialog open onOpenChange={close} title="Criar" label="Nome" initialValue="Novo" onSubmit={save} />)
  await userEvent.dblClick(screen.getByRole('button', { name: 'Salvar' }))
  expect(save).toHaveBeenCalledTimes(1)
  expect(close).not.toHaveBeenCalled()
  done()
  await waitFor(() => expect(close).toHaveBeenCalledWith(false))
})
