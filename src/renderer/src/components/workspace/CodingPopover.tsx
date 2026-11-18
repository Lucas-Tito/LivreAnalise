import { type JSX, useEffect, useMemo, useRef, useState } from 'react'
import { casaBusca, mesmoTermo } from '@shared/busca'
import { Link2, Plus, StickyNote } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { applicableCodes } from '@shared/codeTree'

interface Props {
  x: number
  y: number
  onClose: () => void
  onApply: (codeId: number) => void
  // Criar código abre o diálogo de configuração (cor, descrição) com o nome já
  // digitado; quem chama aplica ao trecho depois de salvo.
  onCreate: (name: string) => void
  // Texto do trecho selecionado no documento, para o Ctrl+C (#72).
  selectedText: string
  onAddNote?: () => void
  onReattachNote?: () => void
}

export function CodingPopover({
  x,
  y,
  onClose,
  onApply,
  onCreate,
  selectedText,
  onAddNote,
  onReattachNote
}: Props): JSX.Element {
  const allCodes = useAppStore((s) => s.codes)
  const lastUsedCodeId = useAppStore((s) => s.lastUsedCodeId)
  const [filter, setFilter] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onDocMouseDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [onClose])

  // Grupo nao recebe citacao: so o codigo-folha e aplicavel a um trecho.
  const codes = useMemo(() => applicableCodes(allCodes), [allCodes])

  const filtered = codes.filter((c) =>
    casaBusca(c.name, filter)
  )
  const lastUsed = codes.find((c) => c.id === lastUsedCodeId)
  const showLastUsed = lastUsed != null && filter === ''
  const listCodes = showLastUsed
    ? filtered.filter((c) => c.id !== lastUsedCodeId)
    : filtered
  const exactMatch = allCodes.some(
    (c) => mesmoTermo(c.name, filter)
  )

  const handleCreate = (): void => {
    const name = filter.trim()
    if (name) onCreate(name)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    // O popover abre com o foco no campo de busca, então o Ctrl+C ia para o
    // campo vazio e o trecho selecionado no texto não era copiado (#72). Com
    // nada selecionado no campo, o Ctrl+C copia o trecho.
    const campo = e.currentTarget as HTMLInputElement
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'c' &&
      campo.selectionStart === campo.selectionEnd
    ) {
      e.preventDefault()
      void navigator.clipboard.writeText(selectedText)
      return
    }
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length > 0) onApply(filtered[0].id)
      else if (filter.trim() && !exactMatch) handleCreate()
    }
  }

  const maxX = window.innerWidth - 300
  const left = Math.min(x, maxX)
  const top = Math.min(y, window.innerHeight - 360)

  return (
    <div
      ref={ref}
      className="fixed z-50 w-72 rounded-md border bg-popover p-2 shadow-lg"
      style={{ left, top }}
      onCopy={(e) => {
        const input = inputRef.current
        if (document.activeElement === input && input?.selectionStart !== input?.selectionEnd) return
        e.preventDefault()
        e.clipboardData.setData('text/plain', selectedText)
      }}
      onKeyDown={(e) => {
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return
        const input = inputRef.current
        if (document.activeElement === input && input?.selectionStart !== input?.selectionEnd) return
        e.preventDefault()
        void navigator.clipboard.writeText(selectedText).catch(() => {
          alert('Não foi possível copiar o trecho. Tente novamente.')
        })
      }}
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar ou criar código..."
        className="mb-2 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {onAddNote && (
        <button
          onClick={onAddNote}
          className="mb-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <StickyNote className="h-4 w-4" />
          Adicionar nota ao trecho
        </button>
      )}
      {onReattachNote && (
        <button
          onClick={onReattachNote}
          className="mb-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
        >
          <Link2 className="h-4 w-4" />
          Religar a nota aberta a este trecho
        </button>
      )}
      {showLastUsed && (
        <button
          onClick={() => onApply(lastUsed.id)}
          className="mb-1 flex w-full items-center gap-2 rounded-sm bg-accent/50 px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: lastUsed.color }}
          />
          <span className="truncate">{lastUsed.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">último</span>
        </button>
      )}
      <div className="max-h-56 overflow-auto">
        {listCodes.map((c) => (
          <button
            key={c.id}
            onClick={() => onApply(c.id)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
        {filter.trim() && !exactMatch && (
          <button
            onClick={handleCreate}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
          >
            <Plus className="h-4 w-4" />
            Criar código "{filter.trim()}"
          </button>
        )}
        {listCodes.length === 0 && !filter.trim() && !showLastUsed && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Digite para buscar ou criar um código
          </p>
        )}
      </div>
    </div>
  )
}
