// @vitest-environment jsdom
import { createRef, useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Textarea } from '../src/renderer/src/components/ui/textarea'

afterEach(cleanup)

function Editor() {
  const [value, setValue] = useState('original')
  return <div data-testid="panel"><Textarea aria-label="Texto" value={value} onChange={(e) => setValue(e.target.value)} /></div>
}

it.each(['historyUndo', 'historyRedo'])('preserva a rolagem do campo e do painel no %s, sem mudar a seleção', (inputType) => {
  render(<Editor />)
  const field = screen.getByRole('textbox') as HTMLTextAreaElement
  const panel = screen.getByTestId('panel')
  Object.defineProperty(panel, 'scrollHeight', { value: 2000 })
  Object.defineProperty(panel, 'clientHeight', { value: 300 })
  field.scrollTop = 480
  field.scrollLeft = 40
  panel.scrollTop = 260
  fireEvent(field, new InputEvent('beforeinput', { bubbles: true, inputType }))
  field.scrollTop = field.scrollLeft = panel.scrollTop = 0
  fireEvent.input(field, { target: { value: 'alterado', selectionStart: 2, selectionEnd: 5 }, inputType })
  expect(field.value).toBe('alterado')
  expect(field.scrollTop).toBe(480)
  expect(field.scrollLeft).toBe(40)
  expect(panel.scrollTop).toBe(260)
  expect(field.selectionStart).toBe(2)
  expect(field.selectionEnd).toBe(5)

  fireEvent(field, new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText' }))
  field.scrollTop = 600
  fireEvent.input(field, { target: { value: 'outra alteração' }, inputType: 'insertText' })
  expect(field.scrollTop).toBe(600)
})

it('também preserva a rolagem em campo não controlado e mantém o ref externo', async () => {
  const ref = createRef<HTMLTextAreaElement>()
  render(<Textarea ref={ref} defaultValue="original" />)
  const field = screen.getByRole('textbox') as HTMLTextAreaElement
  expect(ref.current).toBe(field)
  field.scrollTop = 480
  fireEvent(field, new InputEvent('beforeinput', { bubbles: true, inputType: 'historyUndo' }))
  field.scrollTop = 0
  await act(async () => {
    fireEvent.input(field, { target: { value: 'anterior' }, inputType: 'historyUndo' })
  })
  expect(field.scrollTop).toBe(480)
  expect(field.value).toBe('anterior')
  expect(ref.current).toBe(field)
})
