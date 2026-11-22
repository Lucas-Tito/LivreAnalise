import { useEffect, useRef, useState, type JSX } from 'react'
import { casaBusca } from '@shared/busca'
import { useAppStore } from '@/stores/appStore'
import { mensagemDeErro } from '@/lib/erros'
import { captureFocus, restoreFocus, type FocusAnchor } from '@/lib/keyboard'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function QuickDocumentDialog({ open, onOpenChange, onOpened, onAfterOpen, onCanceled }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpened?: () => void
  onAfterOpen?: () => void
  onCanceled?: () => void
}): JSX.Element {
  const documents = useAppStore((s) => s.documents)
  const selectDocument = useAppStore((s) => s.selectDocument)
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  const [working, setWorking] = useState(false)
  const selecting = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const focusDocument = useRef(false)
  const previousFocus = useRef<FocusAnchor | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const options = documents.filter((doc) => casaBusca(doc.name, filter))
  const index = Math.min(active, Math.max(0, options.length - 1))
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (open) { setFilter(''); setActive(0); setError(null) }
  }, [open])
  useEffect(() => { optionRefs.current[index]?.scrollIntoView?.({ block: 'nearest' }) }, [index, filter])

  const openDocument = async (id: number): Promise<void> => {
    if (selecting.current) return
    selecting.current = true
    setWorking(true)
    setError(null)
    try {
      if (await selectDocument(id)) {
        focusDocument.current = true
        onOpenChange(false)
        onOpened?.()
      } else {
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
      }
    } catch (err) {
      setError(mensagemDeErro(err, 'Não foi possível abrir o documento.'))
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    } finally {
      selecting.current = false
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!selecting.current) onOpenChange(next) }}>
      <DialogContent data-command-surface aria-busy={working} onOpenAutoFocus={() => {
        previousFocus.current = captureFocus()
      }} onCloseAutoFocus={(event) => {
        event.preventDefault()
        if (focusDocument.current) {
          focusDocument.current = false
          onAfterOpen?.()
        } else {
          restoreFocus(previousFocus.current)
          onCanceled?.()
        }
        previousFocus.current = null
      }}>
        <DialogHeader>
          <DialogTitle>Abrir documento</DialogTitle>
          <DialogDescription>Digite para filtrar, use as setas para escolher e Enter para abrir.</DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          aria-label="Buscar documento"
          role="combobox"
          aria-expanded="true"
          aria-controls="quick-documents"
          aria-activedescendant={options.length ? `quick-document-${index}` : undefined}
          value={filter}
          onChange={(event) => { setFilter(event.target.value); setActive(0) }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (options.length) setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
            } else if (event.key === 'Enter' && options[index]) {
              event.preventDefault()
              void openDocument(options[index].id)
            }
          }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div id="quick-documents" role="listbox" aria-label="Documentos" className="max-h-72 overflow-auto">
          {options.map((doc, i) => (
            <button
              key={doc.id}
              id={`quick-document-${i}`}
              ref={(el) => { optionRefs.current[i] = el }}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={i === index}
              disabled={working}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(i)}
              onClick={() => void openDocument(doc.id)}
              className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent ${i === index ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
            >{doc.name}</button>
          ))}
          {options.length === 0 && <p className="p-3 text-sm text-muted-foreground">Nenhum documento encontrado.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
