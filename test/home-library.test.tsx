// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { HomeLibrary } from '../src/renderer/src/components/home/HomeLibrary'
import { useAppStore } from '../src/renderer/src/stores/appStore'

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ loadRecents: async () => {} })
})
afterEach(cleanup)

it('reports project-opening failures rather than silently rejecting the click', async () => {
  useAppStore.setState({ openProject: async () => { throw new Error('projeto corrompido') } })
  render(<HomeLibrary onTranscribe={() => {}} />)
  const button = screen.getByRole('button', { name: /Abrir projeto/ }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false))
  await userEvent.click(button)
  expect((await screen.findByRole('alert')).textContent).toContain('projeto corrompido')
})

it('prevents opening a second project while an operation is pending', async () => {
  const open = vi.fn(() => new Promise<void>(() => {}))
  useAppStore.setState({ openProject: open })
  render(<HomeLibrary onTranscribe={() => {}} />)
  const button = screen.getByRole('button', { name: /Abrir projeto/ }) as HTMLButtonElement
  await waitFor(() => expect(button.disabled).toBe(false))
  await userEvent.dblClick(button)
  expect(open).toHaveBeenCalledTimes(1)
  expect(button.disabled).toBe(true)
})
