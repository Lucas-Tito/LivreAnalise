import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FolderPlus,
  Layers,
  MoreVertical,
  Pencil,
  Trash2,
  CornerDownRight,
  List,
  Users
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import {
  buildLibraryTree,
  canReceiveChild,
  type CodeNode
} from '@/lib/codeTree'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
  const updateCode = useAppStore((s) => s.updateCode)
  const deleteCode = useAppStore((s) => s.deleteCode)
  const createCollection = useAppStore((s) => s.createCollection)
  const updateCollection = useAppStore((s) => s.updateCollection)
  const deleteCollection = useAppStore((s) => s.deleteCollection)

  const tree = useMemo(
    () => buildLibraryTree(codes, collections, collectionMembers),
    [codes, collections, collectionMembers]
  )
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dialogState, setDialogState] = useState<{
    mode: 'create' | 'edit' | 'child'
    code?: CodeWithCount
  } | null>(null)
  const [collectionPrompt, setCollectionPrompt] = useState<{
    mode: 'create' | 'edit'
    collection?: Collection
  } | null>(null)
  const [membersCollection, setMembersCollection] = useState<Collection | null>(
    null
  )

  const toggle = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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

  const handleCollectionSubmit = (name: string): void => {
    if (!collectionPrompt) return
    if (collectionPrompt.mode === 'edit' && collectionPrompt.collection) {
      updateCollection({ id: collectionPrompt.collection.id, name })
    } else {
      createCollection({ name })
    }
  }

  const renderCode = (
    node: CodeNode<CodeWithCount>,
    depth: number,
    path: string
  ): JSX.Element => {
    const key = `${path}/${node.code.id}`
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(key)
    return (
      <li key={key}>
        <div
          className="group flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-accent/50"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
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
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: node.code.color }}
            />
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
              {canReceiveChild(node.code) && (
                <DropdownMenuItem
                  onClick={() =>
                    setDialogState({ mode: 'child', code: node.code })
                  }
                >
                  <CornerDownRight className="h-4 w-4" /> Adicionar codigo
                  dentro
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
                      `Excluir o codigo "${node.code.name}"? Os codigos dentro dele e as citacoes serao removidos.`
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
          <ul>{node.children.map((c) => renderCode(c, depth + 1, key))}</ul>
        )}
      </li>
    )
  }

  const isEmpty = tree.collections.length === 0 && tree.loose.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b p-2">
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => setDialogState({ mode: 'create' })}
        >
          <Plus className="h-4 w-4" /> Codigo
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => setCollectionPrompt({ mode: 'create' })}
        >
          <FolderPlus className="h-4 w-4" /> Colecao
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {isEmpty ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Nenhum codigo ainda. Crie codigos ou selecione um trecho do
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
                          <Users className="h-4 w-4" /> Gerenciar codigos
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setCollectionPrompt({
                              mode: 'edit',
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
                                `Excluir a colecao "${node.collection.name}"? Os codigos permanecem.`
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
                    <ul>{node.children.map((c) => renderCode(c, 1, key))}</ul>
                  )}
                </li>
              )
            })}

            {tree.loose.length > 0 && (
              <li>
                {tree.collections.length > 0 && (
                  <p className="px-2 pb-1 pt-3 text-xs uppercase tracking-wide text-muted-foreground/60">
                    Sem colecao
                  </p>
                )}
                <ul>{tree.loose.map((c) => renderCode(c, 0, 'loose'))}</ul>
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
            ? 'Editar codigo'
            : dialogState?.mode === 'child'
              ? `Novo codigo em "${dialogState.code?.name}"`
              : 'Novo codigo'
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
        open={collectionPrompt !== null}
        onOpenChange={(o) => !o && setCollectionPrompt(null)}
        title={
          collectionPrompt?.mode === 'edit'
            ? 'Renomear colecao'
            : 'Nova colecao'
        }
        label="Nome da colecao"
        initialValue={
          collectionPrompt?.mode === 'edit'
            ? collectionPrompt.collection?.name
            : ''
        }
        onSubmit={handleCollectionSubmit}
      />

      <CollectionMembersDialog
        collection={membersCollection}
        onOpenChange={(o) => !o && setMembersCollection(null)}
      />
    </div>
  )
}
