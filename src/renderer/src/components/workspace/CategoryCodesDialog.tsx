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
import { mensagemDeErro } from '@/lib/erros'
import type { CodeWithCount } from '@shared/types'

interface Props {
  category: CodeWithCount | null
  onOpenChange: (open: boolean) => void
}

// Marcar põe o código dentro da categoria, desmarcar devolve ao 1º nível -- o
// mesmo moveCodes do arrasto e do "Mover para categoria…". Só código sem filhos
// entra: categoria dentro de categoria criaria o 3º nível.
export function CategoryCodesDialog({ category, onOpenChange }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const moveCodes = useAppStore((s) => s.moveCodes)
  const [filter, setFilter] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (category) {
      setFilter('')
      setErro(null)
    }
  }, [category])

  const categorias = groupIds(codes)
  const nomeDe = (id: number | null): string | undefined =>
    codes.find((c) => c.id === id)?.name
  const filtered = codes.filter(
    (c) =>
      c.id !== category?.id && !categorias.has(c.id) && casaBusca(c.name, filter)
  )

  const toggle = async (code: CodeWithCount): Promise<void> => {
    if (!category) return
    setErro(null)
    try {
      await moveCodes([code.id], code.parentId === category.id ? null : category.id)
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível mover o código.'))
    }
  }

  return (
    <Dialog open={category !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Códigos na categoria "{category?.name}"</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="Filtrar códigos..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {erro && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erro}
          </p>
        )}
        <div className="max-h-72 overflow-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhum código encontrado.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => {
                const outra =
                  c.parentId != null && c.parentId !== category?.id
                    ? nomeDe(c.parentId)
                    : undefined
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-accent/50">
                      <input
                        type="checkbox"
                        checked={c.parentId === category?.id}
                        onChange={() => void toggle(c)}
                      />
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate">{c.name}</span>
                      {outra && (
                        <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                          em {outra}
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
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
