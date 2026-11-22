// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TranscriptPanel } from '../src/renderer/src/components/workspace/TranscriptPanel'
import { useAppStore } from '../src/renderer/src/stores/appStore'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('posiciona as bolinhas abaixo das letras sem reservar espaço no texto', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 100, 28)
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    currentDocument: { id: 1, guid: 'd', name: 'Entrevista', plainText: 'antes citação depois', charCount: 20, importedAt: '', originalFormat: 'txt', sourceFilename: null },
    codes: [{ id: 1, guid: 'c', name: 'Código', color: '#ff0000', description: null, memo: '', parentId: null, sortOrder: 0, createdAt: '', usageCount: 1 }],
    codings: [{ id: 1, guid: 'q', documentId: 1, codeId: 1, startPos: 6, endPos: 13, createdAt: '' }]
  })
  const { container } = render(<TranscriptPanel />)
  const transcript = container.querySelector('.transcript')!
  const originalText = transcript.textContent
  expect(screen.queryByRole('slider', { name: 'Início da citação' })).toBeNull()
  fireEvent.click(screen.getByText('citação', { exact: true }))
  for (const name of ['Início da citação', 'Fim da citação']) {
    const handle = screen.getByRole('slider', { name })
    expect(handle.style.width).toBe('0px')
    expect(handle.style.height).toBe('0px')
    expect(handle.style.marginLeft).toBe('')
    expect(handle.style.marginRight).toBe('')
    expect(handle.style.verticalAlign).toBe('baseline')
    const hitArea = handle.firstElementChild as HTMLElement
    expect(hitArea.style.position).toBe('absolute')
    expect(hitArea.style.width).toBe('20px')
    const stem = hitArea.children[0] as HTMLElement
    const dot = hitArea.children[1] as HTMLElement
    expect(stem.style.height).toBe('1.15em')
    expect(dot.style.top).toBe(stem.style.height)
    expect(parseFloat(hitArea.style.top) + parseFloat(dot.style.top)).toBeCloseTo(0.3)
    expect(dot.style.width).toBe('8px')
    expect(handle.tabIndex).toBe(0)
  }
  expect(transcript.textContent).toBe(originalText)
})
