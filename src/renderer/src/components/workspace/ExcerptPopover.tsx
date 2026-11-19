import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { StickyNote } from 'lucide-react'

interface Props {
  x: number
  y: number
  notes: { id: number; title: string }[]
  codes: { id: number; name: string; color: string }[]
  onOpenNote: (id: number) => void
  onSelectCode: (id: number) => void
  onClose: () => void
}

export function ExcerptPopover({ x, y, notes, codes, onOpenNote, onSelectCode, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
    })
    ref.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [x, y])

  useEffect(() => {
    const outside = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const escape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    const scroll = (e: Event): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const buttonClass = 'flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
  return (
    <div ref={ref} role="dialog" aria-label="Ações do trecho" className="fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-md border bg-popover p-2 shadow-lg" style={position}>
      <p className="px-2 pb-2 text-xs text-muted-foreground">O que deseja fazer neste trecho?</p>
      <div className="max-h-[min(320px,calc(100vh-80px))] overflow-auto">
        {notes.map((note) => (
          <button key={note.id} className={buttonClass} onClick={() => onOpenNote(note.id)}>
            <StickyNote className="h-4 w-4 shrink-0" />
            <span className="min-w-0"><span className="block text-xs text-muted-foreground">Abrir nota</span><span className="block truncate">{note.title}</span></span>
          </button>
        ))}
        {notes.length > 0 && codes.length > 0 && <div className="my-1 border-t" />}
        {codes.map((code) => (
          <button key={code.id} className={buttonClass} onClick={() => onSelectCode(code.id)}>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: code.color }} />
            <span className="min-w-0"><span className="block text-xs text-muted-foreground">Selecionar código</span><span className="block truncate">{code.name}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}
