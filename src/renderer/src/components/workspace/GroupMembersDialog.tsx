import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/stores/appStore'
import type { CodeGroup } from '@shared/types'

interface Props {
  group: CodeGroup | null
  onOpenChange: (open: boolean) => void
}

export function GroupMembersDialog({ group, onOpenChange }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const [members, setMembers] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (group) {
      window.api.groups.members(group.id).then((ids) => setMembers(new Set(ids)))
      setFilter('')
    }
  }, [group])

  const toggle = async (codeId: number): Promise<void> => {
    if (!group) return
    if (members.has(codeId)) {
      await window.api.groups.removeMember(group.id, codeId)
      setMembers((prev) => {
        const next = new Set(prev)
        next.delete(codeId)
        return next
      })
    } else {
      await window.api.groups.addMember(group.id, codeId)
      setMembers((prev) => new Set(prev).add(codeId))
    }
  }

  const filtered = codes.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Codigos no grupo "{group?.name}"</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Filtrar codigos..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="max-h-72 overflow-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhum codigo encontrado.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50">
                    <input
                      type="checkbox"
                      checked={members.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="truncate">{c.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
