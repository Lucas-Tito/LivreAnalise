import { type JSX, useId } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useNameEditor } from '@/lib/useNameEditor'
import { restoreFocus, type FocusAnchor } from '@/lib/keyboard'

interface Props {
  title: string
  label: string
  initialName: string
  write: (name: string, historyGroup: string) => Promise<void>
  onClose: () => void
  returnFocus?: FocusAnchor | null
}

export function RenameDialog({ title, label, initialName, write, onClose, returnFocus }: Props): JSX.Element {
  const id = useId()
  const editor = useNameEditor({ initialName, write, onClose })
  return (
    <Dialog open onOpenChange={(open) => { if (!open) void editor.leave() }}>
      <DialogContent className="max-w-sm" onCloseAutoFocus={(event) => {
        if (returnFocus) { event.preventDefault(); restoreFocus(returnFocus) }
      }} onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault()
          void editor.save().catch(() => undefined)
        }
      }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>As alterações são salvas automaticamente. Use Ctrl+Z para desfazer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor={id} className="text-sm font-medium">{label}</label>
          <Input id={id} autoFocus value={editor.name} aria-invalid={!editor.name.trim()}
            aria-describedby={editor.error ? `${id}-error` : undefined}
            onChange={(e) => editor.change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void editor.leave()
              }
            }} />
        </div>
        {editor.error && <p id={`${id}-error`} role="alert" className="text-sm text-destructive">{editor.error}</p>}
        <DialogFooter className="items-center gap-2">
          <span role="status" className="mr-auto text-xs text-muted-foreground">
            {editor.status === 'saved' ? 'Salvo' : editor.status === 'saving' ? 'Salvando…' : editor.status === 'dirty' ? 'Alterações não salvas' : 'Erro ao salvar'}
          </span>
          {editor.status === 'error' && <Button variant="outline" onClick={() => void editor.save().catch(() => undefined)}>Tentar novamente</Button>}
          <Button variant="outline" onClick={() => void editor.leave()}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
