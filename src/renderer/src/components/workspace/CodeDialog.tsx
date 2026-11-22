import { type JSX, useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CODE_PALETTE } from '@/lib/utils'
import type { CodeWithCount } from '@shared/types'
import { createCodeSaver, normalizeCodeDraft, type CodeDialogValue } from '@/lib/codeAutosave'
import { mensagemDeErro } from '@/lib/erros'
import { useAppStore } from '@/stores/appStore'
import { restoreFocus, type FocusAnchor } from '@/lib/keyboard'

export type { CodeDialogValue } from '@/lib/codeAutosave'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial?: Partial<CodeDialogValue>
  existing?: CodeWithCount | null
  returnFocus?: FocusAnchor | null
  // Devolve se deu certo: em caso de erro o dialogo fica aberto para a
  // pessoa corrigir em vez de fechar engolindo o que ela digitou.
  onSubmit: (value: CodeDialogValue) => Promise<boolean>
}

export function CodeDialog(props: Props): JSX.Element | null {
  // Uma sessão por abertura/alvo. Atualizar a lista após um autosave não deve
  // reiniciar os campos nem apagar o histórico nativo de digitação.
  if (!props.open) return null
  return <CodeDialogForm key={props.existing?.id ?? 'new'} {...props} />
}

function CodeDialogForm({
  onOpenChange,
  title,
  initial,
  existing,
  returnFocus,
  onSubmit
}: Props): JSX.Element {
  const id = useId()
  const editing = existing != null
  const [draft, setDraft] = useState<CodeDialogValue>(() => ({
    name: existing?.name ?? initial?.name ?? '',
    color: existing?.color ?? initial?.color ?? CODE_PALETTE[9],
    description: existing?.description ?? initial?.description ?? ''
  }))
  const draftRef = useRef(draft)
  const [historyGroup] = useState(() => crypto.randomUUID())
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeRef = useRef(onOpenChange)
  closeRef.current = onOpenChange
  const leavingRef = useRef<Promise<boolean> | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [saver] = useState(() => createCodeSaver(draft, async (value) => {
    if (!existing) return
    await useAppStore.getState().updateCode({
      id: existing.id,
      ...value,
      description: value.description || null,
      historyGroup
    })
  }))

  const save = async (): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setStatus('saving')
    try {
      await saver.flush()
      window.api.app.setCodeDirty(false)
      setStatus('saved')
      setError(null)
    } catch (err) {
      setStatus('error')
      setError(mensagemDeErro(err, 'Não foi possível salvar o código.'))
      throw err
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save

  const leave = useCallback((): Promise<boolean> => {
    if (leavingRef.current) return leavingRef.current
    leavingRef.current = (async () => {
      try {
        await saveRef.current()
        closeRef.current(false)
        return true
      } catch {
        return false
      }
    })().finally(() => { leavingRef.current = null })
    return leavingRef.current
  }, [])

  useEffect(() => {
    if (!editing) return
    useAppStore.getState().registerSairDoCodigo(leave)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      useAppStore.getState().registerSairDoCodigo(null)
      window.api.app.setCodeDirty(false)
    }
  }, [editing, leave])

  const change = (patch: Partial<CodeDialogValue>, immediately = false): void => {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    setDraft(next)
    if (!editing) return
    saver.change(next)
    window.api.app.setCodeDirty(true)
    setStatus('dirty')
    setError(next.name.trim() ? null : 'O nome do código não pode ficar vazio.')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (!next.name.trim()) return
    if (immediately) void saveRef.current().catch(() => undefined)
    else timerRef.current = setTimeout(() => void saveRef.current().catch(() => undefined), 800)
  }

  const submit = async (): Promise<void> => {
    if (!draft.name.trim() || enviando) return
    setEnviando(true)
    try {
      const ok = await onSubmit(normalizeCodeDraft(draft))
      if (ok) onOpenChange(false)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && editing) void leave()
      else onOpenChange(open)
    }}>
      <DialogContent onCloseAutoFocus={(event) => {
        if (returnFocus) { event.preventDefault(); restoreFocus(returnFocus) }
      }} onKeyDown={(e) => {
        if (editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault()
          void saveRef.current().catch(() => undefined)
        }
      }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {editing ? 'As alterações são salvas automaticamente. Use Ctrl+Z para desfazer.' : 'Defina o nome, a cor e a descrição do novo código.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-medium">Nome</label>
            <Input
              id={`${id}-name`}
              autoFocus
              value={draft.name}
              disabled={enviando}
              aria-invalid={editing && !draft.name.trim()}
              onChange={(e) => change({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                if (editing) void leave()
                else void submit()
              } }}
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
                  aria-label={`Cor ${c}`}
                  aria-pressed={draft.color === c}
                  disabled={enviando}
                  onClick={() => change({ color: c }, true)}
                  className={`h-6 w-6 rounded-full border-2 ${
                    draft.color === c ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-description`} className="text-sm font-medium">Descrição</label>
            <Textarea
              id={`${id}-description`}
              value={draft.description}
              disabled={enviando}
              onChange={(e) => change({ description: e.target.value })}
              placeholder="Descrição opcional do código"
            />
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="items-center gap-2">
          {editing ? <>
            <span role="status" className="mr-auto text-xs text-muted-foreground">
              {status === 'saved' ? 'Salvo' : status === 'saving' ? 'Salvando…' : status === 'dirty' ? 'Alterações não salvas' : 'Erro ao salvar'}
            </span>
            {status === 'error' && <Button variant="outline" onClick={() => void saveRef.current().catch(() => undefined)}>Tentar novamente</Button>}
            <Button variant="outline" onClick={() => void leave()}>Fechar</Button>
          </> : <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={enviando || !draft.name.trim()}>Criar</Button>
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
