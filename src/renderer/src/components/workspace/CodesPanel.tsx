import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  CornerDownRight,
  List
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { CodeDialog, type CodeDialogValue } from './CodeDialog'
import { randomColor } from '@/lib/utils'
import type { CodeWithCount } from '@shared/types'

interface TreeNode {
  code: CodeWithCount
  children: TreeNode[]
}

function buildTree(codes: CodeWithCount[]): TreeNode[] {
  const byParent = new Map<number | null, CodeWithCount[]>()
  for (const c of codes) {
    const key = c.parentId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(c)
  }
  const build = (parentId: number | null): TreeNode[] =>
    (byParent.get(parentId) ?? []).map((code) => ({
      code,
      children: build(code.id)
    }))
  return build(null)
}

interface Props {
  onViewCode: (code: CodeWithCount) => void
}

export function CodesPanel({ onViewCode }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const createCode = useAppStore((s) => s.createCode)
  const updateCode = useAppStore((s) => s.updateCode)
  const deleteCode = useAppStore((s) => s.deleteCode)

  const tree = useMemo(() => buildTree(codes), [codes])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [dialogState, setDialogState] = useState<{
    mode: 'create' | 'edit' | 'child'
    code?: CodeWithCount
  } | null>(null)

  const toggle = (id: number): void => {
    setCollapsed((prev) => {
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
        parentId: dialogState.mode === 'child' ? dialogState.code?.id ?? null : null
      })
    }
  }

  const renderNode = (node: TreeNode, depth: number): JSX.Element => {
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.code.id)
    return (
      <li key={node.code.id}>
        <div
          className="group flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-accent/50"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <button
            className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => hasChildren && toggle(node.code.id)}
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
              <DropdownMenuItem
                onClick={() =>
                  setDialogState({ mode: 'child', code: node.code })
                }
              >
                <CornerDownRight className="h-4 w-4" /> Adicionar subcodigo
              </DropdownMenuItem>
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
                      `Excluir o codigo "${node.code.name}"? Subcodigos e codificacoes serao removidos.`
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
          <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2">
        <Button
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => setDialogState({ mode: 'create' })}
        >
          <Plus className="h-4 w-4" /> Novo codigo
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {tree.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Nenhum codigo ainda. Crie codigos ou selecione um trecho do
            documento.
          </p>
        ) : (
          <ul>{tree.map((n) => renderNode(n, 0))}</ul>
        )}
      </div>

      <CodeDialog
        open={dialogState !== null}
        onOpenChange={(o) => !o && setDialogState(null)}
        title={
          dialogState?.mode === 'edit'
            ? 'Editar codigo'
            : dialogState?.mode === 'child'
              ? 'Novo subcodigo'
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
    </div>
  )
}
