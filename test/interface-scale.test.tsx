// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('restores the saved interface scale and ignores invalid values', async () => {
  const setInterfaceScale = vi.fn()
  vi.stubGlobal('api', { view: { setInterfaceScale } })
  localStorage.setItem('livreanalise-interface-scale', '1.3')
  const { useInterfaceScaleStore } = await import('../src/renderer/src/stores/interfaceScaleStore')
  expect(setInterfaceScale).toHaveBeenCalledWith(1.3)
  expect(useInterfaceScaleStore.getState().scale).toBe(1.3)
  useInterfaceScaleStore.getState().setScale(NaN)
  expect(localStorage.getItem('livreanalise-interface-scale')).toBe('1.3')
})

it('changes the interface scale without changing the document zoom', async () => {
  const setInterfaceScale = vi.fn()
  vi.stubGlobal('api', { view: { setInterfaceScale, notifyFont: vi.fn() } })
  const { SettingsDialog } = await import('../src/renderer/src/components/SettingsDialog')
  render(<SettingsDialog open onOpenChange={() => {}} />)
  await userEvent.selectOptions(screen.getByLabelText('Tamanho da interface'), '1.2')
  expect(setInterfaceScale).toHaveBeenLastCalledWith(1.2)
  expect(localStorage.getItem('livreanalise-interface-scale')).toBe('1.2')
  expect(localStorage.getItem('livreanalise-zoom')).toBeNull()
})
