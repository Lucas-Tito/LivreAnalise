import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  Popover,
  PopoverAnchor,
  PopoverContent
} from '@/components/ui/popover'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import type { CodeWithCount, CodingWithCode } from '@shared/types'

interface Props {
  code: CodeWithCount | null
  onOpenChange: (open: boolean) => void
}

// Detalhe do código como popover ancorado na própria linha, e não como diálogo
// modal: a lista de códigos é o lugar de onde se chega aqui, então ela precisa
// continuar visível, focada e — o mais importante — arrastável. Um painel
// centralizado ou um overlay intercepta o arrasto e o destino some.
export function CodeQuotesPopover({ code, onOpenChange }: Props): JSX.Element {
  const [quotes, setQuotes] = useState<CodingWithCode[]>([])
  const [somenteDocumento, setSomenteDocumento] = useState(false)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const documents = useAppStore((s) => s.documents)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const selectDocument = useAppStore((s) => s.selectDocument)

  useEffect(() => {
    if (code) {
      window.api.codings.listByCode(code.id).then(setQuotes)
      setAnchorEl(
        document.querySelector<HTMLElement>(`[data-code-row="${code.id}"]`)
      )
    } else {
      setQuotes([])
      setAnchorEl(null)
    }
  }, [code])

  // Âncora virtual: o popover nasce apontando para a linha do código, sem
  // precisar envolver o item da lista em um trigger.
  const virtualRef = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          anchorEl?.getBoundingClientRect() ?? new DOMRect()
      }
    }),
    [anchorEl]
  )

  const docName = (id: number): string =>
    documents.find((d) => d.id === id)?.name ?? '?'

  // sem documento aberto o filtro nao tem a que se referir, entao a lista volta
  // a ser a do projeto inteiro em vez de ficar vazia sem explicacao
  const filtrando = somenteDocumento && currentDocument != null
  const visiveis = filtrando
    ? quotes.filter((q) => q.documentId === currentDocument.id)
    : quotes

  return (
    <Popover open={code !== null} onOpenChange={onOpenChange}>
      {anchorEl && <PopoverAnchor virtualRef={virtualRef} />}
      <PopoverContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        // O foco continua na linha do código: o painel não rouba o foco da aba.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-96 gap-2 p-3"
      >
        <div className="flex items-start gap-2 pr-6">
          {code && (
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: code.color }}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {code?.name}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                ({visiveis.length})
              </span>
            </p>
            {code?.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {code.description}
              </p>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 rounded-sm p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Fechar</span>
          </button>
        </div>

        <label
          title={
            currentDocument
              ? undefined
              : 'Abra um documento para filtrar os trechos.'
          }
          className={cn(
            'flex w-fit items-center gap-2 rounded-md border px-2 py-1 text-[13px] text-muted-foreground transition-colors',
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

        <div className="max-h-[50vh] space-y-2 overflow-auto">
          {quotes.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Este código ainda não foi aplicado a nenhum trecho.
            </p>
          ) : visiveis.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Este código não aparece em {currentDocument?.name}. Ele tem{' '}
              {quotes.length}{' '}
              {quotes.length === 1 ? 'trecho' : 'trechos'} em outros
              documentos.
            </p>
          ) : (
            visiveis.map((q) => (
              <button
                key={q.id}
                onClick={() => {
                  selectDocument(q.documentId)
                  onOpenChange(false)
                }}
                className="block w-full rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent"
              >
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                  {docName(q.documentId)} · {q.startPos}-{q.endPos}
                </div>
                <div className="line-clamp-3">{q.text}</div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
