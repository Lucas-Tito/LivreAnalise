import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Layers,
  MoreVertical,
  Pencil,
  Trash2,
  CornerDownRight,
  CornerUpLeft,
  FolderMinus,
  List,
  Tags,
  Users,
  GripVertical,
  FolderInput,
  X,
  UnfoldVertical,
  FoldVertical
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import {
  buildLibraryTree,
  canReceiveChild,
  collectCollapsibleKeys,
  groupDestinations,
  isNoopMove,
  validateParentChange,
  type CodeNode
} from '@shared/codeTree'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CodeDialog, type CodeDialogValue } from './CodeDialog'
import { SimplePromptDialog } from './SimplePromptDialog'
import { CollectionMembersDialog } from './CollectionMembersDialog'
import { randomColor } from '@/lib/utils'
import { mensagemDeErro } from '@/lib/erros'
import type { CodeWithCount, Collection } from '@shared/types'

interface Props {
  onViewCode: (code: CodeWithCount | null) => void
}

interface SelectModifiers {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

type DropZone = 'before' | 'inside' | 'after'

interface RowHit {
  id: number
  zone: DropZone
  key: string
  hasChildren: boolean
  parentId: number | null
}

// O que o arrasto vai fazer, já validado. As três intenções são distintas de
// propósito: subir/descer de nível move o código; o centro agrupa. `noop` é
// o soltar que não muda nada (devolver ao mesmo lugar): não é erro, só não
// faz nada.
type DropIntent =
  | { kind: 'invalid' }
  | { kind: 'noop' }
  | { kind: 'root' }
  | {
      kind: 'move'
      parentId: number | null
      anchorId: number | null
      position: 'before' | 'after' | 'end'
    }
  | { kind: 'group'; codeIds: number[] }

// Como o destino se apresenta na lista: cada um com seu próprio visual.
// `same` é o noop: mesma posição de inserção, mas em tom neutro.
type DropKind = 'up' | 'down' | 'group' | 'inside' | 'root' | 'same'

export function CodesPanel({ onViewCode }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const collections = useAppStore((s) => s.collections)
  const collectionMembers = useAppStore((s) => s.collectionMembers)
  const createCode = useAppStore((s) => s.createCode)
  const createGroup = useAppStore((s) => s.createGroup)
  const createGroupFrom = useAppStore((s) => s.createGroupFrom)
  const updateCode = useAppStore((s) => s.updateCode)
  const deleteCode = useAppStore((s) => s.deleteCode)
  const moveCodes = useAppStore((s) => s.moveCodes)
  const createCollection = useAppStore((s) => s.createCollection)
  const updateCollection = useAppStore((s) => s.updateCollection)
  const deleteCollection = useAppStore((s) => s.deleteCollection)
  const addCollectionMember = useAppStore((s) => s.addCollectionMember)
  const removeCollectionMember = useAppStore((s) => s.removeCollectionMember)

  const tree = useMemo(
    () => buildLibraryTree(codes, collections, collectionMembers),
    [codes, collections, collectionMembers]
  )
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dialogState, setDialogState] = useState<{
    mode: 'create' | 'edit' | 'child'
    code?: CodeWithCount
  } | null>(null)
  const [prompt, setPrompt] = useState<
    | { kind: 'renameCollection'; collection: Collection }
    | { kind: 'groupFromCode'; code: CodeWithCount }
    | { kind: 'collectionFromGroup'; code: CodeWithCount }
    | null
  >(null)
  const [membersCollection, setMembersCollection] = useState<Collection | null>(
    null
  )
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [moveOpen, setMoveOpen] = useState(false)
  const [moveFilter, setMoveFilter] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const [dragIds, setDragIds] = useState<number[] | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const [dropPos, setDropPos] = useState<DropZone | null>(null)
  const [dropKind, setDropKind] = useState<DropKind | null>(null)
  const DEFAULT_HINT =
    'Bordas: reordenar • centro: agrupar • fundo: 1º nível'
  const [dropHint, setDropHint] = useState(DEFAULT_HINT)
  const [rootHover, setRootHover] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Códigos que o arrasto juntou; o nome do grupo só é decidido no diálogo, para
  // que cancelar não deixe nada pela metade.
  const [groupPrompt, setGroupPrompt] = useState<number[] | null>(null)
  const anchorRef = useRef<number | null>(null)
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expandKeyRef = useRef<string | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  // O arrasto é feito com pointer events, não com o drag nativo do Chromium:
  // sobre os controles da linha o drag nativo morria virando clique (e o clique
  // abria os trechos). Aqui o limiar de movimento é nosso, o que também permite
  // animar a etiqueta que segue o cursor.
  const pendingRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    code: CodeWithCount
    mods: SelectModifiers
  } | null>(null)
  const dragIdsRef = useRef<number[] | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Espelhos para os handlers globais de pointer (instalados uma vez) lerem o
  // estado atual sem recriá-los a cada render.
  const codesRef = useRef(codes)
  codesRef.current = codes
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const collapsedRef = useRef(collapsed)
  collapsedRef.current = collapsed

  const toggle = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAll = (): void => setCollapsed(new Set())
  const collapseAll = (): void => setCollapsed(collectCollapsibleKeys(tree))

  const toggleSelect = (id: number): void => {
    anchorRef.current = id
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Ordem visível dos códigos (respeita coleções e grupos recolhidos), usada
  // pelo Shift+clique para selecionar intervalos como no explorador de arquivos.
  const visibleIds = useMemo(() => {
    const ids: number[] = []
    const walk = (node: CodeNode<CodeWithCount>, path: string): void => {
      ids.push(node.code.id)
      const key = `${path}/${node.code.id}`
      if (node.children.length > 0 && !collapsed.has(key)) {
        for (const child of node.children) walk(child, key)
      }
    }
    for (const col of tree.collections) {
      const key = `col-${col.collection.id}`
      if (collapsed.has(key)) continue
      for (const child of col.children) walk(child, key)
    }
    for (const node of tree.loose) walk(node, 'loose')
    return ids
  }, [tree, collapsed])

  const selectRange = (id: number): void => {
    const anchor = anchorRef.current
    if (anchor == null || !visibleIds.includes(anchor)) {
      anchorRef.current = id
      setSelected(new Set([id]))
      return
    }
    const from = visibleIds.indexOf(anchor)
    const to = visibleIds.indexOf(id)
    if (to === -1) {
      anchorRef.current = id
      setSelected(new Set([id]))
      return
    }
    const [start, end] =
      from <= to ? [from, to] : ([to, from] as const)
    setSelected(new Set(visibleIds.slice(start, end + 1)))
  }

  // Clique simples seleciona e abre; Ctrl/Cmd alterna e Shift faz intervalo,
  // ambos sem abrir os trechos.
  const applySelect = (mods: SelectModifiers, code: CodeWithCount): void => {
    if (mods.ctrlKey || mods.metaKey) {
      toggleSelect(code.id)
      return
    }
    if (mods.shiftKey) {
      selectRange(code.id)
      return
    }
    anchorRef.current = code.id
    setSelected(new Set([code.id]))
    onViewCode(code)
  }

  // Aviso curto (destino inválido, por exemplo) some sozinho.
  const flashNotice = (message: string): void => {
    setNotice(message)
    setTimeout(() => setNotice(null), 2600)
  }

  // Esc limpa a seleção sem mexer no resto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setSelected(new Set())
        anchorRef.current = null
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const cancelExpandTimer = (): void => {
    if (expandTimer.current) {
      clearTimeout(expandTimer.current)
      expandTimer.current = null
    }
    expandKeyRef.current = null
  }

  const scheduleAutoExpand = (key: string): void => {
    if (expandKeyRef.current === key) return
    cancelExpandTimer()
    expandKeyRef.current = key
    expandTimer.current = setTimeout(() => {
      setCollapsed((prev) => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      expandTimer.current = null
      expandKeyRef.current = null
    }, 600)
  }

  const cleanupDrag = (): void => {
    dragIdsRef.current = null
    setDragIds(null)
    setDropTarget(null)
    setDropPos(null)
    setDropKind(null)
    setDropHint(DEFAULT_HINT)
    setRootHover(false)
    cancelExpandTimer()
    document.body.classList.remove('code-dragging')
    if (ghostRef.current) {
      ghostRef.current.remove()
      ghostRef.current = null
    }
  }

  // A etiqueta que segue o cursor muda de texto (e de cor) conforme a intenção:
  // é a diferenciação mais direta entre subir, descer e criar grupo.
  const setGhostLabel = (
    label: string | null,
    kind: 'none' | 'up' | 'down' | 'group' | 'inside' | 'root' | 'same' = 'none'
  ): void => {
    const ghost = ghostRef.current
    if (!ghost) return
    const ids = dragIdsRef.current ?? []
    ghost.textContent =
      label ?? (ids.length > 1 ? `${ids.length} códigos` : '')
    ghost.dataset.intent = kind
  }

  const dropKindOf = (
    intent: DropIntent,
    hit: RowHit | 'root' | null
  ): DropKind => {
    if (intent.kind === 'noop') return 'same'
    if (intent.kind === 'root') return 'root'
    if (intent.kind === 'group') return 'group'
    if (hit !== null && hit !== 'root') {
      if (hit.zone === 'before') return 'up'
      if (hit.zone === 'after') return 'down'
    }
    return 'inside'
  }

  const codeName = (id: number): string =>
    codesRef.current.find((c) => c.id === id)?.name ?? ''

  // "A", "A e B", "A, B e C" para o diálogo do novo grupo.
  const groupNames = (ids: number[] | null): string => {
    if (!ids) return ''
    const names = ids.map((id) => codeName(id)).filter(Boolean)
    if (names.length <= 1) return names[0] ?? ''
    return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
  }

  const isGroup = (id: number): boolean =>
    codesRef.current.some((c) => c.parentId === id)

  const canDropIds = (ids: number[], parentId: number | null): boolean =>
    ids.every((id) => {
      try {
        validateParentChange(codesRef.current, id, parentId)
        return true
      } catch {
        return false
      }
    })

  // Quem está sob o cursor: a linha (e sua zona) ou o fundo da lista (raiz).
  // Usa elementsFromPoint (a pilha inteira) em vez de elementFromPoint: um
  // overlay por cima — o painel de trechos, a etiqueta do arrasto, a dica —
  // não pode esconder o destino que está embaixo dele.
  const hitZone = (x: number, y: number): RowHit | 'root' | null => {
    const stack = document.elementsFromPoint(x, y)
    for (const node of stack) {
      const el = node as HTMLElement
      if (typeof el.closest !== 'function') continue
      const rowEl = el.closest<HTMLElement>('[data-code-row]')
      if (rowEl) {
        const rect = rowEl.getBoundingClientRect()
        const rel = rect.height > 0 ? (y - rect.top) / rect.height : 0.5
        const zone: DropZone =
          rel < 0.25 ? 'before' : rel > 0.75 ? 'after' : 'inside'
        const id = Number(rowEl.dataset.codeRow)
        return {
          id,
          zone,
          key: rowEl.dataset.codeKey ?? '',
          hasChildren: rowEl.dataset.codeChildren === '1',
          parentId: codesRef.current.find((c) => c.id === id)?.parentId ?? null
        }
      }
      if (el.closest('[data-code-root]')) return 'root'
    }
    return null
  }

  // Traduz a zona sob o cursor na intenção do arrasto. Centro em folha = unir os
  // dois em um grupo novo; centro em grupo = entrar no grupo existente.
  // Devolver ao mesmo lugar (em cima de si, ou numa posição que não muda a
  // ordem) é `noop`: não é erro, só não faz nada.
  const resolveDrop = (
    ids: number[],
    hit: RowHit | 'root' | null
  ): DropIntent => {
    if (hit === null) return { kind: 'invalid' }
    if (hit === 'root') {
      return isNoopMove(codesRef.current, ids, { parentId: null })
        ? { kind: 'noop' }
        : { kind: 'root' }
    }
    if (hit.zone !== 'inside') {
      // Nas bordas, soltar sobre si mesmo é devolver ao mesmo lugar.
      if (ids.length === 1 && ids[0] === hit.id) return { kind: 'noop' }
      const parent = hit.parentId
      if (!canDropIds(ids, parent)) return { kind: 'invalid' }
      const placement = {
        parentId: parent,
        anchorId: hit.id,
        position: (hit.zone === 'before' ? 'before' : 'after') as
          | 'before'
          | 'after'
      }
      return isNoopMove(codesRef.current, ids, placement)
        ? { kind: 'noop' }
        : { kind: 'move', ...placement }
    }
    // No centro, soltar sobre si mesmo também é devolver ao mesmo lugar
    // (vale para grupo, que não pode entrar nele mesmo de jeito nenhum).
    if (ids.length === 1 && ids[0] === hit.id) return { kind: 'noop' }
    if (hit.hasChildren) {
      if (!canDropIds(ids, hit.id)) return { kind: 'invalid' }
      const placement = {
        parentId: hit.id,
        anchorId: null,
        position: 'end' as const
      }
      return isNoopMove(codesRef.current, ids, placement)
        ? { kind: 'noop' }
        : { kind: 'move', ...placement }
    }
    // Folha no centro: grupo novo com o arrastado + a folha. Nenhum dos dois
    // pode ser grupo, senão nasceria um 3º nível.
    const members = [...ids, hit.id]
    // Só a linha arrastada, solta no centro dela mesma, é "já está aqui".
    // Com seleção múltipla, o alvo já está no arrasto: isso é um destino
    // impossível de agrupar, e dizer "destino inválido" é honesto.
    if (ids.length > 1 && ids.includes(hit.id)) return { kind: 'invalid' }
    if (members.some((id) => isGroup(id))) return { kind: 'invalid' }
    return { kind: 'group', codeIds: members }
  }

  const intentLabel = (intent: DropIntent, hit: RowHit | 'root' | null): string => {
    if (intent.kind === 'noop') return 'Já está aqui'
    if (intent.kind === 'root') return 'Mover para o 1º nível'
    if (intent.kind === 'invalid') return 'Destino inválido'
    if (intent.kind === 'move') {
      if (hit !== null && hit !== 'root' && hit.zone === 'before')
        return 'Mover para cima'
      if (hit !== null && hit !== 'root' && hit.zone === 'after')
        return 'Mover para baixo'
      if (hit !== null && hit !== 'root')
        return `Mover para dentro de “${codeName(hit.id)}”`
      return 'Mover de nível'
    }
    return `Criar grupo com “${hit !== null && hit !== 'root' ? codeName(hit.id) : ''}”`
  }

  const updateDropTarget = (x: number, y: number): void => {
    const ids = dragIdsRef.current
    if (!ids) return
    const hit = hitZone(x, y)
    const intent = resolveDrop(ids, hit)
    const clear = (): void => {
      setDropTarget(null)
      setDropPos(null)
      setDropKind(null)
      setRootHover(false)
      setDropHint(DEFAULT_HINT)
      setGhostLabel(null)
      cancelExpandTimer()
    }
    if (intent.kind === 'invalid' || hit === null) {
      clear()
      return
    }
    // Um noop sobre o fundo não recebe o azul de "mover para o 1º nível":
    // o fundo em tom normal é o que combina com a dica "Já está aqui".
    setRootHover(hit === 'root' && intent.kind !== 'noop')
    if (hit === 'root') {
      setDropTarget(null)
      setDropPos(null)
      cancelExpandTimer()
    } else {
      setDropTarget(hit.id)
      setDropPos(hit.zone)
      if (
        hit.zone === 'inside' &&
        hit.hasChildren &&
        collapsedRef.current.has(hit.key)
      ) {
        scheduleAutoExpand(hit.key)
      } else {
        cancelExpandTimer()
      }
    }
    setDropKind(dropKindOf(intent, hit))
    const label = intentLabel(intent, hit)
    setDropHint(
      ids.length > 1 && intent.kind === 'group'
        ? `${label} (${ids.length + 1} códigos)`
        : label
    )
    setGhostLabel(label, dropKindOf(intent, hit))
  }

  const startPointerDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    code: CodeWithCount
  ): void => {
    if (e.button !== 0) return
    // Só mouse: no toque a lista precisa continuar rolando normalmente.
    if (e.pointerType !== 'mouse') return
    // Controles com clique próprio (seta, menu) não initiates arrasto.
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    pendingRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      code,
      mods: { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }
    }
  }

  // Um único arrasto por vez: o pressionar inicia a intenção, o primeiro
  // movimento acima do limiar cria o fantasma, e o soltar decide entre mover,
  // não mover (destino inválido) ou tratar como clique comum.
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const pending = pendingRef.current
      if (!pending || e.pointerId !== pending.pointerId) return
      if (dragIdsRef.current === null) {
        const dist = Math.hypot(
          e.clientX - pending.startX,
          e.clientY - pending.startY
        )
        if (dist < 4) return
        const ids = selectedRef.current.has(pending.code.id)
          ? [...selectedRef.current]
          : [pending.code.id]
        dragIdsRef.current = ids
        setDragIds(ids)
        // Nenhum painel pode ficar em cima da lista durante o arrasto.
        onViewCode(null)
        // De propósito, `selected` não é tocado aqui: a barra "N selecionados"
        // do cabeçalho empurraria a lista para baixo no primeiro movimento, e o
        // destino sob o cursor mudaria junto. O destaque do que está sendo
        // arrastado vem de `isDragging`.
        document.body.classList.add('code-dragging')
        const ghost = document.createElement('div')
        ghost.className = 'code-drag-ghost'
        ghost.textContent =
          ids.length > 1 ? `${ids.length} códigos` : pending.code.name
        document.body.appendChild(ghost)
        ghostRef.current = ghost
      }
      e.preventDefault()
      ghostRef.current?.style.setProperty(
        'transform',
        `translate3d(${e.clientX + 14}px, ${e.clientY + 12}px, 0)`
      )
      // Rola a lista quando o cursor encosta nas bordas: sem isso não dá para
      // arrastar até um código que está fora da área visível.
      const scroller = scrollRef.current
      if (scroller) {
        const rect = scroller.getBoundingClientRect()
        const edge = 40
        if (e.clientY < rect.top + edge) scroller.scrollTop -= 12
        else if (e.clientY > rect.bottom - edge) scroller.scrollTop += 12
      }
      updateDropTarget(e.clientX, e.clientY)
    }

    const finish = (e: PointerEvent): void => {
      const pending = pendingRef.current
      if (!pending || e.pointerId !== pending.pointerId) return
      pendingRef.current = null
      const ids = dragIdsRef.current
      if (ids === null) {
        // Não passou do limiar: só selecionar/abrir, e só se o soltar foi na
        // mesma linha do pressionar.
        const upRow = (e.target as HTMLElement | null)?.closest<HTMLElement>(
          '[data-code-row]'
        )
        const upId = upRow ? Number(upRow.dataset.codeRow) : null
        if (upId === pending.code.id)
          liveRef.current.applySelect(pending.mods, pending.code)
        return
      }
      const hit = hitZone(e.clientX, e.clientY)
      // Soltar fora da lista é cancelar, não erro; dentro de uma linha inválida
      // é erro de destino (e o usuário precisa saber por que nada moveu).
      if (hit === null) {
        cleanupDrag()
        return
      }
      const intent = resolveDrop(ids, hit)
      // Devolver ao mesmo lugar não é erro: some sem aviso e sem mexer na
      // seleção.
      if (intent.kind === 'noop') {
        cleanupDrag()
        return
      }
      if (intent.kind === 'invalid') {
        cleanupDrag()
        flashNotice('Destino inválido — nada foi movido.')
        return
      }
      if (intent.kind === 'group') {
        cleanupDrag()
        setGroupPrompt(intent.codeIds)
        return
      }
      cleanupDrag()
      void liveRef.current.doMove(
        ids,
        intent.kind === 'move' ? intent.parentId : null,
        intent.kind === 'move'
          ? { anchorId: intent.anchorId, position: intent.position }
          : undefined
      )
    }

    const cancel = (): void => {
      pendingRef.current = null
      if (dragIdsRef.current !== null) cleanupDrag()
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      if (dragIdsRef.current !== null) cleanupDrag()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Era a unica mutacao do painel sem await e sem catch: o destino podia ter
  // deixado de ser valido, o createCode lancava, a rejeicao morria sem dono e o
  // dialogo fechava como se tivesse dado certo -- sem codigo nenhum criado.
  const handleSubmit = async (value: CodeDialogValue): Promise<boolean> => {
    if (!dialogState) return false
    try {
      if (dialogState.mode === 'edit' && dialogState.code) {
        await updateCode({
          id: dialogState.code.id,
          name: value.name,
          color: value.color,
          description: value.description || null
        })
      } else {
        await createCode({
          name: value.name,
          color: value.color,
          description: value.description || null,
          parentId:
            dialogState.mode === 'child' ? dialogState.code?.id ?? null : null
        })
      }
      return true
    } catch (err) {
      flashNotice(mensagemDeErro(err, 'Não foi possível salvar o código.'))
      return false
    }
  }

  // Grupo e colecao nascem a partir de quem eles agrupam: assim um grupo nunca
  // existe vazio, e "codigo que tem filhos" continua sendo a unica definicao.
  const handlePrompt = async (name: string): Promise<void> => {
    if (!prompt) return
    if (prompt.kind === 'renameCollection') {
      await updateCollection({ id: prompt.collection.id, name })
    } else if (prompt.kind === 'groupFromCode') {
      await createGroup({
        name,
        color: prompt.code.color,
        codeId: prompt.code.id
      })
    } else {
      const collection = await createCollection({ name })
      await addCollectionMember(collection.id, prompt.code.id)
    }
  }

  const removeFromCollection = async (
    collectionId: number,
    codeId: number
  ): Promise<void> => {
    await removeCollectionMember(collectionId, codeId)
  }

  // Grupo vindo do arrasto: junta os códigos arrastados com a folha sobre a
  // qual foram soltos, com o nome que o usuário escolher.
  const submitGroupPrompt = async (name: string): Promise<void> => {
    if (!groupPrompt) return
    const members = [...groupPrompt]
    setGroupPrompt(null)
    try {
      await createGroupFrom({
        name,
        color: codes.find((c) => c.id === members[0])?.color ?? randomColor(),
        codeIds: members
      })
      setSelected(new Set())
      anchorRef.current = null
    } catch (err) {
      flashNotice(
        mensagemDeErro(err, 'Não foi possível criar o grupo.')
      )
    }
  }

  const doMove = async (
    ids: number[],
    parentId: number | null,
    placement?: { anchorId?: number | null; position?: 'before' | 'after' | 'end' }
  ): Promise<boolean> => {
    try {
      for (const id of ids) validateParentChange(codes, id, parentId)
    } catch (err) {
      const message = mensagemDeErro(err, 'Movimento inválido.')
      setMoveError(message)
      // O dialog de mover nem sempre está aberto: sem isto a falha era muda.
      flashNotice(message)
      return false
    }
    setMoveError(null)
    try {
      await moveCodes(ids, parentId, placement)
    } catch (err) {
      const message = mensagemDeErro(err, 'Não foi possível mover.')
      setMoveError(message)
      flashNotice(message)
      return false
    }
    setSelected(new Set())
    anchorRef.current = null
    setMoveOpen(false)
    setMoveFilter('')
    return true
  }

  // Os handlers de pointer são instalados uma única vez, então precisam enxergar
  // as versões mais recentes de `doMove` e `applySelect` (que capturam `codes`).
  const liveRef = useRef({ applySelect, doMove })
  liveRef.current = { applySelect, doMove }

  const destinations = useMemo(() => groupDestinations(codes), [codes])
  const filteredDestinations = destinations.filter((c) =>
    c.name.toLowerCase().includes(moveFilter.toLowerCase())
  )

  const renderCode = (
    node: CodeNode<CodeWithCount>,
    depth: number,
    path: string,
    // preenchido so para os filhos diretos de uma colecao: e onde "remover da
    // colecao" tem sentido, porque niveis mais fundos herdam o pertencimento
    collectionId: number | null
  ): JSX.Element => {
    const key = `${path}/${node.code.id}`
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(key)
    const isSelected = selected.has(node.code.id)
    const isDropTarget = dropTarget === node.code.id
    const isDragging = dragIds?.includes(node.code.id) ?? false
    const isInsertBefore = isDropTarget && dropPos === 'before'
    const isInsertAfter = isDropTarget && dropPos === 'after'
    const isNestTarget = isDropTarget && dropPos === 'inside'
    const isGroupTarget = isDropTarget && dropKind === 'group'
    const isSameSpot = isDropTarget && dropKind === 'same'
    return (
      <li key={key}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              data-code-row={node.code.id}
              data-code-key={key}
              data-code-children={hasChildren ? '1' : '0'}
              className={`group relative flex cursor-grab select-none items-center gap-1 rounded-md py-1 pr-1 text-sm transition-all duration-150 ease-out hover:bg-accent/50 ${isSelected ? 'bg-accent ring-1 ring-inset ring-primary/40' : ''} ${isDragging ? 'scale-[0.98] opacity-50' : ''} ${isGroupTarget ? 'code-drop-group' : ''} ${isNestTarget && !isGroupTarget ? 'code-drop-inside' : ''} ${isInsertBefore ? 'code-insert-before' : ''} ${isInsertAfter ? 'code-insert-after' : ''} ${isSameSpot ? 'code-drop-same' : ''}`}
              style={{ paddingLeft: depth * 14 + 4 }}
              title="Arrastar: bordas reordenam • centro agrupa • fundo tira do grupo"
              onPointerDown={(e) => startPointerDrag(e, node.code)}
              onContextMenu={(e) => {
                // O container da lista tambem tem menu de contexto (fundo
                // vazio): sem o stop, o clique na linha abriria os dois menus
                // empilhados.
                e.stopPropagation()
              }}
            >
              <span
                title="Arrastar para mover"
                className="flex h-4 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
              >
                <GripVertical className="h-3.5 w-3.5" />
              </span>
              <div
                data-no-drag
                role="button"
                tabIndex={hasChildren ? 0 : -1}
                aria-label={hasChildren ? 'Expandir ou recolher' : undefined}
                className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
                onClick={() => {
                  if (hasChildren) toggle(key)
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && hasChildren) {
                    e.preventDefault()
                    toggle(key)
                  }
                }}
              >
                {hasChildren ? (
                  isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )
                ) : null}
              </div>
              {/* O nome usa div com role (e não button) porque o <button> do
                  Chromium não propaga o pressionar para o arrasto da linha. O
                  clique aqui é resolvido no pointerup global, junto com o
                  arrasto, para o gesto nunca virar duas coisas. */}
              <div
                role="button"
                tabIndex={0}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    applySelect(
                      { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey },
                      node.code
                    )
                  }
                }}
                title={node.code.description ?? undefined}
              >
                {hasChildren ? (
                  <Tags
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: node.code.color }}
                  />
                ) : (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: node.code.color }}
                  />
                )}
                <span className="truncate">{node.code.name}</span>
                {node.code.usageCount > 0 && (
                  <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                    {node.code.usageCount}
                  </span>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    data-no-drag
                    className="opacity-0 group-hover:opacity-100"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onViewCode(node.code)}>
                    <List className="h-4 w-4" /> Ver trechos
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      if (!selected.has(node.code.id)) toggleSelect(node.code.id)
                      setMoveFilter('')
                      setMoveError(null)
                      setMoveOpen(true)
                    }}
                  >
                    <FolderInput className="h-4 w-4" /> Mover para grupo…
                  </DropdownMenuItem>
                  {canReceiveChild(node.code) && (
                    <DropdownMenuItem
                      onClick={() =>
                        setDialogState({ mode: 'child', code: node.code })
                      }
                    >
                      <CornerDownRight className="h-4 w-4" /> Adicionar código
                      dentro
                    </DropdownMenuItem>
                  )}
                  {hasChildren && (
                    <DropdownMenuItem
                      onClick={() =>
                        setPrompt({
                          kind: 'collectionFromGroup',
                          code: node.code
                        })
                      }
                    >
                      <Layers className="h-4 w-4" /> Criar coleção com este grupo
                    </DropdownMenuItem>
                  )}
                  {!hasChildren && node.code.parentId == null && (
                    <DropdownMenuItem
                      onClick={() =>
                        setPrompt({ kind: 'groupFromCode', code: node.code })
                      }
                    >
                      <Tags className="h-4 w-4" /> Criar grupo com este código
                    </DropdownMenuItem>
                  )}
                  {node.code.parentId != null && (
                    <DropdownMenuItem
                      onClick={() => void doMove([node.code.id], null)}
                    >
                      <CornerUpLeft className="h-4 w-4" /> Remover do grupo
                    </DropdownMenuItem>
                  )}
                  {collectionId != null && (
                    <DropdownMenuItem
                      onClick={() =>
                        removeFromCollection(collectionId, node.code.id)
                      }
                    >
                      <FolderMinus className="h-4 w-4" /> Remover da coleção
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() =>
                      setDialogState({ mode: 'edit', code: node.code })
                    }
                  >
                    <Pencil className="h-4 w-4" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => {
                      if (
                        confirm(
                          `Excluir o código "${node.code.name}"? Os códigos dentro dele e as citações serão removidos.`
                        )
                      ) {
                        deleteCode(node.code.id)
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              onClick={() => setDialogState({ mode: 'create' })}
            >
              <Plus className="h-4 w-4" /> Novo código
            </ContextMenuItem>
            {canReceiveChild(node.code) && (
              <ContextMenuItem
                onClick={() =>
                  setDialogState({ mode: 'child', code: node.code })
                }
              >
                <CornerDownRight className="h-4 w-4" /> Adicionar código dentro
              </ContextMenuItem>
            )}
            {!hasChildren && node.code.parentId == null ? (
              <ContextMenuItem
                onClick={() =>
                  setPrompt({ kind: 'groupFromCode', code: node.code })
                }
              >
                <Tags className="h-4 w-4" /> Criar grupo com este código
              </ContextMenuItem>
            ) : (
              // O motivo vai no proprio item, nao num title: item desabilitado
              // tem pointer-events-none, entao o tooltip nativo nunca dispara e
              // a explicacao ficava invisivel. Texto que exige descobrir o hover
              // e texto que a maioria nao le.
              <ContextMenuItem disabled className="flex-col items-start gap-0.5">
                <span className="flex items-center gap-2">
                  <Tags className="h-4 w-4" /> Criar grupo com este código
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  {hasChildren
                    ? 'Este código já é um grupo.'
                    : 'Remova o código do grupo atual primeiro.'}
                </span>
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
        {hasChildren && !isCollapsed && (
          <ul>
            {node.children.map((c) => renderCode(c, depth + 1, key, null))}
          </ul>
        )}
      </li>
    )
  }

  const isEmpty = tree.collections.length === 0 && tree.loose.length === 0

  return (
    <div className="relative flex h-full flex-col">
      <div className="border-b p-2">
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => setDialogState({ mode: 'create' })}
        >
          <Plus className="h-4 w-4" /> Novo código
        </Button>
        {selected.size > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5 text-xs">
            <span className="flex-1">
              {selected.size} selecionado{selected.size > 1 ? 's' : ''}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMoveFilter('')
                setMoveError(null)
                setMoveOpen(true)
              }}
            >
              <FolderInput className="h-3.5 w-3.5" /> Mover
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(new Set())
                anchorRef.current = null
              }}
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        )}
        {selected.size === 0 && !notice && (
          <p className="mt-1.5 px-1 text-[11px] leading-tight text-muted-foreground/70">
            Ctrl+clique soma • Shift+clique intervala • arraste: borda
            reordena, centro agrupa
          </p>
        )}
        {notice && (
          <p className="mt-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
            {notice}
          </p>
        )}
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scrollRef}
            data-code-root
            className={`flex-1 overflow-auto p-1 transition-colors duration-150 ${rootHover ? 'bg-primary/[0.07] outline-1 outline-dashed outline-primary/50 -outline-offset-4' : ''}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelected(new Set())
                anchorRef.current = null
              }
            }}
          >
            {isEmpty ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum código ainda. Crie códigos ou selecione um trecho do
                documento.
              </p>
            ) : (
              <ul>
                {tree.collections.map((node) => {
                  const key = `col-${node.collection.id}`
                  const isCollapsed = collapsed.has(key)
                  return (
                    <li key={key}>
                      <div className="group flex items-center gap-1 rounded-md px-1 py-1 text-sm hover:bg-accent/50">
                        <button
                          className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
                          onClick={() => toggle(key)}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          className="flex min-w-0 flex-1 items-center gap-2 text-left font-medium"
                          onClick={() => setMembersCollection(node.collection)}
                        >
                          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {node.collection.name}
                          </span>
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="opacity-0 group-hover:opacity-100">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                setMembersCollection(node.collection)
                              }
                            >
                              <Users className="h-4 w-4" /> Gerenciar códigos
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setPrompt({
                                  kind: 'renameCollection',
                                  collection: node.collection
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" /> Renomear
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Excluir a coleção "${node.collection.name}"? Os códigos permanecem.`
                                  )
                                ) {
                                  deleteCollection(node.collection.id)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {!isCollapsed && (
                        <ul>
                          {node.children.map((c) =>
                            renderCode(c, 1, key, node.collection.id)
                          )}
                        </ul>
                      )}
                    </li>
                  )
                })}

                {tree.loose.length > 0 && (
                  <li>
                    {tree.collections.length > 0 && (
                      <p className="px-2 pb-1 pt-3 text-xs uppercase tracking-wide text-muted-foreground/60">
                        Sem coleção
                      </p>
                    )}
                    <ul>
                      {tree.loose.map((c) => renderCode(c, 0, 'loose', null))}
                    </ul>
                  </li>
                )}
              </ul>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setDialogState({ mode: 'create' })}>
            <Plus className="h-4 w-4" /> Novo código
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={expandAll}>
            <UnfoldVertical className="h-4 w-4" /> Expandir tudo
          </ContextMenuItem>
          <ContextMenuItem onClick={collapseAll}>
            <FoldVertical className="h-4 w-4" /> Recolher tudo
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* A dica do arrasto é sobreposta, nunca uma linha no fluxo: no fluxo ela
          empurrava a lista para baixo e o destino sob o cursor mudava sozinho. */}
      {dragIds && (
        <div
          role="status"
          className={`pointer-events-none absolute bottom-2 left-1/2 z-20 max-w-[92%] -translate-x-1/2 truncate rounded-full border bg-background/95 px-3 py-1 text-[11px] font-medium shadow-md backdrop-blur-sm ${dropPos === 'inside' && dropKind !== 'same' ? 'border-dashed border-primary text-foreground' : 'text-muted-foreground'}`}
        >
          {dropHint}
        </div>
      )}

      <CodeDialog
        open={dialogState !== null}
        onOpenChange={(o) => !o && setDialogState(null)}
        title={
          dialogState?.mode === 'edit'
            ? 'Editar código'
            : dialogState?.mode === 'child'
              ? `Novo código em "${dialogState.code?.name}"`
              : 'Novo código'
        }
        initial={
          dialogState?.mode === 'edit'
            ? {
                name: dialogState.code?.name,
                color: dialogState.code?.color,
                description: dialogState.code?.description ?? ''
              }
            : { color: randomColor() }
        }
        onSubmit={handleSubmit}
      />

      <SimplePromptDialog
        open={prompt !== null}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={
          prompt?.kind === 'renameCollection'
            ? 'Renomear coleção'
            : prompt?.kind === 'groupFromCode'
              ? `Novo grupo com "${prompt.code.name}"`
              : prompt?.kind === 'collectionFromGroup'
                ? `Nova coleção com "${prompt.code.name}"`
                : ''
        }
        label={
          prompt?.kind === 'groupFromCode'
            ? 'Nome do grupo'
            : 'Nome da coleção'
        }
        initialValue={
          prompt?.kind === 'renameCollection' ? prompt.collection.name : ''
        }
        onSubmit={handlePrompt}
      />

      <SimplePromptDialog
        open={groupPrompt !== null}
        onOpenChange={(o) => !o && setGroupPrompt(null)}
        title={`Novo grupo com ${groupNames(groupPrompt)}`}
        label="Nome do grupo"
        initialValue=""
        onSubmit={submitGroupPrompt}
      />

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Mover {selected.size > 0 ? `${selected.size} código${selected.size > 1 ? 's' : ''}` : 'códigos'} para grupo…
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Pesquisar grupo..."
            value={moveFilter}
            onChange={(e) => setMoveFilter(e.target.value)}
          />
          {moveError && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {moveError}
            </p>
          )}
          <div className="max-h-72 overflow-auto rounded-md border">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
              onClick={() => {
                const ids = [...selected]
                if (ids.length === 0) return
                void doMove(ids, null)
              }}
            >
              <CornerUpLeft className="h-4 w-4 text-muted-foreground" />
              Sem grupo (1º nível)
            </button>
            {filteredDestinations.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Nenhum grupo ainda. Grupos são códigos de 1º nível que já têm
                filhos.
              </p>
            ) : (
              <ul className="divide-y">
                {filteredDestinations.map((c) => (
                  <li key={c.id}>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
                      onClick={() => {
                        const ids = [...selected]
                        if (ids.length === 0) return
                        void doMove(ids, c.id)
                      }}
                    >
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CollectionMembersDialog
        collection={membersCollection}
        onOpenChange={(o) => !o && setMembersCollection(null)}
      />
    </div>
  )
}
