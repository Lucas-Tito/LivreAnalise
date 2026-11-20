import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mensagemDeErro } from '@/lib/erros'
import { useAppStore } from '@/stores/appStore'
import { memoSaver } from '@/lib/memoAutosave'

export interface MemoTarget {
  id: number
  name: string
  kind: 'código' | 'categoria' | 'grupo'
  memo: string
}

export function MemoDialog({ target, onClose }: { target: MemoTarget; onClose: () => void }): JSX.Element {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) void useAppStore.getState().sairDoMemo?.() }}>
      <DialogContent className="flex h-[80vh] max-h-[90vh] w-[90vw] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>Memo de {target.kind}: {target.name}</DialogTitle>
          <DialogDescription>{memoHint(target.kind)}</DialogDescription>
        </DialogHeader>
        <MemoEditor target={target} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function memoHint(kind: MemoTarget['kind']): string {
  return kind === 'código'
    ? 'Registre significado, critérios de uso, ambiguidades ou diferenças em relação a outros códigos.'
    : kind === 'categoria'
      ? 'Registre o que conecta os códigos, diferenças, exceções ou dúvidas.'
      : 'Registre o critério de organização ou a relação com o objetivo da pesquisa.'
}

export function MemoEditor({ target, onClose, showHint = false, unavailable = false }: { target: MemoTarget; onClose: () => void; showHint?: boolean; unavailable?: boolean }): JSX.Element {
  const [saver] = useState(() => memoSaver(JSON.stringify([useAppStore.getState().project?.guid, target.kind, target.id]), target.memo, async (body) => {
    if (target.kind === 'grupo') await useAppStore.getState().updateCollection({ id: target.id, memo: body })
    else await useAppStore.getState().updateCode({ id: target.id, memo: body })
  }))
  const closingProject = useAppStore((state) => state.closingProject)
  const [text, setText] = useState(saver.read)
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>(() => saver.isPending() ? 'dirty' : 'saved')
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const unavailableRef = useRef(unavailable)
  unavailableRef.current = unavailable

  const save = useCallback(async (): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (unavailableRef.current) return
    setStatus('saving')
    try {
      await saver.flush()
      setStatus('saved')
      setError(null)
    } catch (e) {
      setStatus('error')
      setError(mensagemDeErro(e, 'Não foi possível salvar o memo.'))
      throw e
    }
  }, [saver])
  const saveRef = useRef(save)
  saveRef.current = save

  useEffect(() => {
    const leave = async (): Promise<boolean> => {
      if (unavailableRef.current) {
        if (saver.isPending()) return false
        closeRef.current()
        return true
      }
      try {
        await saveRef.current()
        closeRef.current()
        return true
      } catch {
        return false
      }
    }
    useAppStore.getState().registerSairDoMemo(leave)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (!unavailableRef.current) void saver.flush().catch(() => undefined)
      if (useAppStore.getState().sairDoMemo === leave) useAppStore.getState().registerSairDoMemo(null)
    }
  }, [saver])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" onKeyDown={(e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save().catch(() => undefined)
      }
    }}>
        {showHint && <p className="shrink-0 text-sm text-muted-foreground">{memoHint(target.kind)}</p>}
        <Textarea className="min-h-0 flex-1 resize-none overflow-auto" aria-label="Texto do memo" spellCheck={false} value={text} readOnly={unavailable || closingProject} onChange={(e) => {
          if (unavailableRef.current || useAppStore.getState().closingProject) return
          const value = e.target.value
          setText(value)
          saver.change(value)
          setStatus('dirty')
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => void saveRef.current().catch(() => undefined), 800)
        }} />
        {unavailable && <p role="alert" className="text-sm text-destructive">
          O item foi removido. Você pode selecionar e copiar o texto antes de descartar o rascunho.
        </p>}
        {!unavailable && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="shrink-0 items-center gap-2">
          <span role="status" className="mr-auto text-xs text-muted-foreground">
            {status === 'saved' ? 'Salvo' : status === 'saving' ? 'Salvando…' : status === 'dirty' ? 'Alterações não salvas' : 'Erro ao salvar'}
          </span>
          {unavailable && saver.isPending() && <Button variant="destructive" onClick={() => {
            saver.discard()
            closeRef.current()
          }}>Descartar rascunho</Button>}
          {!unavailable && status === 'error' && <Button variant="outline" onClick={() => void save().catch(() => undefined)}>Tentar novamente</Button>}
          <Button variant="outline" onClick={() => void useAppStore.getState().sairDoMemo?.()}>Voltar</Button>
        </DialogFooter>
    </div>
  )
}
