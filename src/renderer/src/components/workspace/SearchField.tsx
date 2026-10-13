import { type JSX } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Lupa que abre um campo de filtro (#71). Esc ou o X fecham e limpam, como o
// Ctrl+F do documento. O filtro em si é de quem usa: aqui só mora o termo.
export function SearchButton({
  active,
  onClick,
  title
}: {
  active: boolean
  onClick: () => void
  title: string
}): JSX.Element {
  return (
    <Button
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      className="shrink-0 px-2"
      title={title}
      onClick={onClick}
    >
      <Search className="h-4 w-4" />
    </Button>
  )
}

export function SearchField({
  value,
  onChange,
  onClose,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  onClose: () => void
  placeholder: string
}): JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          }
        }}
        placeholder={placeholder}
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Button size="sm" variant="ghost" className="px-2" title="Fechar a busca (Esc)" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
