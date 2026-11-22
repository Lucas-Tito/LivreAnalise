import { type JSX, useId, useLayoutEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useNameEditor } from '@/lib/useNameEditor'

interface Props {
  initialName: string
  write: (name: string, historyGroup: string) => Promise<void>
  onClose: (restoreFocus: boolean) => void
}

export function DocumentNameEditor({ initialName, write, onClose }: Props): JSX.Element {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreFocusRef = useRef(false)
  const editor = useNameEditor({ initialName, write, onClose: () => onClose(restoreFocusRef.current), autosave: false })
  useLayoutEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  return (
    <div className="min-w-0 flex-1 space-y-1" onBlur={(e) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      void editor.leave()
    }}>
      <Input ref={inputRef} aria-label="Nome do documento" value={editor.name}
        aria-invalid={!editor.name.trim()} aria-describedby={`${id}-status${editor.error ? ` ${id}-error` : ''}`}
        className="h-7 px-1 py-0 text-sm" onChange={(e) => editor.change(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter' || e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            restoreFocusRef.current = true
            if (e.key === 'Escape') void editor.cancel()
            else void editor.leave()
          }
        }} />
      <p id={`${id}-status`} role="status" className="text-[10px] text-muted-foreground">
        {editor.status === 'saving' ? 'Salvando…' : editor.status === 'error' ? 'Erro ao salvar' : 'Enter para concluir · Esc para cancelar'}
      </p>
      {editor.error && <>
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{editor.error}</p>
        <Button size="sm" variant="outline" onClick={() => void editor.leave()}>Tentar novamente</Button>
      </>}
    </div>
  )
}
