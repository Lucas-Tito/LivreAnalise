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

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  label: string
  initialValue?: string
  onSubmit: (value: string) => void
}

export function SimplePromptDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue,
  onSubmit
}: Props): JSX.Element {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) setValue(initialValue ?? '')
  }, [open, initialValue])

  const submit = (): void => {
    if (!value.trim()) return
    onSubmit(value.trim())
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{label}</label>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
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
