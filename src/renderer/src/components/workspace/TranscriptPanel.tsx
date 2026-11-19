import { type JSX, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, MessageSquare, Pencil, Save, Search, Trash2, X } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useZoomStore } from '@/stores/zoomStore'
import {
  anchorPositions,
  buildLineRows,
  computeSegments,
  markNoteAnchors,
  markSearchHits,
  markPendingSelection,
  resolveAnchorPos
} from '@shared/segments'
import {
  clampLaneWidth,
  distributeExcerptBars,
  laneBounds,
  larguraGuardada,
  packBarColumns,
  type LaneConfig
} from '@/lib/barLayout'
import { acharOcorrencias } from '@shared/busca'
import { applyCodingAdjustments } from '@shared/editAdjust'
import { contrastText, formatCount, randomColor } from '@/lib/utils'
import { codedSegmentBackground, distinctSegmentCodes, groupCodeRuns, hoveredSegmentColor, mergeLineBands, multipleCodeUnderline, noteUnderlineStyle, snapToLine } from '@/lib/codingHighlight'
import {
  captureTranscriptViewport,
  remapTranscriptViewport,
  restoreTranscriptViewport,
  type TranscriptViewport
} from '@/lib/transcriptViewport'
import { Button } from '@/components/ui/button'
import { CodingPopover } from './CodingPopover'
import { ExcerptPopover } from './ExcerptPopover'
import { excerptAction } from '@/lib/excerptAction'
import { mensagemDeErro } from '@/lib/erros'
import { CodeDialog, type CodeDialogValue } from './CodeDialog'
import type { CodeWithCount } from '@shared/types'
import { useAsyncAction } from '@/lib/useAsyncAction'
import { applyTextareaChange } from '@/lib/textareaChange'

interface PendingSelection {
  start: number
  end: number
  x: number
  y: number
}

interface Bar {
  codingId: number
  codingIds: number[]
  codeId: number
  color: string
  name: string
  top: number
  column: number
  columnSpan: number
}

const BAR_LANE_KEY = 'transcriptCodesWidth'
const BAR_LANE_MIN = 120
const BAR_LANE_MAX = 640
const BAR_LANE_AUTO_BASE = 150
const BAR_LANE_PAD = 16
const BAR_GAP = 8
const BAR_MIN_WIDTH = 72

// As medidas da faixa num lugar so: passar por parametro evita o barLayout
// repetir os numeros e discordar em silencio quando uma delas mudar.
const LANE: LaneConfig = {
  minimoPorColuna: BAR_MIN_WIDTH + BAR_GAP,
  padding: BAR_LANE_PAD,
  autoPorColuna: BAR_LANE_AUTO_BASE,
  tetoPadrao: BAR_LANE_MAX,
  pisoAbsoluto: BAR_LANE_MIN
}

