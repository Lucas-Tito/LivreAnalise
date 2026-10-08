import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
  const [atual, setAtual] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const documents = useAppStore((s) => s.documents)
  const codes = useAppStore((s) => s.codes)
  const currentDocument = useAppStore((s) => s.currentDocument)
  const locateOccurrence = useAppStore((s) => s.locateOccurrence)
  const listaRef = useRef<HTMLDivElement>(null)

  // `codes` muda a cada mutação de citação (o usageCount vem junto no refresh),
  // então serve de sinal para a lista se refazer. Sem isso ela era uma
  // fotografia: apagar uma citação deixava o item antigo aqui, e clicar nele
  // não rolava, não piscava e não dizia nada.
  useEffect(() => {
    if (!code) {
      setQuotes([])
      return
    }
    let vivo = true
    window.api.codings.listByCode(code.id).then((lista) => {
      if (vivo) setQuotes(lista)
    })
    return () => {
      vivo = false
    }
  }, [code, codes])

  useEffect(() => {
    setAtual(0)
    setAviso(null)
  }, [code, somenteDocumento])

  const docName = (id: number): string =>
    documents.find((d) => d.id === id)?.name ?? '?'

  // sem documento aberto o filtro nao tem a que se referir, entao a lista volta
  // a ser a do projeto inteiro em vez de ficar vazia sem explicacao
  const filtrando = somenteDocumento && currentDocument != null
  const visiveis = filtrando
    ? quotes.filter((q) => q.documentId === currentDocument.id)
    : quotes

  const indice = visiveis.length === 0 ? -1 : Math.min(atual, visiveis.length - 1)

  // As setas percorrem a LISTA, não o texto: num diálogo que cobre a
  // transcrição, navegar pelo documento por baixo não mostraria nada. Abrir a
  // ocorrência é o clique (ou Enter), e aí o diálogo sai da frente.
  const andar = (dir: 1 | -1): void => {
    if (visiveis.length === 0) return
    setAtual((i) => (Math.min(i, visiveis.length - 1) + dir + visiveis.length) % visiveis.length)
  }

  useEffect(() => {
    if (indice < 0) return
    listaRef.current
      ?.querySelector(`[data-indice="${indice}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [indice])

  const abrir = async (q: CodingWithCode): Promise<void> => {
    const ok = await locateOccurrence(q)
    if (!ok) {
      setAviso('Esse trecho não existe mais: o documento foi apagado.')
      return
    }
    onOpenChange(false)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      andar(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      andar(-1)
    } else if (e.key === 'Enter' && indice >= 0) {
      e.preventDefault()
      void abrir(visiveis[indice])
    }
  }

  return (
    <Dialog open={code !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" onKeyDown={onKeyDown}>
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

          {visiveis.length > 0 && (
            <div className="flex shrink-0 items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {indice + 1} de {visiveis.length}
              </span>
              <Button size="sm" variant="ghost" onClick={() => andar(-1)} title="Anterior (↑)">
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => andar(1)} title="Próximo (↓)">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Escopo como par de opções, não checkbox: as duas alternativas ficam
              visíveis e nomeadas, em vez de uma caixa cujo estado desmarcado a
              pessoa tem de deduzir. */}
          <div className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5 text-xs">
            <button
              disabled={!currentDocument}
              title={
                currentDocument
                  ? 'Limitar as ocorrências ao documento aberto.'
                  : 'Abra um documento para filtrar os trechos.'
              }
              onClick={() => setSomenteDocumento(true)}
              className={cn(
                'rounded px-2 py-1 transition-colors',
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
              onClick={() => setSomenteDocumento(false)}
              className={cn(
                'rounded px-2 py-1 transition-colors',
                !filtrando
                  ? 'bg-accent font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              )}
            >
              No projeto todo
            </button>
          </div>
        </div>

        {aviso && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
            {aviso}
          </p>
        )}

        <div ref={listaRef} className="max-h-[60vh] space-y-2 overflow-auto">
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
            visiveis.map((q, i) => (
              <button
                key={q.id}
                data-indice={i}
                title="Localizar no texto"
                onClick={() => void abrir(q)}
                onMouseEnter={() => setAtual(i)}
                className={cn(
                  'block w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent',
                  i === indice && 'border-primary/60 bg-accent/60'
                )}
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
