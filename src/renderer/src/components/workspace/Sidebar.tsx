import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Tags } from 'lucide-react'
import { DocumentsPanel } from './DocumentsPanel'
import { CodesPanel } from './CodesPanel'
import { cn } from '@/lib/utils'
import type { CodeWithCount } from '@shared/types'
import { useAppStore } from '@/stores/appStore'

type Tab = 'documents' | 'codes'

const MIN_WIDTH = 220
const MAX_WIDTH = 640
const DEFAULT_WIDTH = 288
const WIDTH_KEY = 'sidebarWidth'

interface Props {
  // null fecha o detalhe: o arrasto usa isso para não deixar painel nenhum em
  // cima da lista enquanto o código está em movimento.
  onViewCode: (code: CodeWithCount | null) => void
}

export function Sidebar({ onViewCode }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('documents')
  const [width, setWidth] = useState(() => {
    const stored = Number(localStorage.getItem(WIDTH_KEY))
    return stored >= MIN_WIDTH && stored <= MAX_WIDTH ? stored : DEFAULT_WIDTH
  })
  const [resizing, setResizing] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth)
  const notesOpen = useAppStore((s) => s.notesPanelOpen)
  const maxWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, viewportWidth - (notesOpen ? 320 : 0) - 368))
  const visibleWidth = Math.min(width, maxWidth)
  const widthRef = useRef(width)
  const persistWidth = (next: number): void => {
    setWidth(next)
    widthRef.current = next
    localStorage.setItem(WIDTH_KEY, String(next))
  }
  useEffect(() => {
    const resize = (): void => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const tabs: { id: Tab; label: string; icon: JSX.Element }[] = [
    { id: 'documents', label: 'Documentos', icon: <FileText className="h-4 w-4" /> },
    { id: 'codes', label: 'Códigos', icon: <Tags className="h-4 w-4" /> }
  ]

  const onMouseMove = useCallback((e: MouseEvent) => {
    const next = Math.min(maxWidth, Math.max(MIN_WIDTH, e.clientX))
    widthRef.current = next
    setWidth(next)
  }, [maxWidth])

  useEffect(() => {
    if (!resizing) return
    const stop = (): void => {
      setResizing(false)
      localStorage.setItem(WIDTH_KEY, String(widthRef.current))
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
    }
  }, [resizing, onMouseMove])

  return (
    <>
      <div
        className="flex h-full shrink-0 flex-col border-r bg-card"
        style={{ width: visibleWidth }}
      >
        <div className="flex border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
               onClick={() => setTab(t.id)}
               aria-pressed={tab === t.id}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors',
                tab === t.id
                  ? 'border-b-2 border-primary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1">
          {tab === 'documents' && <DocumentsPanel />}
          {tab === 'codes' && <CodesPanel onViewCode={onViewCode} />}
        </div>
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label="Largura da barra lateral"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={visibleWidth}
        onKeyDown={(e) => {
          const next = e.key === 'ArrowLeft' ? visibleWidth - 16 : e.key === 'ArrowRight' ? visibleWidth + 16
            : e.key === 'Home' ? MIN_WIDTH : e.key === 'End' ? maxWidth : null
          if (next == null) return
          e.preventDefault()
          persistWidth(Math.max(MIN_WIDTH, Math.min(maxWidth, next)))
        }}
        onMouseDown={() => setResizing(true)}
        title="Arraste para redimensionar"
        className={cn(
          '-ml-1 w-2 shrink-0 cursor-col-resize hover:bg-primary/20 focus-visible:bg-primary/30 focus-visible:outline-none',
          resizing && 'bg-primary/30'
        )}
      />
      {resizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </>
  )
}