// Nome da etiqueta com tooltip nativo só quando o texto está cortado: o
// `title` incondicional mostrava dica até em nomes curtos, poluindo o hover.
function BarName({ name }: { name: string }): JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = (): void => {
      setTruncated(el.scrollWidth > el.clientWidth + 1)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [name])

  return (
    <span
      ref={ref}
      className="min-w-0 flex-1 truncate"
      title={truncated ? name : undefined}
    >
      {name}
    </span>
  )
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
  const createCode = useAppStore((s) => s.createCode)
  const updateCoding = useAppStore((s) => s.updateCoding)
  const removeCoding = useAppStore((s) => s.removeCoding)
  const updateDocumentText = useAppStore((s) => s.updateDocumentText)
  const setTextoSujo = useAppStore((s) => s.setTextoSujo)
  const registerTextoAcoes = useAppStore((s) => s.registerTextoAcoes)
  const podeSairDoTexto = useAppStore((s) => s.podeSairDoTexto)
  const documentNotes = useAppStore((s) => s.documentNotes)
  const projectNotes = useAppStore((s) => s.projectNotes)
  const editorNoteId = useAppStore((s) => s.editorNoteId)
  const updateNote = useAppStore((s) => s.updateNote)
  const navigateNoteId = useAppStore((s) => s.navigateNoteId)
  const clearNavigateNote = useAppStore((s) => s.clearNavigateNote)
  const locateCodingId = useAppStore((s) => s.locateCodingId)
  const locateSeq = useAppStore((s) => s.locateSeq)
  const createNote = useAppStore((s) => s.createNote)
  const openNoteEditor = useAppStore((s) => s.openNoteEditor)
  const zoom = useZoomStore((s) => s.zoom)
  const { error: actionError, run } = useAsyncAction()

  const scrollRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const backdropContentRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<TranscriptViewport | null>(null)
  const [pending, setPending] = useState<PendingSelection | null>(null)
  const [excerptMenu, setExcerptMenu] = useState<{
    x: number; y: number; codingIds: number[]; noteIds: number[]
  } | null>(null)
  const closeExcerptMenu = useCallback(() => setExcerptMenu(null), [])
  const selectionGestureRef = useRef(false)
  // Código novo criado a partir de um trecho: guarda o trecho enquanto o
  // diálogo de configuração está aberto, porque o popover já fechou. A cor
  // sorteada mora aqui para não mudar a cada render do diálogo.
  const [novoCodigo, setNovoCodigo] = useState<{
    start: number
    end: number
    initial: Partial<CodeDialogValue>
  } | null>(null)
  const [bars, setBars] = useState<Bar[]>([])
  const [noteMarks, setNoteMarks] = useState<Array<{ ids: number[]; top: number }>>([])
  const [multiBands, setMultiBands] = useState<
    Array<{ key: string; left: number; top: number; width: number; colors: string[] }>
  >([])
  const [barHeight, setBarHeight] = useState(22)
  const [columnCount, setColumnCount] = useState(1)
  const columnFloorRef = useRef(1)
  const [laneWidth, setLaneWidth] = useState<number | null>(() => {
    try {
      return larguraGuardada(localStorage.getItem(BAR_LANE_KEY), LANE)
    } catch {
      return null
    }
  })
  const [laneResizing, setLaneResizing] = useState(false)
  const laneResizeRef = useRef<{ startX: number; startWidth: number } | null>(
    null
  )
  const laneWidthRef = useRef<number | null>(laneWidth)
  laneWidthRef.current = laneWidth
  const [hoverCoding, setHoverCoding] = useState<{ codingIds: number[]; color: string } | null>(null)
  const [hoverNoteIds, setHoverNoteIds] = useState<number[]>([])
  const [selectedCodingId, setSelectedCodingId] = useState<number | null>(null)
  // Busca no texto: Ctrl+F abre, Enter/F3 anda, Esc fecha. Os destaques entram
  // pelo mesmo pipeline de segmentos das codificacoes e das notas, para os tres
  // conviverem no mesmo trecho sem um apagar o outro.
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [termo, setTermo] = useState('')
  const [hitAtual, setHitAtual] = useState(0)
  const [buscaSeq, setBuscaSeq] = useState(0)
  const buscaInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState<{ codingId: number; end: 'start' | 'end' } | null>(null)
  const [dragPreviewPos, setDragPreviewPos] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setExcerptMenu(null) }, [currentDocument?.id, editing, codings, documentNotes])
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [flashNoteId, setFlashNoteId] = useState<number | null>(null)
  // Ocorrência localizada vinda do painel de trechos: pisca como a nota.
  const [flashCodingId, setFlashCodingId] = useState<number | null>(null)
  const [editTip, setEditTip] = useState<{
    x: number
    y: number
    label: string
  } | null>(null)

  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  // Arrasto do divisor: a faixa fica à direita, então mover o mouse para a
  // esquerda alarga (startX - clientX positivo) e para a direita estreita.
  // O overlay é pointer-events-none (para não quebrar o duplo clique), então
  // a seleção de texto durante o arrasto é bloqueada via body.
  useEffect(() => {
    if (!laneResizing) return
    const prevUserSelect = document.body.style.userSelect
    const prevCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const persistir = (): void => {
      const finalWidth = laneWidthRef.current
      try {
        if (finalWidth != null)
          localStorage.setItem(BAR_LANE_KEY, String(Math.round(finalWidth)))
      } catch {
        // armazenamento indisponível: só não persiste
      }
    }
    const stop = (): void => {
      setLaneResizing(false)
      laneResizeRef.current = null
      persistir()
    }
    const onMove = (e: MouseEvent): void => {
      const start = laneResizeRef.current
      if (!start) return
      // Soltar o botão fora da janela não entrega mouseup: sem isto o arrasto
      // ficava preso e a faixa seguia o ponteiro no retorno, sem botão nenhum.
      if (e.buttons === 0) {
        stop()
        return
      }
      setLaneWidth(
        clampLaneWidth(
          start.startWidth + (start.startX - e.clientX),
          columnCount,
          LANE,
          start.startWidth
        )
      )
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    // mesma guarda do arrasto de códigos: perder o foco encerra o gesto
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
      document.body.style.userSelect = prevUserSelect
      document.body.style.cursor = prevCursor
      // desmontar no meio do arrasto nao pode descartar a largura arrastada
      persistir()
    }
  }, [laneResizing, columnCount])

  // Largura efetiva: automática até o usuário arrastar; depois acompanha o
  // arrasto, mas nunca abaixo do mínimo que as colunas precisam para continuar
  // legíveis. As etiquetas dividem o espaço igualmente e truncam o nome.
  const autoLaneWidth = Math.max(180, columnCount * BAR_LANE_AUTO_BASE + 16)
  const minNeededLaneWidth = laneBounds(columnCount, LANE).minimo
  const effectiveLaneWidth =
    laneWidth == null ? autoLaneWidth : Math.max(minNeededLaneWidth, laneWidth)
  const barSlot = (effectiveLaneWidth - BAR_LANE_PAD) / Math.max(1, columnCount)

  const alpha = isDark
    ? { bg: '40', bgHover: '60', bar: 'bb' }
    : { bg: '1a', bgHover: '33', bar: '66' }

  // Faixa de códigos múltiplos acompanha o zoom: fixa em px, ela sumia no
  // zoom alto e dominava no zoom baixo.
  const codeBandW = 12 * zoom
  const codeBandH = 3 * zoom

  const posFromPoint = useCallback((x: number, y: number): number | null => {
    const range = document.caretRangeFromPoint?.(x, y)
    if (!range) return null
    return resolveOffset(range.startContainer, range.startOffset)
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!dragging) return
      const pos = posFromPoint(e.clientX, e.clientY)
      setDragPreviewPos(pos)
    }
    const onMouseUp = (e: MouseEvent): void => {
      if (!dragging) return
      const coding = codings.find((c) => c.id === dragging.codingId)
      if (!coding) { setDragging(null); setDragPreviewPos(null); return }
      const pos = posFromPoint(e.clientX, e.clientY)
      if (pos == null) { setDragging(null); setDragPreviewPos(null); return }
      const textLen = currentDocument?.plainText.length ?? 0
      if (dragging.end === 'start') {
        const newStart = Math.max(0, Math.min(pos, coding.endPos - 1))
        if (newStart !== coding.startPos) updateCoding(coding.id, newStart, coding.endPos)
      } else {
        const newEnd = Math.max(coding.startPos + 1, Math.min(pos, textLen))
        if (newEnd !== coding.endPos) updateCoding(coding.id, coding.startPos, newEnd)
      }
      setDragging(null)
      setDragPreviewPos(null)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging, codings, currentDocument, posFromPoint, updateCoding])

  const codeMap = useMemo(() => {
    const map = new Map<number, CodeWithCount>()
    for (const c of codes) map.set(c.id, c)
    return map
  }, [codes])

  const text = currentDocument?.plainText ?? ''
  const codingMap = useMemo(() => new Map(codings.map((c) => [c.id, c])), [codings])
  const noteById = useMemo(() => new Map(documentNotes.map((n) => [n.id, n])), [documentNotes])

  // Copia do texto original: o DOM também contém números de linha e alças,
  // além de dividir o trecho em spans para os realces.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent): void => {
      const target = document.activeElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      if (
        !textRef.current?.contains(range.startContainer) ||
        !textRef.current.contains(range.endContainer)
      ) return
      const start = resolveOffset(range.startContainer, range.startOffset)
      const end = resolveOffset(range.endContainer, range.endOffset)
      if (start == null || end == null || !e.clipboardData) return
      e.preventDefault()
      e.clipboardData.setData('text/plain', text.slice(start, end))
    }
    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [text])

  // Âncoras de notas de trecho: sublinhado pontilhado discreto, sem ocupar
  // a margem direita (que pertence às etiquetas dos códigos).
  const noteAnchors = useMemo(
    () =>
      documentNotes
        .filter(
          (n): n is typeof n & { startPos: number; endPos: number } =>
            n.scope === 'excerpt' &&
            n.anchorStatus === 'attached' &&
            n.startPos != null &&
            n.endPos != null
        )
        .map((n) => ({ id: n.id, start: n.startPos, end: n.endPos })),
    [documentNotes]
  )

  useEffect(() => {
    if (navigateNoteId == null) return
    const note = documentNotes.find((n) => n.id === navigateNoteId)
    if (note?.scope !== 'excerpt' || note.startPos == null || !textRef.current) {
      clearNavigateNote()
      return
    }
    const spans = Array.from(
      textRef.current.querySelectorAll<HTMLElement>('[data-pos]')
    )
    let target: HTMLElement | null = null
    for (const el of spans) {
      const pos = Number(el.getAttribute('data-pos'))
      if (Number.isNaN(pos)) continue
      if (pos <= note.startPos) target = el
      else break
    }
    target?.scrollIntoView({ block: 'center' })
    setFlashNoteId(note.id)
    clearNavigateNote()
    const timer = setTimeout(() => setFlashNoteId(null), 2500)
    return () => clearTimeout(timer)
  }, [navigateNoteId, documentNotes, clearNavigateNote])

  const previewCodings = useMemo(() => {
    if (!dragging || dragPreviewPos == null) return codings
    return codings.map((c) => {
      if (c.id !== dragging.codingId) return c
      if (dragging.end === 'start') {
        const newStart = Math.max(0, Math.min(dragPreviewPos, c.endPos - 1))
        return { ...c, startPos: newStart }
      } else {
        const newEnd = Math.max(c.startPos + 1, Math.min(dragPreviewPos, text.length))
        return { ...c, endPos: newEnd }
      }
    })
  }, [dragging, dragPreviewPos, codings, text])

  const segments = useMemo(
    () => computeSegments(text.length, codings),
    [text, codings]
  )
  const previewSegments = useMemo(
    () => computeSegments(text.length, previewCodings),
    [text, previewCodings]
  )
  const displaySegments = useMemo(
    () => markPendingSelection(dragging ? previewSegments : segments, pending),
    [dragging, previewSegments, segments, pending]
  )
  // Divide os segmentos nas fronteiras das notas para que o sublinhado
  // cubra exatamente a seleção anotada, não o parágrafo inteiro.
  const noteSegments = useMemo(
    () => markNoteAnchors(displaySegments, noteAnchors),
    [displaySegments, noteAnchors]
  )
  const quoteCount = codings.length
  const codesUsedInDoc = useMemo(
    () => new Set(codings.map((c) => c.codeId)).size,
    [codings]
  )
  const hits = useMemo(
    () =>
      buscaAberta
        ? acharOcorrencias(text, termo).map((o, i) => ({ id: i, ...o }))
        : [],
    [text, termo, buscaAberta]
  )
  const hitSegments = useMemo(() => markSearchHits(noteSegments, hits), [noteSegments, hits])
  const lineRows = useMemo(
    () => buildLineRows(text, hitSegments),
    [text, hitSegments]
  )

  // "Localizar ocorrências" do painel de códigos: rola o texto até o início
  // da citação e pisca o trecho inteiro. O store garante que o documento da
  // ocorrência já está aberto quando este efeito roda.
  // Depende de locateSeq, e não de locateCodingId: localizar a mesma
  // ocorrência de novo (F3 dando a volta) precisa rolar de novo, e o id
  // guardando a posição não pode ser limpo aqui — é dele que o painel de
  // trechos tira o contador "2 de 7".
  useEffect(() => {
    if (locateCodingId == null) return
    const coding = codings.find((c) => c.id === locateCodingId)
    if (!coding || !textRef.current) return
    const anchor = resolveAnchorPos(coding.startPos, anchorPositions(lineRows))
    const el =
      anchor === null
        ? null
        : (textRef.current.querySelector(
            `[data-pos="${anchor}"]`
          ) as HTMLElement | null)
    el?.scrollIntoView({ block: 'center' })
    setFlashCodingId(coding.id)
    const timer = setTimeout(() => setFlashCodingId(null), 2500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateSeq])

  const irParaHit = (dir: 1 | -1): void => {
    if (hits.length === 0) return
    setHitAtual((atual) => (atual + dir + hits.length) % hits.length)
    setBuscaSeq((n) => n + 1)
  }

  // O listener e em `window`, entao o atalho vale com o foco em qualquer campo:
  // Ctrl+F nao compete com a digitacao. Esc so fecha quando a busca esta aberta,
  // para nao sequestrar o Esc de dialogo nenhum. Nao dispara no modo de edicao,
  // onde a barra nao existe e a busca ficaria pendente sem aparecer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (editing) return
        e.preventDefault()
        setBuscaAberta(true)
        setTimeout(() => buscaInputRef.current?.select(), 0)
        return
      }
      if (!buscaAberta) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setBuscaAberta(false)
        setTermo('')
        return
      }
      if (e.key === 'F3') {
        e.preventDefault()
        irParaHit(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaAberta, hits.length, editing])

  // Termo novo recomeca do primeiro achado, senao o contador diria "7 de 2".
  useEffect(() => {
    setHitAtual(0)
    if (termo.trim() !== '') setBuscaSeq((n) => n + 1)
  }, [termo])

  useEffect(() => {
    if (!buscaAberta || hits.length === 0 || !textRef.current) return
    const hit = hits[Math.min(hitAtual, hits.length - 1)]
    const anchor = resolveAnchorPos(hit.start, anchorPositions(lineRows))
    const el =
      anchor === null
        ? null
        : (textRef.current.querySelector(`[data-pos="${anchor}"]`) as HTMLElement | null)
    el?.scrollIntoView({ block: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaSeq])

  const draftSegments = useMemo(() => {
    const previewCodings = applyCodingAdjustments(codings, text, draft)
    return computeSegments(draft.length, previewCodings)
  }, [draft, codings, text])

  const syncScroll = (): void => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

  const handleEditHover = (e: React.MouseEvent<HTMLDivElement>): void => {
    const backdrop = backdropRef.current
    if (!backdrop) return
    const x = e.clientX
    const y = e.clientY
    const spans = backdrop.querySelectorAll<HTMLElement>('[data-names]')
    for (const span of Array.from(spans)) {
      for (const r of Array.from(span.getClientRects())) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          const label = span.dataset.names ?? ''
          if (label) {
            const box = e.currentTarget.getBoundingClientRect()
            setEditTip({ x: x - box.left, y: y - box.top, label })
            return
          }
        }
      }
    }
    setEditTip(null)
  }

  // Reinicia antes do efeito de medição para não reter as colunas do documento
  // anterior, inclusive quando o próximo tem o mesmo texto ou nenhuma citação.
  useLayoutEffect(() => {
    columnFloorRef.current = 1
    setColumnCount(1)
    viewportRef.current = null
  }, [currentDocument?.id])

  const measure = useCallback(() => {
    // Retângulos dos intervalos sobre spans com data-pos, sem os controles de
    // arrasto. Reutilizado pelas etiquetas, marcadores e faixas, na leitura e
    // no preview de edição.
    const rangeRects = (
      spanList: HTMLElement[],
      startPos: number,
      endPos: number
    ): DOMRect[] => {
      const out: DOMRect[] = []
      for (const span of spanList) {
        const start = Number(span.dataset.pos)
        const nodes = Array.from(span.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
        let position = start
        for (const node of nodes) {
          const end = position + (node.textContent?.length ?? 0)
          if (position < endPos && end > startPos) {
            const range = document.createRange()
            range.setStart(node, Math.max(0, startPos - position))
            range.setEnd(node, Math.min(end, endPos) - position)
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width > 0 && rect.height > 0) out.push(rect)
            }
          }
          position = end
        }
      }
      return out
    }
    // Faixas contínuas de cada sequência com o mesmo conjunto de códigos,
    // sobre qualquer raiz com spans de data-pos (leitura ou preview).
    const collectBands = (
      root: HTMLElement,
      originTop: number,
      originLeft: number,
      segments: Array<{ start: number; end: number; codingIds: number[] }>
    ): Array<{ key: string; left: number; top: number; width: number; colors: string[] }> => {
      const spanList = Array.from(root.querySelectorAll<HTMLElement>('[data-pos]'))
      const bands: Array<{ key: string; left: number; top: number; width: number; colors: string[] }> = []
      for (const run of groupCodeRuns(segments, codingMap, codeMap, editing ? [] : hoverCoding?.codingIds)) {
        const rects = rangeRects(spanList, run.start, run.end).map((rect) => ({
          left: rect.left - originLeft,
          top: rect.top - originTop,
          right: rect.right - originLeft,
          bottom: rect.bottom - originTop
        }))
        mergeLineBands(rects, codeBandH).forEach((band, i) => {
          bands.push({ key: `${run.start}-${run.end}-${i}`, left: band.left, top: band.top, width: band.width, colors: run.colors })
        })
      }
      return bands
    }

    // Preview de edição: só as faixas (sem etiquetas nem marcadores).
    if (editing) {
      const content = backdropContentRef.current
      if (!content) return
      const box = content.getBoundingClientRect()
      setMultiBands(collectBands(content, box.top, box.left, draftSegments))
      return
    }

    const container = scrollRef.current
    const textEl = textRef.current
    if (!container || !textEl) return
    const containerTop = container.getBoundingClientRect().top
    const scrollTop = container.scrollTop
    const containerLeft = container.getBoundingClientRect().left
    const scrollLeft = container.scrollLeft
    const spans = Array.from(textEl.querySelectorAll<HTMLElement>('[data-pos]'))
    const height = Math.min(22, parseFloat(getComputedStyle(textEl).lineHeight) - 2)
    setBarHeight(height)
    // Centros verticais das linhas visuais cobertas por [startPos, endPos).
    // Serve às etiquetas da direita e aos marcadores de comentário da
    // esquerda: ambos precisam da geometria real do trecho, porque um
    // parágrafo é uma linha lógica só e a quebra visual é do navegador.
    const visualRects = (
      startPos: number,
      endPos: number
    ): Array<{ left: number; top: number; right: number; bottom: number }> =>
      rangeRects(spans, startPos, endPos).map((rect) => ({
        left: rect.left - containerLeft + scrollLeft,
        top: rect.top - containerTop + scrollTop,
        right: rect.right - containerLeft + scrollLeft,
        bottom: rect.bottom - containerTop + scrollTop
      }))
    const visualCenters = (startPos: number, endPos: number): number[] =>
      visualRects(startPos, endPos).map((rect) => (rect.top + rect.bottom) / 2)
    const raw = codings
      .map((c) => {
        const code = codeMap.get(c.codeId)
        if (!code) return null
        const lineTops = visualCenters(c.startPos, c.endPos).map((center) => center - height / 2)
        if (lineTops.length === 0) return null
        return {
          item: { codingId: c.id, codeId: c.codeId, color: code.color, name: code.name },
          lineTops
        }
      })
      .filter((b) => b !== null)

    // Reserva um pixel de folga: a quantização das linhas pode arredondar a
    // distância entre elas para baixo em níveis fracionários de zoom.
    const spacing = height + 1
    const distributed = distributeExcerptBars(raw, spacing).map(({ items, top }) => ({
      ...items[0],
      codingIds: items.map((item) => item.codingId),
      name: items[0].name,
      top
    }))
    const layout = packBarColumns(distributed, columnFloorRef.current, spacing)
    columnFloorRef.current = layout.columnCount
    setBars(layout.bars)
    setColumnCount(layout.columnCount)
    // Um marcador por linha de citação — não por nota, nem por parágrafo. O
    // meio do trecho é arredondado para o centro da linha visual mais próxima
    // (desempate para cima): o meio exato de uma citação de 2 linhas cai no
    // vão entre elas e o ícone flutuava sem tocar nenhuma, parecendo torto.
    // Notas da mesma linha dividem um marcador com contador, em vez de uma
    // delas ser empurrada para fora da própria citação; o clique abre a
    // escolha entre elas.
    const marks = noteAnchors
      .map((n) => {
        const top = snapToLine(visualCenters(n.start, n.end))
        if (top == null) return null
        return { id: n.id, top }
      })
      .filter((m) => m !== null)
      .sort((a, b) => a.top - b.top)
    const grouped: Array<{ ids: number[]; top: number }> = []
    for (const mark of marks) {
      const last = grouped[grouped.length - 1]
      if (last && Math.abs(mark.top - last.top) < 2) last.ids.push(mark.id)
      else grouped.push({ ids: [mark.id], top: mark.top })
    }
    setNoteMarks(grouped)
    // Faixa contínua dos trechos com vários códigos: uma faixa por linha
    // visual de cada sequência (ver groupCodeRuns), em vez do gradiente
    // reiniciado por span — o reinício fatiava trechos curtos e escondia as
    // cores do meio, e as cotas proporcionais pareciam fronteiras de código.
    setMultiBands(collectBands(textEl, containerTop - scrollTop, containerLeft - scrollLeft, hitSegments))
  }, [codings, codeMap, codingMap, codeBandH, draftSegments, editing, hitSegments, hoverCoding, lineRows, noteAnchors])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const container = editing ? backdropRef.current : scrollRef.current
    const content = editing ? backdropRef.current : textRef.current
    if (!container || !content) return
    restoreTranscriptViewport(container, content, viewport)
    if (editing && textareaRef.current) {
      const textarea = textareaRef.current
      textarea.setSelectionRange(viewport.position, viewport.position)
      textarea.focus({ preventScroll: true })
      textarea.scrollTop = container.scrollTop
      syncScroll()
    }
    viewportRef.current = null
  }, [editing])

  useLayoutEffect(() => {
    if (editing) syncScroll()
  }, [editing, draft])

  useLayoutEffect(() => {
    measure()
    const container = editing ? backdropRef.current : scrollRef.current
    const textEl = editing ? backdropContentRef.current : textRef.current
    if (!container || !textEl) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(container)
    // A largura da coluna de etiquetas vem de columnCount, que estreita a
    // coluna de texto e re-quebra as linhas: sem observar o proprio texto, as
    // posicoes medidas ficam obsoletas e as etiquetas descem junto com o erro.
    ro.observe(textEl)
    return () => ro.disconnect()
  }, [measure, text, zoom, currentDocument?.id, editing])

  const handleMouseUp = (): void => {
    if (dragging) return
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
    selectionGestureRef.current = true
    setExcerptMenu(null)
    const rect = range.getBoundingClientRect()
    setPending({ start, end, x: rect.left, y: rect.bottom + 6 })
  }

  const activateExcerpt = (codingIds: number[], noteIds: number[], x: number, y: number): void => {
    if (selectionGestureRef.current || dragging) return
    setPending(null)
    setExcerptMenu(null)
    const action = excerptAction(codingIds, noteIds)
    if (action === 'choose') {
      setExcerptMenu({ x, y, codingIds, noteIds })
    } else if (action === 'note') {
      setSelectedCodingId(null)
      openNoteEditor(noteIds[0])
    } else if (action === 'code') {
      setSelectedCodingId(codingIds[0])
    }
  }

  const applyCode = async (codeId: number): Promise<void> => {
    if (!pending) return
    await addCoding(codeId, pending.start, pending.end)
    setPending(null)
    window.getSelection()?.removeAllRanges()
  }

  const startCreateCode = (name: string): void => {
    if (!pending) return
    setNovoCodigo({
      start: pending.start,
      end: pending.end,
      initial: { name, color: randomColor() }
    })
    setPending(null)
  }

  const submitNovoCodigo = async (value: CodeDialogValue): Promise<boolean> => {
    if (!novoCodigo) return false
    try {
      const code = await createCode({
        name: value.name,
        color: value.color,
        description: value.description || null
      })
      await addCoding(code.id, novoCodigo.start, novoCodigo.end)
      window.getSelection()?.removeAllRanges()
      return true
    } catch (err) {
      alert(mensagemDeErro(err, 'Não foi possível criar o código.'))
      return false
    }
  }

  const addNoteForPending = async (): Promise<void> => {
    if (!pending || !currentDocument) return
    const note = await createNote({
      scope: 'excerpt',
      documentId: currentDocument.id,
      startPos: pending.start,
      endPos: pending.end
    })
    setPending(null)
    window.getSelection()?.removeAllRanges()
    openNoteEditor(note.id)
  }

  // Nota de trecho desvinculada so tinha saida por desfazer ou apagar: 'attached'
  // nunca era reescrito depois da criacao. Com o editor aberto numa nota assim,
  // selecionar um trecho deste documento oferece religar.
  const notaParaReligar =
    editorNoteId != null && currentDocument != null
      ? (documentNotes.find((n) => n.id === editorNoteId) ??
          projectNotes.find((n) => n.id === editorNoteId))
      : undefined
  // Vale para qualquer nota que ainda tenha o trecho original guardado, nao so
  // para as marcadas como desvinculadas: a nota que volta de um .qdpx chega como
  // nota de documento e, pelo criterio antigo, nunca receberia a oferta.
  const podeReligar =
    notaParaReligar != null &&
    notaParaReligar.scope !== 'project' &&
    notaParaReligar.anchorText != null &&
    notaParaReligar.documentId === currentDocument?.id

  const reattachPendingNote = async (): Promise<void> => {
    if (!pending || !podeReligar || !notaParaReligar) return
    await updateNote({ id: notaParaReligar.id, startPos: pending.start, endPos: pending.end })
    setPending(null)
    window.getSelection()?.removeAllRanges()
  }

  const startEditing = (): void => {
    if (scrollRef.current && textRef.current) {
      viewportRef.current = captureTranscriptViewport(scrollRef.current, textRef.current)
    }
    setPending(null)
    setDraft(text)
    setSaveError(null)
    setEditing(true)
  }

  const cancelEditing = async (): Promise<void> => {
    if (!(await podeSairDoTexto())) return
    if (backdropRef.current) {
      const viewport = captureTranscriptViewport(backdropRef.current, backdropRef.current)
      viewportRef.current = remapTranscriptViewport(viewport, draft, text)
    }
    setEditing(false)
    setDraft('')
  }

  const saveEditing = async (): Promise<boolean> => {
    if (!currentDocument) return false
    setSaving(true)
    setSaveError(null)
    try {
      await updateDocumentText(currentDocument.id, draft)
      if (backdropRef.current) {
        viewportRef.current = captureTranscriptViewport(backdropRef.current, backdropRef.current)
      }
      setEditing(false)
      setDraft('')
      return true
    } catch (error) {
      setSaveError(mensagemDeErro(error, 'Não foi possível salvar o texto. Seu rascunho foi preservado.'))
      throw error
    } finally {
      setSaving(false)
    }
  }

  // Faixas de códigos múltiplos atrás do texto, na leitura e no preview.
  const bandLayer = (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {multiBands.map((band) => (
        <div
          key={band.key}
          className="absolute"
          style={{
            left: band.left,
            top: band.top,
            width: band.width,
            height: codeBandH,
            borderRadius: 1,
            ...multipleCodeUnderline(band.colors, codeBandW, codeBandH)
          }}
        />
      ))}
    </div>
  )
  // Texto pendente (#31): o store sabe quando há edição não salva e, pelas
  // ações registradas aqui, o diálogo de saída consegue salvar ou descartar.
  const textoSujo = editing && draft !== text
  useEffect(() => {
    setTextoSujo(textoSujo)
  }, [textoSujo, setTextoSujo])
  useEffect(() => () => setTextoSujo(false), [setTextoSujo])

  const saveRef = useRef(saveEditing)
  saveRef.current = saveEditing
  useEffect(() => {
    registerTextoAcoes({
      salvar: () => saveRef.current(),
      descartar: () => {
        setEditing(false)
        setDraft('')
      }
    })
    return () => registerTextoAcoes(null)
  }, [registerTextoAcoes])

  // Trocar de documento encerra a edição: o rascunho é do documento anterior, e
  // o salvar gravaria esse texto no documento novo.
  useEffect(() => {
    setEditing(false)
    setDraft('')
    setSaveError(null)
  }, [currentDocument?.id])

  if (!currentDocument) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center text-muted-foreground">
        <FileText className="mb-3 h-10 w-10" />
        <p className="text-sm">
          Selecione um documento na barra lateral para começar a codificar.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="truncate font-medium" title={currentDocument.name}>{currentDocument.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {formatCount(quoteCount, 'citação', 'citações')} ·{' '}
            {formatCount(codesUsedInDoc, 'código usado', 'códigos usados')}
          </span>
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => void cancelEditing()} disabled={saving}>
                <X className="h-4 w-4" /> Cancelar
              </Button>
              <Button size="sm" onClick={() => void saveEditing().catch(() => undefined)} disabled={saving}>
                <Save className="h-4 w-4" /> Salvar texto
              </Button>
            </>
          ) : (
            <>
              {/* O Ctrl+F sozinho não se mostra: a lupa é como a busca é descoberta. */}
              <Button
                size="sm"
                variant={buscaAberta ? 'secondary' : 'ghost'}
                title="Buscar no documento (Ctrl+F)"
                onClick={() => {
                  if (buscaAberta) {
                    setBuscaAberta(false)
                    setTermo('')
                  } else {
                    setBuscaAberta(true)
                    setTimeout(() => buscaInputRef.current?.select(), 0)
                  }
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={startEditing}>
                <Pencil className="h-4 w-4" /> Editar texto
              </Button>
            </>
          )}
        </div>
      </div>

      {(saveError || actionError) && <p role="alert" className="border-b p-2 text-sm text-destructive">{saveError || actionError}</p>}

      {/* Caixa compacta flutuando no canto, como a busca do Word e do Docs, em
          vez de uma faixa na largura toda empurrando o texto para baixo. A div
          de altura zero ancora a caixa logo abaixo do cabeçalho. */}
      {buscaAberta && !editing && (
        <div className="relative z-20 h-0">
        <div className="absolute right-4 top-2 flex w-96 max-w-[calc(100%-2rem)] items-center gap-1 rounded-md border bg-popover px-2 py-1.5 shadow-md">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={buscaInputRef}
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                irParaHit(e.shiftKey ? -1 : 1)
              }
            }}
            placeholder="Buscar no documento"
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span className="shrink-0 text-xs text-muted-foreground">
            {termo.trim() === ''
              ? ''
              : hits.length === 0
                ? 'nada encontrado'
                : `${Math.min(hitAtual, hits.length - 1) + 1} de ${hits.length}`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            disabled={hits.length === 0}
            onClick={() => irParaHit(-1)}
            title="Anterior (Shift+Enter)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            disabled={hits.length === 0}
            onClick={() => irParaHit(1)}
            title="Próxima (Enter ou F3)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-1.5"
            onClick={() => {
              setBuscaAberta(false)
              setTermo('')
            }}
            title="Fechar (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        </div>
      )}

      {editing ? (
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          {(codings.length > 0 || documentNotes.length > 0) && (
            <p className="mb-2 text-xs text-amber-500">
              Os trechos citados aparecem realçados. Editar o texto reposiciona
              citações e notas automaticamente. Quando a edição desfaz o trecho,
              ele é reencontrado se ainda existir no documento; se não, a citação
              é removida e a nota fica desvinculada, guardando o trecho original.
            </p>
          )}
          <div
            className="relative flex-1 overflow-hidden rounded-md border bg-background"
            onMouseMove={handleEditHover}
            onMouseLeave={() => setEditTip(null)}
          >
            <div
              ref={backdropRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] p-3 font-mono"
              style={{
                fontSize: `calc(0.875rem * ${zoom})`,
                lineHeight: `calc(1.75rem * ${zoom})`,
                fontFamily: 'var(--transcript-font)'
              }}
            >
              <div ref={backdropContentRef} className="relative">
                {bandLayer}
              {draftSegments.map((seg) => {
                const segText = draft.slice(seg.start, seg.end)
                if (seg.codingIds.length === 0) {
                  return <span key={seg.start} data-pos={seg.start}>{segText}</span>
                }
                const topCoding = codings.find(
                  (c) => c.id === seg.codingIds[seg.codingIds.length - 1]
                )
                const topColor = topCoding
                  ? codeMap.get(topCoding.codeId)?.color ?? '#888'
                  : '#888'
                const activeCodes = distinctSegmentCodes(seg.codingIds, codingMap, codeMap)
                const names = `${activeCodes.length} ${activeCodes.length === 1 ? 'código' : 'códigos'}: ${activeCodes.map((code) => code.name).join(', ')}`
                return (
                  <span
                    key={seg.start}
                    data-pos={seg.start}
                    data-names={names}
                    style={{
                      backgroundColor: `${topColor}${alpha.bg}`,
                      boxShadow: activeCodes.length > 1 ? undefined : `inset 0 -2px 0 0 ${topColor}${alpha.bar}`,
                      borderRadius: 2
                    }}
                  >
                    {segText}
                  </span>
                )
              })}
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(applyTextareaChange(draft, e.target.value))}
              aria-label={`Texto de ${currentDocument.name}`}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault()
                  if (!saving) void saveEditing().catch(() => undefined)
                }
              }}
              onScroll={syncScroll}
              spellCheck={false}
              className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] bg-transparent p-3 font-mono text-transparent caret-foreground outline-none"
              style={{
                color: 'transparent',
                fontSize: `calc(0.875rem * ${zoom})`,
                lineHeight: `calc(1.75rem * ${zoom})`,
                fontFamily: 'var(--transcript-font)'
              }}
            />
            {editTip && (
              <div
                className="pointer-events-none absolute z-10 max-w-[240px] -translate-y-full truncate rounded border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
                style={{ left: editTip.x + 8, top: editTip.y - 4 }}
              >
                {editTip.label}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-auto"
          style={dragging ? { cursor: 'col-resize', userSelect: 'none' } : undefined}
          onClick={() => setSelectedCodingId(null)}
        >
          <div className="relative flex">
          {/* Faixas dos trechos com vários códigos: atrás do texto, sem
              interceptar clique, uma por linha visual de cada sequência. */}
          {bandLayer}
          {/* Trilha de comentários: um marcador por linha de citação. O
              pontilhado no texto marca as palavras exatas; o marcador abre a
              nota sem passar pelo menu, ou escolhe entre as da mesma linha. */}
          <div className="relative w-7 shrink-0 self-stretch">
            {noteMarks.map((mark) => {
              const active =
                mark.ids.some((id) => hoverNoteIds.includes(id)) ||
                (flashNoteId != null && mark.ids.includes(flashNoteId))
              const singleId = mark.ids.length === 1 ? mark.ids[0] : null
              const singleNote = singleId != null ? noteById.get(singleId) : undefined
              return (
                <button
                  key={mark.ids.join('-')}
                  type="button"
                  title={
                    singleNote?.title?.trim()
                      ? singleNote.title.trim()
                      : mark.ids.length > 1
                        ? `${mark.ids.length} comentários — clique para escolher`
                        : 'Abrir comentário'
                  }
                  aria-label={
                    mark.ids.length > 1
                      ? `Escolher entre ${mark.ids.length} comentários`
                      : 'Abrir comentário'
                  }
                  className={`absolute rounded p-1 transition-colors ${
                    active
                      ? 'bg-amber-400/40 text-amber-600 dark:text-amber-300'
                      : 'bg-amber-400/15 text-amber-600/80 ring-1 ring-amber-500/40 hover:bg-amber-400/30 hover:text-amber-600 dark:text-amber-400/90 dark:hover:text-amber-300'
                  }`}
                  // Centralização inline de propósito: o ponto medido é o centro
                  // de uma linha visual, então o botão precisa do translate
                  // -50% nos dois eixos para o centro dele coincidir com ela.
                  style={{ top: mark.top, left: '50%', transform: 'translate(-50%, -50%)' }}
                  onMouseEnter={() => setHoverNoteIds(mark.ids)}
                  onMouseLeave={() => setHoverNoteIds([])}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedCodingId(null)
                    setPending(null)
                    if (singleId != null) openNoteEditor(singleId)
                    else setExcerptMenu({ x: e.clientX, y: e.clientY + 8, codingIds: [], noteIds: mark.ids })
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {mark.ids.length > 1 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold leading-none text-white">
                      {mark.ids.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div
            ref={textRef}
            onMouseDown={() => { selectionGestureRef.current = false }}
            onMouseUp={handleMouseUp}
            className="transcript min-w-0 flex-1 py-5"
            style={{
              fontSize: `calc(15px * ${zoom})`,
              lineHeight: `calc(1.75rem * ${zoom})`,
              fontFamily: 'var(--transcript-font)'
            }}
          >
            {segments.length === 0 ? (
              <div className="flex">
                <div className="w-12 shrink-0" />
                <span className="pr-6 text-muted-foreground">(Documento vazio)</span>
              </div>
            ) : (
              lineRows.map((row) => {
                return (
                  <div key={row.index} className="flex">
                    <div
                      className="w-12 shrink-0 select-none pr-3 text-right text-xs text-muted-foreground/40"
                      style={{ lineHeight: `calc(1.75rem * ${zoom})` }}
                    >
                      <span>{row.index + 1}</span>
                    </div>
                    <div className="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] pr-6">
                      {row.spans.length === 0 ? (
                        <span data-pos={row.start}>
                          {text.slice(row.start, row.end) || '\u200b'}
                        </span>
                      ) : (
                        row.spans.map((seg) => {
                          const segStart = seg.start
                          const segEnd = seg.end
                          const segText = seg.text
                          const ehHit = (seg.hitIds?.length ?? 0) > 0
                          const ehHitAtual =
                            ehHit && seg.hitIds!.includes(Math.min(hitAtual, hits.length - 1))
                          // fundo da busca por cima da cor do codigo: box-shadow
                          // interno nao disputa o backgroundColor do trecho
                          const estiloBusca = ehHit
                            ? {
                                boxShadow: ehHitAtual
                                  ? 'inset 0 0 0 999px rgba(250, 204, 21, 0.55)'
                                  : 'inset 0 0 0 999px rgba(250, 204, 21, 0.25)',
                                borderRadius: 2
                              }
                            : undefined
                          if (seg.codingIds.length === 0) {
                            const hasNote = seg.noteIds.length > 0
                            const isFlash =
                              flashNoteId != null && seg.noteIds.includes(flashNoteId)
                            const isNoteHover =
                              seg.noteIds.some((id) => hoverNoteIds.includes(id))
                            return (
                              <span
                                key={`${segStart}-${seg.isPending}`}
                                data-pos={segStart}
                                className={seg.isPending ? 'pending-selection' : undefined}
                                title={hasNote ? (seg.noteIds.length > 1 ? 'Clique para escolher uma nota' : 'Clique para abrir a nota') : undefined}
                                style={{
                                  ...(hasNote
                                    ? {
                                        ...noteUnderlineStyle(true, false, isNoteHover),
                                        cursor: 'pointer',
                                        backgroundColor: isFlash
                                          ? 'rgba(250, 204, 21, 0.35)'
                                          : isNoteHover
                                            ? 'rgba(250, 204, 21, 0.18)'
                                            : undefined
                                      }
                                    : {}),
                                  ...estiloBusca
                                }}
                                onMouseEnter={hasNote ? () => setHoverNoteIds(seg.noteIds) : undefined}
                                onMouseLeave={hasNote ? () => setHoverNoteIds([]) : undefined}
                                onClick={hasNote ? (e) => {
                                  e.stopPropagation()
                                  activateExcerpt(seg.codingIds, seg.noteIds, e.clientX, e.clientY + 8)
                                } : undefined}
                              >
                                {segText}
                              </span>
                            )
                          }
                          const topCodingObj = codings.find(
                            (c) => c.id === seg.codingIds[seg.codingIds.length - 1]
                          )
                          const hoverColor = hoveredSegmentColor(seg.codingIds, hoverCoding)
                          const topColor = hoverColor ?? (topCodingObj
                            ? codeMap.get(topCodingObj.codeId)?.color ?? '#888'
                            : '#888')
                          const activeCodes = distinctSegmentCodes(seg.codingIds, codingMap, codeMap)
                          const isMultiple = activeCodes.length > 1
                          const isHover = hoverColor != null
                          const isSelected = seg.codingIds.includes(selectedCodingId ?? -1)
                          const hasNote = seg.noteIds.length > 0
                          const isNoteHover =
                            seg.noteIds.some((id) => hoverNoteIds.includes(id))
                          const isFlash =
                            (flashNoteId != null && seg.noteIds.includes(flashNoteId)) ||
                            (flashCodingId != null && seg.codingIds.includes(flashCodingId))
                          const selCoding = isSelected
                            ? codings.find((c) => c.id === selectedCodingId)
                            : null
                          const showStartHandle = selCoding != null && segStart === selCoding.startPos
                          const showEndHandle = selCoding != null && segEnd === selCoding.endPos
                          const handleStyle: React.CSSProperties = {
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: topColor,
                            cursor: 'col-resize',
                            verticalAlign: 'middle',
                            flexShrink: 0,
                            position: 'relative',
                            zIndex: 10,
                          }
                          return (
                            <span
                              key={`${segStart}-${seg.isPending}`}
                              data-pos={segStart}
                              className={seg.isPending ? 'pending-selection-coded' : undefined}
                              title={[
                                `${activeCodes.length} ${activeCodes.length === 1 ? 'código' : 'códigos'}: ${activeCodes.map((code) => code.name).join(', ')}`,
                                hasNote || seg.codingIds.length > 1 ? 'Clique para escolher uma ação' : 'Clique para selecionar o código'
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                              style={{
                                // A prioridade entre flash, busca, hover e cor do
                                // código mora no helper, com teste.
                                backgroundColor: codedSegmentBackground({
                                  isFlash,
                                  isMultiple,
                                  ehHit,
                                  ehHitAtual,
                                  isNoteHover,
                                  isCodingHover: isHover,
                                  base: `${topColor}${isHover || isSelected ? alpha.bgHover : alpha.bg}`
                                }),
                                // o flood da busca vai DEPOIS da barra do código
                                // na lista: sombra anterior desenha por cima, e a
                                // barra precisa continuar visível no trecho achado
                                boxShadow: isMultiple && !isHover
                                  ? (isSelected ? `0 0 0 1px ${topColor}66` : undefined)
                                  : `inset 0 -2px 0 0 ${topColor}${alpha.bar}${isSelected ? `, 0 0 0 1px ${topColor}66` : ''}${
                                  ehHit && !isMultiple
                                    ? `, inset 0 0 0 999px rgba(250, 204, 21, ${ehHitAtual ? '0.45' : '0.2'})`
                                    : ''
                                }`,
                                ...noteUnderlineStyle(hasNote, true, isNoteHover),
                                borderRadius: 2,
                                cursor: 'pointer',
                              }}
                              onMouseEnter={() => {
                                if (hasNote) setHoverNoteIds(seg.noteIds)
                              }}
                              onMouseLeave={() => {
                                if (hasNote) setHoverNoteIds([])
                              }}
                              onClick={(e) => {
                                e.stopPropagation()
                                activateExcerpt(seg.codingIds, seg.noteIds, e.clientX, e.clientY + 8)
                              }}
                            >
                              {showStartHandle && (
                                <span
                                  role="slider"
                                  tabIndex={0}
                                  aria-label="Início da citação"
                                  aria-valuemin={0}
                                  aria-valuemax={selCoding!.endPos - 1}
                                  aria-valuenow={selCoding!.startPos}
                                  onKeyDown={(e) => {
                                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                                    e.preventDefault()
                                    const pos = Math.max(0, Math.min(selCoding!.endPos - 1, selCoding!.startPos + (e.key === 'ArrowRight' ? 1 : -1)))
                                    void run(() => updateCoding(selCoding!.id, pos, selCoding!.endPos))
                                  }}
                                  style={{ ...handleStyle, marginRight: 2 }}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setDragging({ codingId: selCoding!.id, end: 'start' })
                                  }}
                                />
                              )}
                              {segText}
                              {showEndHandle && (
                                <span
                                  role="slider"
                                  tabIndex={0}
                                  aria-label="Fim da citação"
                                  aria-valuemin={selCoding!.startPos + 1}
                                  aria-valuemax={text.length}
                                  aria-valuenow={selCoding!.endPos}
                                  onKeyDown={(e) => {
                                    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                                    e.preventDefault()
                                    const pos = Math.max(selCoding!.startPos + 1, Math.min(text.length, selCoding!.endPos + (e.key === 'ArrowRight' ? 1 : -1)))
                                    void run(() => updateCoding(selCoding!.id, selCoding!.startPos, pos))
                                  }}
                                  style={{ ...handleStyle, marginLeft: 2 }}
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setDragging({ codingId: selCoding!.id, end: 'end' })
                                  }}
                                />
                              )}
                            </span>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div
            role="separator"
            tabIndex={0}
            aria-label="Largura da faixa de códigos"
            aria-orientation="vertical"
            aria-valuemin={minNeededLaneWidth}
            aria-valuenow={effectiveLaneWidth}
            onKeyDown={(e) => {
              if (e.key === 'Home') {
                e.preventDefault()
                setLaneWidth(null)
                localStorage.removeItem(BAR_LANE_KEY)
                return
              }
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
              e.preventDefault()
              const next = clampLaneWidth(effectiveLaneWidth + (e.key === 'ArrowLeft' ? 16 : -16), columnCount, LANE, effectiveLaneWidth)
              setLaneWidth(next)
              localStorage.setItem(BAR_LANE_KEY, String(next))
            }}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              laneResizeRef.current = {
                startX: e.clientX,
                startWidth: effectiveLaneWidth
              }
              setLaneResizing(true)
            }}
            onDoubleClick={() => {
              setLaneWidth(null)
              try {
                localStorage.removeItem(BAR_LANE_KEY)
              } catch {
                // armazenamento indisponível: só não persiste
              }
            }}
            title="Arraste para redimensionar"
            className={`w-1.5 shrink-0 cursor-col-resize self-stretch hover:bg-primary/20 focus-visible:bg-primary/30 focus-visible:outline-none ${
              laneResizing ? 'bg-primary/30' : ''
            }`}
          />
          <div
            className="relative shrink-0 border-l bg-muted/30"
             style={{ width: effectiveLaneWidth }}
           >
            {bars.map((bar) => (
              <div
                key={bar.codingId}
                 onMouseEnter={() => setHoverCoding({ codingIds: bar.codingIds, color: bar.color })}
                 onMouseLeave={() => setHoverCoding(null)}
                 title={bar.codingIds.length > 1 ? 'Clique para escolher um código' : undefined}
                 className="group absolute flex cursor-pointer items-center gap-1 rounded px-1.5 text-xs"
                 style={{
                   height: barHeight,
                  top: bar.top,
                   left: BAR_LANE_PAD / 2 + bar.column * barSlot,
                  width: Math.max(BAR_MIN_WIDTH, barSlot * bar.columnSpan - BAR_GAP),
                  backgroundColor: bar.color,
                  color: contrastText(bar.color),
                   outline: bar.codingIds.includes(selectedCodingId ?? -1) ? `2px solid ${bar.color}` : undefined,
                  outlineOffset: 2,
                }}
               >
                 <button
                   type="button"
                   className="flex h-full min-w-0 flex-1 items-center gap-1 text-left focus-visible:outline focus-visible:outline-2"
                   aria-label={`Selecionar citação: ${bar.name}`}
                   onClick={(e) => {
                     e.stopPropagation()
                     selectionGestureRef.current = false
                     const box = e.currentTarget.getBoundingClientRect()
                     activateExcerpt(bar.codingIds, [], e.detail === 0 ? box.left : e.clientX, e.detail === 0 ? box.bottom : e.clientY + 8)
                   }}
                 >
                  <BarName name={bar.name} />
                  {bar.codingIds.length > 1 && <span className="shrink-0">+{bar.codingIds.length - 1}</span>}
                 </button>
                  {(bar.codingIds.length === 1 || bar.codingIds.includes(selectedCodingId ?? -1)) && <button
                   className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                   aria-label={`Remover citação: ${bar.name}`}
                   title={bar.codingIds.length === 1 ? 'Remover citação' : 'Remover citação selecionada'}
                  onClick={(e) => {
                    // sem isto o clique sobe para a etiqueta e marca como
                    // selecionada a citação que acabou de ser removida
                    e.stopPropagation()
                      void run(() => removeCoding(bar.codingIds.includes(selectedCodingId ?? -1) ? selectedCodingId! : bar.codingId))
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                 </button>}
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
          onCreate={startCreateCode}
          selectedText={text.slice(pending.start, pending.end)}
          onAddNote={() => void addNoteForPending()}
          onReattachNote={podeReligar ? () => void reattachPendingNote() : undefined}
        />
      )}
      {excerptMenu && (
        <ExcerptPopover
          x={excerptMenu.x}
          y={excerptMenu.y}
          notes={documentNotes.filter((n) => excerptMenu.noteIds.includes(n.id)).map((n) => ({ id: n.id, title: n.title?.trim() || 'Sem título' }))}
          codes={excerptMenu.codingIds.flatMap((id) => {
            const coding = codingMap.get(id)
            const code = coding ? codeMap.get(coding.codeId) : undefined
            return code ? [{ id, name: code.name, color: code.color }] : []
          })}
          onClose={closeExcerptMenu}
          onOpenNote={(id) => { setSelectedCodingId(null); openNoteEditor(id); closeExcerptMenu() }}
          onSelectCode={(id) => { setSelectedCodingId(id); closeExcerptMenu() }}
        />
      )}

      <CodeDialog
        open={novoCodigo !== null}
        onOpenChange={(o) => !o && setNovoCodigo(null)}
        title="Novo código"
        initial={novoCodigo?.initial}
        onSubmit={submitNovoCodigo}
      />
    </div>
  )
}
