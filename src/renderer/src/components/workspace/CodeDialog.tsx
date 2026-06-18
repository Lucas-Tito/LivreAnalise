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
  onSubmit: (value: CodeDialogValue) => void
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

  const submit = (): void => {
    if (!name.trim()) return
    onSubmit({ name: name.trim(), color, description: description.trim() })
    onOpenChange(false)
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
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Nome do codigo"
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
            <label className="text-sm font-medium">Descricao</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descricao opcional do codigo"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
