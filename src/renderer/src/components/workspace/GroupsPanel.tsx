import { useState } from 'react'
import {
  FolderPlus,
  Layers,
  MoreVertical,
  Pencil,
  Trash2,
  Users
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

export function GroupsPanel(): JSX.Element {
  const groups = useAppStore((s) => s.groups)
  const createGroup = useAppStore((s) => s.createGroup)
  const updateGroup = useAppStore((s) => s.updateGroup)
  const deleteGroup = useAppStore((s) => s.deleteGroup)

  const [prompt, setPrompt] = useState<{
    mode: 'create' | 'edit'
    group?: CodeGroup
  } | null>(null)
  const [membersGroup, setMembersGroup] = useState<CodeGroup | null>(null)

  const handleSubmit = (name: string): void => {
    if (!prompt) return
    if (prompt.mode === 'edit' && prompt.group) {
      updateGroup({ id: prompt.group.id, name })
    } else {
      createGroup({ name })
    }
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
        {groups.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Nenhum grupo ainda. Grupos reunem codigos de forma transversal.
          </p>
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.id}>
                <div className="group flex items-center gap-1 rounded-md py-1 pl-2 pr-1 text-sm hover:bg-accent/50">
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setMembersGroup(group)}
                  >
                    <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{group.name}</span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setMembersGroup(group)}>
                        <Users className="h-4 w-4" /> Gerenciar codigos
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setPrompt({ mode: 'edit', group })}
                      >
                        <Pencil className="h-4 w-4" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (
                            confirm(
                              `Excluir o grupo "${group.name}"? Os codigos permanecem.`
                            )
                          ) {
                            deleteGroup(group.id)
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SimplePromptDialog
        open={prompt !== null}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={prompt?.mode === 'edit' ? 'Renomear grupo' : 'Novo grupo'}
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
