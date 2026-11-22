import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { mensagemDeErro } from '@/lib/erros'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { flushPendingMemos } from '@/lib/memoAutosave'

export function AppCloseDialog(): JSX.Element {
  const closePending = useRef(false)
  const preparingClose = useRef(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const decideClose = (close: boolean): void => {
    closePending.current = false
    setCloseError(null)
    if (close) window.api.app.confirmClose()
    else window.api.app.cancelClose()
  }

  const prepareClose = useCallback(async (): Promise<void> => {
    if (preparingClose.current) return
    preparingClose.current = true
    useAppStore.setState({ closingProject: true })
    setRetrying(true)
    try {
      const { sairDaRenomeacao, sairDoCodigo, podeSairDoTexto } = useAppStore.getState()
      if (sairDaRenomeacao && !(await sairDaRenomeacao())) {
        throw new Error('Não foi possível salvar a renomeação.')
      }
      if (sairDoCodigo && !(await sairDoCodigo())) {
        throw new Error('Não foi possível salvar as alterações do código.')
      }
      setCloseError(null)
      if (!(await podeSairDoTexto())) {
        closePending.current = false
        window.api.app.cancelClose()
        return
      }
      await flushPendingMemos()
      await useAppStore.getState().notesFlush?.()
      closePending.current = false
      window.api.app.confirmClose()
    } catch (error) {
      setCloseError(mensagemDeErro(error, 'Não foi possível salvar as alterações.'))
    } finally {
      preparingClose.current = false
      useAppStore.setState({ closingProject: false })
      setRetrying(false)
    }
  }, [])

  useEffect(() => window.api.app.onCloseRequested(async () => {
    if (closePending.current) return
    if (useAppStore.getState().closingProject) {
      window.api.app.cancelClose()
      return
    }
    closePending.current = true
    await prepareClose()
  }), [prepareClose])

  return (
    <Dialog open={closeError !== null} onOpenChange={(open) => {
      if (!open && !preparingClose.current) decideClose(false)
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Não foi possível salvar as alterações</DialogTitle>
          <DialogDescription>
            {closeError} Se você sair agora, as alterações ainda não gravadas serão perdidas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={retrying} onClick={() => decideClose(false)}>
            Continuar editando
          </Button>
          <Button variant="destructive" disabled={retrying} onClick={() => decideClose(true)}>
            Sair sem salvar
          </Button>
          <Button disabled={retrying} onClick={() => void prepareClose()}>
            Tentar novamente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
