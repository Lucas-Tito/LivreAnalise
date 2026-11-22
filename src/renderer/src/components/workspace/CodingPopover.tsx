import { type JSX, useEffect, useMemo, useRef, useState } from 'react'
import { casaBusca, mesmoTermo } from '@shared/busca'
import { Link2, Plus, StickyNote } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { applicableCodes } from '@shared/codeTree'
import { matchesCommand } from '@/lib/keyboard'

interface Props {
  x: number
  y: number
  onClose: (reason: 'escape' | 'outside') => void
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
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    inputRef.current?.focus()
    const onDocMouseDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) closeRef.current('outside')
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

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
  const options: Array<{ key: string; label: string; action: () => void; color?: string; last?: boolean }> = [
    ...(showLastUsed && lastUsed ? [{ key: `code-${lastUsed.id}`, label: lastUsed.name, color: lastUsed.color, last: true, action: () => onApply(lastUsed.id) }] : []),
    ...listCodes.map((c) => ({ key: `code-${c.id}`, label: c.name, color: c.color, action: () => onApply(c.id) })),
    ...(filter.trim() && !exactMatch ? [{ key: 'create', label: `Criar código "${filter.trim()}"`, action: () => onCreate(filter.trim()) }] : []),
    ...(onAddNote ? [{ key: 'note', label: 'Adicionar nota ao trecho', action: onAddNote }] : []),
    ...(onReattachNote ? [{ key: 'reattach', label: 'Religar a nota aberta a este trecho', action: onReattachNote }] : [])
  ]
  const activeIndex = active !== null && options.length
    ? Math.min(active, options.length - 1)
    : options[0] && options[0].key !== 'note' && options[0].key !== 'reattach' ? 0 : -1

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, filter])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.nativeEvent.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (options.length) {
        const next = activeIndex < 0
          ? e.key === 'ArrowDown' ? 0 : options.length - 1
          : (activeIndex + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
        setActive(next)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!e.repeat) options[activeIndex]?.action()
    }
  }

  const maxX = window.innerWidth - 300
  const left = Math.max(8, Math.min(x, maxX))
  const top = Math.max(8, Math.min(y, window.innerHeight - 360))

  return (
    <div
      ref={ref}
      data-command-surface
      role="dialog"
      aria-label="Codificar trecho"
      className="fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-md border bg-popover p-2 shadow-lg"
      style={{ left, top }}
      onBlur={(e) => {
        if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) onClose('outside')
      }}
      onCopy={(e) => {
        const input = inputRef.current
        if (document.activeElement === input && input?.selectionStart !== input?.selectionEnd) return
        e.preventDefault()
        e.clipboardData.setData('text/plain', selectedText)
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.defaultPrevented) return
        if (matchesCommand(e.nativeEvent, 'cancel')) {
          e.preventDefault()
          e.stopPropagation()
          onClose('escape')
          return
        }
        // Ctrl/Cmd+C copia o trecho, a menos que haja seleção no filtro (#72).
        if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'c') return
        const input = inputRef.current
        if (document.activeElement === input && input?.selectionStart !== input?.selectionEnd) return
        e.preventDefault()
        if (!navigator.clipboard) {
          document.execCommand?.('copy')
          return
        }
        void navigator.clipboard.writeText(selectedText).catch(() => alert('Não foi possível copiar o trecho. Tente novamente.'))
      }}
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => { setFilter(e.target.value); setActive(null) }}
        onKeyDown={handleKeyDown}
        placeholder="Buscar ou criar código..."
        aria-label="Buscar ou criar código"
        role="combobox"
        aria-expanded="true"
        aria-controls="coding-options"
        aria-activedescendant={activeIndex >= 0 ? `coding-option-${activeIndex}` : undefined}
        className="mb-2 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div id="coding-options" role="listbox" aria-label="Ações para o trecho" className="max-h-[min(14rem,calc(100vh-76px))] overflow-auto">
        {options.map((option, index) => (
          <button
            key={option.key}
            ref={(el) => { optionRefs.current[index] = el }}
            id={`coding-option-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            type="button"
            title={option.label}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActive(index)}
            onClick={option.action}
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${index === activeIndex ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
          >
            {option.color ? <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: option.color }} /> :
              option.key === 'note' ? <StickyNote className="h-4 w-4" /> :
                option.key === 'reattach' ? <Link2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span className="truncate">{option.label}</span>
            {option.last && <span className="ml-auto text-xs text-muted-foreground">último</span>}
          </button>
        ))}
        {listCodes.length === 0 && !filter.trim() && !showLastUsed && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Digite para buscar ou criar um código
          </p>
        )}
      </div>
    </div>
  )
}
