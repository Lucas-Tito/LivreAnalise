import { useMemo, useState } from 'react'
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
  X
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import {
  buildLibraryTree,
  canReceiveChild,
  groupDestinations,
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
import type { CodeWithCount, Collection } from '@shared/types'

interface Props {
  onViewCode: (code: CodeWithCount) => void
}

export function CodesPanel({ onViewCode }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const collections = useAppStore((s) => s.collections)
  const collectionMembers = useAppStore((s) => s.collectionMembers)
  const createCode = useAppStore((s) => s.createCode)
  const createGroup = useAppStore((s) => s.createGroup)
  const updateCode = useAppStore((s) => s.updateCode)
  const deleteCode = useAppStore((s) => s.deleteCode)
  const moveCodes = useAppStore((s) => s.moveCodes)
  const createCollection = useAppStore((s) => s.createCollection)
  const updateCollection = useAppStore((s) => s.updateCollection)
  const deleteCollection = useAppStore((s) => s.deleteCollection)
  const refreshCollections = useAppStore((s) => s.refreshCollections)

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

  const toggle = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleSelect = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = (value: CodeDialogValue): void => {
    if (!dialogState) return
    if (dialogState.mode === 'edit' && dialogState.code) {
      updateCode({
        id: dialogState.code.id,
        name: value.name,
        color: value.color,
        description: value.description || null
      })
    } else {
      createCode({
        name: value.name,
        color: value.color,
        description: value.description || null,
        parentId:
          dialogState.mode === 'child' ? dialogState.code?.id ?? null : null
      })
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
      await window.api.collections.addMember(collection.id, prompt.code.id)
      await refreshCollections()
    }
  }

  const removeFromCollection = async (
    collectionId: number,
    codeId: number
  ): Promise<void> => {
    await window.api.collections.removeMember(collectionId, codeId)
    await refreshCollections()
  }

  const doMove = async (ids: number[], parentId: number | null): Promise<void> => {
    try {
      for (const id of ids) validateParentChange(codes, id, parentId)
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Movimento inválido.')
      return
    }
    setMoveError(null)
    try {
      await moveCodes(ids, parentId)
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Não foi possível mover.')
      return
    }
    setSelected(new Set())
    setMoveOpen(false)
    setMoveFilter('')
  }

  const handleDropOn = async (targetId: number | null): Promise<void> => {
    if (!dragIds || dragIds.length === 0) return
    setDropTarget(null)
    setDragIds(null)
    await doMove(dragIds, targetId)
  }

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
    return (
      <li key={key}>
        <div
          className={`group flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-accent/50 ${isDropTarget ? 'bg-accent ring-1 ring-primary' : ''}`}
          style={{ paddingLeft: depth * 14 + 4 }}
          onDragOver={(e) => {
            if (!dragIds) return
            const ok = dragIds.every((id) => {
              try {
                validateParentChange(codes, id, node.code.id)
                return true
              } catch {
                return false
              }
            })
            if (ok) {
              e.preventDefault()
              setDropTarget(node.code.id)
            }
          }}
          onDragLeave={() => {
            if (dropTarget === node.code.id) setDropTarget(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            void handleDropOn(node.code.id)
          }}
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0"
            checked={isSelected}
            onChange={() => toggleSelect(node.code.id)}
            title="Selecionar para mover em conjunto"
          />
          <span
            draggable
            title="Arrastar para mover"
            onDragStart={(e) => {
              const ids = selected.has(node.code.id)
                ? [...selected]
                : [node.code.id]
              setDragIds(ids)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', JSON.stringify(ids))
            }}
            onDragEnd={() => {
              setDragIds(null)
              setDropTarget(null)
            }}
            className="flex h-4 w-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </span>
          <button
            className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => hasChildren && toggle(key)}
          >
            {hasChildren ? (
              isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )
            ) : null}
          </button>
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => onViewCode(node.code)}
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
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="opacity-0 group-hover:opacity-100">
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
                    setPrompt({ kind: 'collectionFromGroup', code: node.code })
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
                  onClick={() => removeFromCollection(collectionId, node.code.id)}
                >
                  <FolderMinus className="h-4 w-4" /> Remover da coleção
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setDialogState({ mode: 'edit', code: node.code })}
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
    <div className="flex h-full flex-col">
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
              onClick={() => setSelected(new Set())}
            >
              <X className="h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        )}
      </div>
      <div
        className="flex-1 overflow-auto p-1"
        onDragOver={(e) => {
          if (dragIds) e.preventDefault()
        }}
        onDrop={(e) => {
          e.preventDefault()
          void handleDropOn(null)
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
                      <span className="truncate">{node.collection.name}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="opacity-0 group-hover:opacity-100">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setMembersCollection(node.collection)}
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
