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
import { MemoEditor } from './MemoDialog'

interface Props {
  collection: Collection | null
  onOpenChange: (open: boolean) => void
}

export function CollectionMembersDialog({ collection, onOpenChange }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const collections = useAppStore((s) => s.collections)
  const addCollectionMember = useAppStore((s) => s.addCollectionMember)
  const removeCollectionMember = useAppStore((s) => s.removeCollectionMember)
  const [members, setMembers] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')
  const [memoOpen, setMemoOpen] = useState(false)

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

  // Um grupo pode reunir códigos antes de eles serem organizados em categorias.
  const categorias = groupIds(codes)
  const filtered = codes.filter((c) => casaBusca(c.name, filter))

  return (
    <Dialog open={collection !== null} onOpenChange={(open) => {
      void (async () => {
        if (!open && memoOpen && !(await useAppStore.getState().sairDoMemo?.())) return
        onOpenChange(open)
      })()
    }}>
      <DialogContent className={memoOpen ? 'flex h-[80vh] max-h-[90vh] w-[90vw] max-w-4xl flex-col' : undefined}>
        <DialogHeader>
          <DialogTitle>Códigos e categorias no grupo "{collection?.name}"</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant={memoOpen ? 'outline' : 'secondary'} onClick={() => {
            if (memoOpen) void useAppStore.getState().sairDoMemo?.()
          }}>Códigos e categorias</Button>
          <Button size="sm" variant={memoOpen ? 'secondary' : 'outline'} onClick={() => setMemoOpen(true)}>Memo{(collections.find((c) => c.id === collection?.id)?.memo ?? collection?.memo) ? ' •' : ''}</Button>
        </div>
        {memoOpen && collection ? (
          <MemoEditor target={{ id: collection.id, name: collection.name, kind: 'grupo', memo: collections.find((c) => c.id === collection.id)?.memo ?? collection.memo ?? '' }} onClose={() => setMemoOpen(false)} showHint />
        ) : <>
        <Input
          placeholder="Filtrar códigos e categorias..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="max-h-72 overflow-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhum código ou categoria encontrado.
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
                    <span className="truncate">{c.name}{categorias.has(c.id) ? ' (categoria)' : ''}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  )
}
