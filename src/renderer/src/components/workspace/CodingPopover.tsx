import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { randomColor } from '@/lib/utils'

interface Props {
  x: number
  y: number
  onClose: () => void
  onApply: (codeId: number) => void
}

export function CodingPopover({ x, y, onClose, onApply }: Props): JSX.Element {
  const codes = useAppStore((s) => s.codes)
  const createCode = useAppStore((s) => s.createCode)
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

  const filtered = codes.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  )
  const lastUsed = codes.find((c) => c.id === lastUsedCodeId)
  const exactMatch = codes.some(
    (c) => c.name.toLowerCase() === filter.trim().toLowerCase()
  )

  const handleCreate = async (): Promise<void> => {
    const name = filter.trim()
    if (!name) return
    const code = await createCode({ name, color: randomColor() })
    onApply(code.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
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
    >
      <input
        ref={inputRef}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar ou criar codigo..."
        className="mb-2 h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {lastUsed && filter === '' && (
        <button
          onClick={() => onApply(lastUsed.id)}
          className="mb-1 flex w-full items-center gap-2 rounded-sm bg-accent/50 px-2 py-1.5 text-left text-sm hover:bg-accent"
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: lastUsed.color }}
          />
          <span className="truncate">{lastUsed.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">ultimo</span>
        </button>
      )}
      <div className="max-h-56 overflow-auto">
        {filtered.map((c) => (
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
            Criar codigo "{filter.trim()}"
          </button>
        )}
        {filtered.length === 0 && !filter.trim() && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Digite para buscar ou criar um codigo
          </p>
        )}
      </div>
    </div>
  )
}
