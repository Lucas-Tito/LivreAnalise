import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
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
  const [escopo, setEscopo] = useState<'documento' | 'projeto'>('projeto')
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const documents = useAppStore((s) => s.documents)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const locateCodingId = useAppStore((s) => s.locateCodingId)
  const locateOccurrence = useAppStore((s) => s.locateOccurrence)

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
  const filtrando = escopo === 'documento' && currentDocument != null
  // A navegação segue a ordem da barra lateral de documentos, não o id cru
  // que o SQL devolve: é a ordem que o usuário vê.
  const ordemDoc = useMemo(
    () => new Map(documents.map((d, i) => [d.id, i])),
    [documents]
  )
  const visiveis = useMemo(() => {
    const lista = filtrando
      ? quotes.filter((q) => q.documentId === currentDocument!.id)
      : quotes
    return [...lista].sort((a, b) => {
      const da = ordemDoc.get(a.documentId) ?? Number.MAX_SAFE_INTEGER
      const db = ordemDoc.get(b.documentId) ?? Number.MAX_SAFE_INTEGER
      if (da !== db) return da - db
      return a.startPos - b.startPos
    })
  }, [quotes, filtrando, currentDocument, ordemDoc])

  // Posição da ocorrência localizada na lista atual; -1 = nenhuma (ainda).
  const indice = visiveis.findIndex((q) => q.id === locateCodingId)

  // Localizar é circular como a busca dos editores: passa da última volta
  // para a primeira. Lê o alvo pelo getState para o atalho não fechar sobre
  // uma lista obsoleta.
  const irPara = useCallback(
    (dir: 1 | -1): void => {
      if (visiveis.length === 0) return
      const alvo = useAppStore.getState().locateCodingId
      const atual = visiveis.findIndex((q) => q.id === alvo)
      const proximo =
        atual === -1
          ? dir === 1
            ? 0
            : visiveis.length - 1
          : (atual + dir + visiveis.length) % visiveis.length
      void useAppStore.getState().locateOccurrence(visiveis[proximo])
    },
    [visiveis]
  )

  // F3 / Shift+F3 valem enquanto o painel está aberto. Com a lista vazia o F3
// continua sendo do navegador: o painel não tem nada a percorrer.
useEffect(() => {
    if (code === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'F3' || visiveis.length === 0) return
      e.preventDefault()
      irPara(e.shiftKey ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [code, visiveis.length, irPara])

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

        {/* Escopo da localização + anterior/próxima, como a busca dos
            editores. Clicar num trecho rola até ele (troca de documento se
            preciso) em vez de só abrir o documento. */}
        <div className="flex items-center gap-1">
          <div className="flex flex-1 items-center gap-0.5 rounded-md border p-0.5 text-xs">
            <button
              disabled={!currentDocument}
              title={
                currentDocument
                  ? 'Limitar as ocorrências ao documento aberto.'
                  : 'Abra um documento para filtrar os trechos.'
              }
              onClick={() => setEscopo('documento')}
              className={cn(
                'flex-1 rounded px-2 py-1 transition-colors',
                filtrando
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50',
                !currentDocument && 'cursor-not-allowed opacity-50'
              )}
            >
              Neste documento
            </button>
            <button
              title="Percorrer as ocorrências em todos os documentos."
              onClick={() => setEscopo('projeto')}
              className={cn(
                'flex-1 rounded px-2 py-1 transition-colors',
                !filtrando
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              No projeto todo
            </button>
          </div>
          <button
            onClick={() => irPara(-1)}
            disabled={visiveis.length === 0}
            title="Ocorrência anterior (Shift+F3)"
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <ChevronUp className="h-4 w-4" />
            <span className="sr-only">Ocorrência anterior</span>
          </button>
          <button
            onClick={() => irPara(1)}
            disabled={visiveis.length === 0}
            title="Próxima ocorrência (F3)"
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <ChevronDown className="h-4 w-4" />
            <span className="sr-only">Próxima ocorrência</span>
          </button>
        </div>
        {indice >= 0 && (
          <p className="text-[11px] text-muted-foreground">
            Ocorrência {indice + 1} de {visiveis.length}
          </p>
        )}

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
                title="Localizar no texto"
                onClick={() => {
                  void locateOccurrence(q)
                }}
                className={cn(
                  'block w-full rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent',
                  q.id === locateCodingId && 'border-primary/60 bg-accent/60'
                )}
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
