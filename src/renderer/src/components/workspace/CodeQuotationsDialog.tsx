import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import type { CodeWithCount, CodingWithCode } from '@shared/types'

interface Props {
  code: CodeWithCount | null
  onOpenChange: (open: boolean) => void
}

export function CodeQuotationsDialog({ code, onOpenChange }: Props): JSX.Element {
  const [quotes, setQuotes] = useState<CodingWithCode[]>([])
  const [somenteDocumento, setSomenteDocumento] = useState(false)
  const documents = useAppStore((s) => s.documents)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const selectDocument = useAppStore((s) => s.selectDocument)

  useEffect(() => {
    if (code) {
      window.api.codings.listByCode(code.id).then(setQuotes)
    } else {
      setQuotes([])
    }
  }, [code])

  const docName = (id: number): string =>
    documents.find((d) => d.id === id)?.name ?? '?'

  // sem documento aberto o filtro nao tem a que se referir, entao a lista volta
  // a ser a do projeto inteiro em vez de ficar vazia sem explicacao
  const filtrando = somenteDocumento && currentDocument != null
  const visiveis = filtrando
    ? quotes.filter((q) => q.documentId === currentDocument.id)
    : quotes

  return (
    <Dialog open={code !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {code && (
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: code.color }}
              />
            )}
            Trechos de "{code?.name}" ({visiveis.length})
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-w-0 items-center gap-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {code?.description}
          </p>
          {/* o title fica no label, nao no input: label nao desabilita, entao a
              explicacao continua aparecendo no hover quando nao ha documento */}
          <label
            title={
              currentDocument
                ? undefined
                : 'Abra um documento para filtrar os trechos.'
            }
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-[13px] text-muted-foreground transition-colors',
              currentDocument
                ? 'cursor-pointer hover:bg-accent/50'
                : 'cursor-not-allowed opacity-50'
            )}
          >
            <input
              type="checkbox"
              disabled={!currentDocument}
              checked={filtrando}
              onChange={(e) => setSomenteDocumento(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Neste documento
          </label>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-auto">
          {quotes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este código ainda não foi aplicado a nenhum trecho.
            </p>
          ) : visiveis.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este código não aparece em {currentDocument?.name}. Ele tem{' '}
              {quotes.length}{' '}
              {quotes.length === 1 ? 'trecho' : 'trechos'} em outros documentos.
            </p>
          ) : (
            visiveis.map((q) => (
              <button
                key={q.id}
                onClick={() => {
                  selectDocument(q.documentId)
                  onOpenChange(false)
                }}
                className="block w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent"
              >
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  {docName(q.documentId)} · {q.startPos}-{q.endPos}
                </div>
                <div className="line-clamp-3">{q.text}</div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
