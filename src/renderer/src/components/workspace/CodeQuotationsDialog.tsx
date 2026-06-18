import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useAppStore } from '@/stores/appStore'
import type { CodeWithCount, CodingWithCode } from '@shared/types'

interface Props {
  code: CodeWithCount | null
  onOpenChange: (open: boolean) => void
}

export function CodeQuotationsDialog({ code, onOpenChange }: Props): JSX.Element {
  const [quotes, setQuotes] = useState<CodingWithCode[]>([])
  const documents = useAppStore((s) => s.documents)
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
            Trechos de "{code?.name}" ({quotes.length})
          </DialogTitle>
        </DialogHeader>
        {code?.description && (
          <p className="text-sm text-muted-foreground">{code.description}</p>
        )}
        <div className="max-h-[60vh] space-y-2 overflow-auto">
          {quotes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este codigo ainda nao foi aplicado a nenhum trecho.
            </p>
          ) : (
            quotes.map((q) => (
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
