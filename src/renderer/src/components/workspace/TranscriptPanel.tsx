import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FileText, Pencil, Save, Trash2, X } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { computeSegments } from '@/lib/segments'
import { contrastText } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CodingPopover } from './CodingPopover'
import type { CodeWithCount } from '@shared/types'

interface PendingSelection {
  start: number
  end: number
  x: number
  y: number
}

interface Bar {
  codingId: number
  codeId: number
  color: string
  name: string
  top: number
  column: number
}

function resolveOffset(node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const el = node.parentElement
    const pos = el?.getAttribute('data-pos')
    if (pos != null) return parseInt(pos, 10) + offset
    return null
  }
  if (node instanceof HTMLElement) {
    const pos = node.getAttribute('data-pos')
    if (pos != null) {
      let acc = parseInt(pos, 10)
      for (let i = 0; i < offset && i < node.childNodes.length; i++) {
        acc += node.childNodes[i].textContent?.length ?? 0
      }
      return acc
    }
  }
  return null
}

export function TranscriptPanel(): JSX.Element {
  const currentDocument = useAppStore((s) => s.currentDocument)
  const codings = useAppStore((s) => s.codings)
  const codes = useAppStore((s) => s.codes)
  const addCoding = useAppStore((s) => s.addCoding)
  const removeCoding = useAppStore((s) => s.removeCoding)
  const updateDocumentText = useAppStore((s) => s.updateDocumentText)

  const scrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [bars, setBars] = useState<Bar[]>([])
  const [columnCount, setColumnCount] = useState(1)
  const [hoverCoding, setHoverCoding] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const codeMap = useMemo(() => {
    const map = new Map<number, CodeWithCount>()
    for (const c of codes) map.set(c.id, c)
    return map
  }, [codes])

  const text = currentDocument?.plainText ?? ''
  const segments = useMemo(
    () => computeSegments(text.length, codings),
    [text, codings]
  )

  const measure = useCallback(() => {
    const container = scrollRef.current
    const textEl = textRef.current
    if (!container || !textEl) return
    const containerTop = container.getBoundingClientRect().top
    const scrollTop = container.scrollTop
    const raw = codings
      .map((c) => {
        const el = textEl.querySelector(
          `[data-pos="${c.startPos}"]`
        ) as HTMLElement | null
        const code = codeMap.get(c.codeId)
        if (!el || !code) return null
        const top = el.getBoundingClientRect().top - containerTop + scrollTop
        return {
          codingId: c.id,
          codeId: c.codeId,
          color: code.color,
          name: code.name,
          top
        }
      })
      .filter((b): b is Omit<Bar, 'column'> => b !== null)

    raw.sort((a, b) => a.top - b.top)
    const colBottoms: number[] = []
    const placed: Bar[] = raw.map((b) => {
      let column = colBottoms.findIndex((bottom) => bottom <= b.top)
      if (column === -1) {
        column = colBottoms.length
        colBottoms.push(0)
      }
      colBottoms[column] = b.top + 24
      return { ...b, column }
    })
    setBars(placed)
    setColumnCount(Math.max(1, colBottoms.length))
  }, [codings, codeMap])

  useLayoutEffect(() => {
    measure()
    const container = scrollRef.current
    if (!container) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(container)
    return () => ro.disconnect()
  }, [measure, text])

  const handleMouseUp = (): void => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return
    }
    const range = selection.getRangeAt(0)
    const a = resolveOffset(range.startContainer, range.startOffset)
    const b = resolveOffset(range.endContainer, range.endOffset)
    if (a == null || b == null) return
    const start = Math.min(a, b)
    const end = Math.max(a, b)
    if (end <= start) return
    const rect = range.getBoundingClientRect()
    setPending({ start, end, x: rect.left, y: rect.bottom + 6 })
  }

  const applyCode = async (codeId: number): Promise<void> => {
    if (!pending) return
    await addCoding(codeId, pending.start, pending.end)
    setPending(null)
    window.getSelection()?.removeAllRanges()
  }

  const startEditing = (): void => {
    setPending(null)
    setDraft(text)
    setEditing(true)
  }

  const cancelEditing = (): void => {
    setEditing(false)
    setDraft('')
  }

  const saveEditing = async (): Promise<void> => {
    if (!currentDocument) return
    setSaving(true)
    try {
      await updateDocumentText(currentDocument.id, draft)
      setEditing(false)
      setDraft('')
    } finally {
      setSaving(false)
    }
  }

  if (!currentDocument) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center text-muted-foreground">
        <FileText className="mb-3 h-10 w-10" />
        <p className="text-sm">
          Selecione uma transcricao na barra lateral para comecar a codificar.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{currentDocument.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {currentDocument.charCount.toLocaleString()} caracteres ·{' '}
            {codings.length} codificacoes
          </span>
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                <X className="h-4 w-4" /> Cancelar
              </Button>
              <Button size="sm" onClick={saveEditing} disabled={saving}>
                <Save className="h-4 w-4" /> Salvar texto
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={startEditing}>
              <Pencil className="h-4 w-4" /> Editar texto
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          {codings.length > 0 && (
            <p className="mb-2 text-xs text-amber-500">
              Editar o texto pode reposicionar ou remover codificacoes
              automaticamente conforme o trecho alterado.
            </p>
          )}
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1 resize-none font-mono text-sm leading-7"
            spellCheck={false}
          />
        </div>
      ) : (
        <div ref={scrollRef} className="relative flex-1 overflow-auto">
          <div className="flex">
          <div
            ref={textRef}
            onMouseUp={handleMouseUp}
            className="transcript flex-1 whitespace-pre-wrap px-6 py-5 text-[15px] leading-7"
          >
            {segments.length === 0 ? (
              <span className="text-muted-foreground">
                (Documento vazio)
              </span>
            ) : (
              segments.map((seg) => {
                const segText = text.slice(seg.start, seg.end)
                if (seg.codingIds.length === 0) {
                  return (
                    <span key={seg.start} data-pos={seg.start}>
                      {segText}
                    </span>
                  )
                }
                const topCoding = codings.find(
                  (c) => c.id === seg.codingIds[seg.codingIds.length - 1]
                )
                const topColor = topCoding
                  ? codeMap.get(topCoding.codeId)?.color ?? '#888'
                  : '#888'
                const isHover = seg.codingIds.includes(hoverCoding ?? -1)
                return (
                  <span
                    key={seg.start}
                    data-pos={seg.start}
                    title={seg.codingIds
                      .map((id) => {
                        const cd = codings.find((c) => c.id === id)
                        return cd ? codeMap.get(cd.codeId)?.name : ''
                      })
                      .filter(Boolean)
                      .join(', ')}
                    style={{
                      backgroundColor: `${topColor}${isHover ? '66' : '33'}`,
                      boxShadow: `inset 0 -2px 0 0 ${topColor}`,
                      borderRadius: 2
                    }}
                  >
                    {segText}
                  </span>
                )
              })
            )}
          </div>

          <div
            className="relative shrink-0 border-l bg-muted/30"
            style={{ width: Math.max(180, columnCount * 150 + 16) }}
          >
            {bars.map((bar) => (
              <div
                key={bar.codingId}
                onMouseEnter={() => setHoverCoding(bar.codingId)}
                onMouseLeave={() => setHoverCoding(null)}
                className="group absolute flex h-[22px] items-center gap-1 rounded px-1.5 text-xs"
                style={{
                  top: bar.top,
                  left: 8 + bar.column * 150,
                  width: 142,
                  backgroundColor: bar.color,
                  color: contrastText(bar.color)
                }}
              >
                <span className="truncate">{bar.name}</span>
                <button
                  className="ml-auto opacity-0 group-hover:opacity-100"
                  title="Remover codificacao"
                  onClick={() => removeCoding(bar.codingId)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            </div>
          </div>
        </div>
      )}

      {pending && (
        <CodingPopover
          x={pending.x}
          y={pending.y}
          onClose={() => setPending(null)}
          onApply={applyCode}
        />
      )}
    </div>
  )
}
