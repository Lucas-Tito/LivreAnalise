import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Layers,
  MoreVertical,
  Pencil,
  Trash2,
  Users,
  CornerDownRight
} from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { SimplePromptDialog } from './SimplePromptDialog'
import { GroupMembersDialog } from './GroupMembersDialog'
import type { CodeGroup } from '@shared/types'

interface GroupNode {
  group: CodeGroup
  children: GroupNode[]
}

function buildTree(groups: CodeGroup[]): GroupNode[] {
  const byParent = new Map<number | null, CodeGroup[]>()
  for (const g of groups) {
    const key = g.parentGroupId ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(g)
  }
  const build = (parentId: number | null): GroupNode[] =>
    (byParent.get(parentId) ?? []).map((group) => ({
      group,
      children: build(group.id)
    }))
  return build(null)
}

export function GroupsPanel(): JSX.Element {
  const groups = useAppStore((s) => s.groups)
  const createGroup = useAppStore((s) => s.createGroup)
  const updateGroup = useAppStore((s) => s.updateGroup)
  const deleteGroup = useAppStore((s) => s.deleteGroup)

  const tree = useMemo(() => buildTree(groups), [groups])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [prompt, setPrompt] = useState<{
    mode: 'create' | 'edit' | 'child'
    group?: CodeGroup
  } | null>(null)
  const [membersGroup, setMembersGroup] = useState<CodeGroup | null>(null)

  const toggle = (id: number): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = (name: string): void => {
    if (!prompt) return
    if (prompt.mode === 'edit' && prompt.group) {
      updateGroup({ id: prompt.group.id, name })
    } else {
      createGroup({
        name,
        parentGroupId: prompt.mode === 'child' ? prompt.group?.id ?? null : null
      })
    }
  }

  const renderNode = (node: GroupNode, depth: number): JSX.Element => {
    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.group.id)
    return (
      <li key={node.group.id}>
        <div
          className="group flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-accent/50"
          style={{ paddingLeft: depth * 14 + 4 }}
        >
          <button
            className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => hasChildren && toggle(node.group.id)}
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
            onClick={() => setMembersGroup(node.group)}
          >
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.group.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="opacity-0 group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setMembersGroup(node.group)}>
                <Users className="h-4 w-4" /> Gerenciar codigos
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPrompt({ mode: 'child', group: node.group })}
              >
                <CornerDownRight className="h-4 w-4" /> Adicionar subgrupo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPrompt({ mode: 'edit', group: node.group })}
              >
                <Pencil className="h-4 w-4" /> Renomear
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      `Excluir o grupo "${node.group.name}"? Subgrupos serao removidos (os codigos permanecem).`
                    )
                  ) {
                    deleteGroup(node.group.id)
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
          onClick={() => setPrompt({ mode: 'create' })}
        >
          <FolderPlus className="h-4 w-4" /> Novo grupo
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-1">
        {tree.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Nenhum grupo ainda. Grupos reunem codigos de forma transversal e
            podem conter subgrupos.
          </p>
        ) : (
          <ul>{tree.map((n) => renderNode(n, 0))}</ul>
        )}
      </div>

      <SimplePromptDialog
        open={prompt !== null}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={
          prompt?.mode === 'edit'
            ? 'Renomear grupo'
            : prompt?.mode === 'child'
              ? 'Novo subgrupo'
              : 'Novo grupo'
        }
        label="Nome do grupo"
        initialValue={prompt?.mode === 'edit' ? prompt.group?.name : ''}
        onSubmit={handleSubmit}
      />

      <GroupMembersDialog
        group={membersGroup}
        onOpenChange={(o) => !o && setMembersGroup(null)}
      />
    </div>
  )
}
