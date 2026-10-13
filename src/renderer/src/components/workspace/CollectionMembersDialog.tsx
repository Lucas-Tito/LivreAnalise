import { type JSX, useEffect, useState } from 'react'
import { casaBusca } from '@shared/busca'
import { groupIds } from '@shared/codeTree'
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
import type { Collection } from '@shared/types'

interface Props {
  collection: Collection | null
  onOpenChange: (open: boolean) => void
}

export function CollectionMembersDialog({ collection, onOpenChange }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const addCollectionMember = useAppStore((s) => s.addCollectionMember)
  const removeCollectionMember = useAppStore((s) => s.removeCollectionMember)
  const [members, setMembers] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (collection) {
      window.api.collections.members(collection.id).then((ids) => setMembers(new Set(ids)))
      setFilter('')
    }
  }, [collection])

  const toggle = async (codeId: number): Promise<void> => {
    if (!collection) return
    if (members.has(codeId)) {
      await removeCollectionMember(collection.id, codeId)
      setMembers((prev) => {
        const next = new Set(prev)
        next.delete(codeId)
        return next
      })
    } else {
      await addCollectionMember(collection.id, codeId)
      setMembers((prev) => new Set(prev).add(codeId))
    }
  }

  // Grupo reúne categorias. Um código solto que já é membro (de projeto antigo
  // ou importado do ATLAS.ti) continua na lista para poder ser tirado.
  const categorias = groupIds(codes)
  const filtered = codes.filter(
    (c) => (categorias.has(c.id) || members.has(c.id)) && casaBusca(c.name, filter)
  )

  return (
    <Dialog open={collection !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Categorias no grupo "{collection?.name}"</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Filtrar categorias..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="max-h-72 overflow-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {categorias.size === 0
                ? 'Nenhuma categoria ainda. Categorias são códigos de 1º nível que já têm filhos.'
                : 'Nenhuma categoria encontrada.'}
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
