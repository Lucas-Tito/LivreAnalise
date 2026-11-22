import { type JSX, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/appStore'
import { mensagemDeErro } from '@/lib/erros'
import { captureFocus, restoreFocus, type FocusAnchor } from '@/lib/keyboard'

// A pergunta antes de sair de um texto editado e não salvo (#31): voltar para a
// biblioteca, trocar de documento, restaurar versão, cancelar a edição ou
// fechar a janela passam todos por aqui.
export function UnsavedTextDialog(): JSX.Element {
  const aberto = useAppStore((s) => s.saidaDoTexto !== null)
  const textoAcoes = useAppStore((s) => s.textoAcoes)
  const responder = useAppStore((s) => s.responderSaidaDoTexto)
  const origin = useRef<FocusAnchor | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const salvar = async (): Promise<void> => {
    if (!textoAcoes) return responder(true)
    setSalvando(true)
    setErro(null)
    try {
      if (await textoAcoes.salvar()) responder(true)
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível salvar o texto.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && responder(false)}>
      <DialogContent className="max-w-md"
        onOpenAutoFocus={() => { origin.current = captureFocus() }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (document.activeElement !== document.body && document.activeElement !== origin.current?.element) return
          restoreFocus(origin.current, document.querySelector<HTMLElement>('[data-focus-key="document-edit"]'))
        }}
      >
        <DialogHeader>
          <DialogTitle>Alterações não salvas no texto</DialogTitle>
          <DialogDescription>
            O texto do documento foi editado e ainda não foi salvo.
          </DialogDescription>
        </DialogHeader>
        {erro && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erro}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => responder(false)} disabled={salvando}>
            Continuar editando
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              textoAcoes?.descartar()
              responder(true)
            }}
            disabled={salvando}
          >
            Descartar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
