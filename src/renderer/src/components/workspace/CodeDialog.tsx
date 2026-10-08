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
import { Textarea } from '@/components/ui/textarea'
import { CODE_PALETTE } from '@/lib/utils'
import type { CodeWithCount } from '@shared/types'

export interface CodeDialogValue {
  name: string
  color: string
  description: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial?: Partial<CodeDialogValue>
  existing?: CodeWithCount | null
  // Devolve se deu certo: em caso de erro o dialogo fica aberto para a
  // pessoa corrigir em vez de fechar engolindo o que ela digitou.
  onSubmit: (value: CodeDialogValue) => Promise<boolean>
}

export function CodeDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSubmit
}: Props): JSX.Element {
  const [name, setName] = useState('')
  const [color, setColor] = useState(CODE_PALETTE[9])
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setColor(initial?.color ?? CODE_PALETTE[9])
      setDescription(initial?.description ?? '')
    }
  }, [open, initial])

  const [enviando, setEnviando] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim() || enviando) return
    setEnviando(true)
    try {
      const ok = await onSubmit({ name: name.trim(), color, description: description.trim() })
      if (ok) onOpenChange(false)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nome</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
              placeholder="Nome do código"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Cor</label>
            <div className="flex flex-wrap gap-1.5">
              {CODE_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border-2 ${
                    color === c ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Descrição</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional do código"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={enviando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
