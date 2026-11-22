import { type JSX, useEffect, useId, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mensagemDeErro } from '@/lib/erros'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  label: string
  initialValue?: string
  submitLabel?: string
  onSubmit: (value: string) => void | Promise<void>
}

export function SimplePromptDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue,
  submitLabel = 'Salvar',
  onSubmit
}: Props): JSX.Element {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const savingRef = useRef(false)
  const inputId = useId()

  useEffect(() => {
    if (open) { setValue(initialValue ?? ''); setError(null) }
  }, [open, initialValue])

  const submit = async (): Promise<void> => {
    if (!value.trim() || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      await onSubmit(value.trim())
      onOpenChange(false)
    } catch (e) {
      setError(mensagemDeErro(e, 'Não foi possível salvar. Tente novamente.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !savingRef.current && onOpenChange(next)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">{label}</label>
          <Input
            id={inputId}
            autoFocus
            disabled={saving}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submit() } }}
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={saving || !value.trim()} onClick={() => void submit()}>{saving ? 'Aguarde…' : submitLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
