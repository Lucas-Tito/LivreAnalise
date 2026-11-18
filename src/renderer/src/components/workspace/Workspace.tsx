import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { TopBar } from './TopBar'
import { Sidebar } from './Sidebar'
import { TranscriptPanel } from './TranscriptPanel'
import { NotesPanel } from './NotesPanel'
import { CodeQuotationsDialog } from './CodeQuotationsDialog'
import { UnsavedTextDialog } from './UnsavedTextDialog'
import { useAppStore } from '@/stores/appStore'
import type { CodeWithCount } from '@shared/types'
import { mensagemDeErro } from '@/lib/erros'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function Workspace(): JSX.Element {
  const [viewCode, setViewCode] = useState<CodeWithCount | null>(null)
  const notesPanelOpen = useAppStore((s) => s.notesPanelOpen)
  const podeSairDoTexto = useAppStore((s) => s.podeSairDoTexto)

  const closePending = useRef(false)
  const savingNotes = useRef(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const decideClose = (close: boolean): void => {
    closePending.current = false
    setCloseError(null)
    if (close) window.api.app.confirmClose()
    else window.api.app.cancelClose()
  }

  const flushAndClose = useCallback(async (): Promise<void> => {
    if (savingNotes.current) return
    savingNotes.current = true
    setRetrying(true)
    try {
      await useAppStore.getState().notesFlush?.()
      closePending.current = false
      setCloseError(null)
      window.api.app.confirmClose()
    } catch (error) {
      setCloseError(mensagemDeErro(error, 'Não foi possível salvar a nota.'))
    } finally {
      savingNotes.current = false
      setRetrying(false)
    }
  }, [])

  useEffect(() => window.api.app.onCloseRequested(async () => {
    if (closePending.current) return
    closePending.current = true
    if (!(await podeSairDoTexto())) {
      closePending.current = false
      window.api.app.cancelClose()
      return
    }
    await flushAndClose()
  }), [flushAndClose, podeSairDoTexto])

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar onViewCode={setViewCode} />
        <TranscriptPanel />
        {notesPanelOpen && <NotesPanel />}
      </div>
      <CodeQuotationsDialog
        code={viewCode}
        onOpenChange={(o) => !o && setViewCode(null)}
      />
      <UnsavedTextDialog />
      <Dialog open={closeError !== null} onOpenChange={(open) => {
        if (!open && !savingNotes.current) decideClose(false)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Não foi possível salvar a nota</DialogTitle>
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
            <Button disabled={retrying} onClick={() => void flushAndClose()}>
              Tentar novamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
