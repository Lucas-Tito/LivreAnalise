import { useEffect, useId, useRef, useState, type JSX } from 'react'
import { casaBusca } from '@shared/busca'
import { commandIds, keyboardCommands, shortcutLabel, type CommandId } from '@/lib/keyboard'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export interface PaletteEntry {
  id: CommandId
  unavailable?: string
}

export function KeyboardDialog({ mode, open, entries, onClose, onClosed }: {
  mode: 'palette' | 'help'
  open: boolean
  entries: PaletteEntry[]
  onClose: () => void
  onClosed: (chosen: CommandId | null) => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const chosen = useRef<CommandId | null>(null)
  const option = useRef<HTMLButtonElement | null>(null)
  const listId = useId()
  const palette = mode === 'palette'
  const matches = (id: CommandId): boolean => {
    const { label, group } = keyboardCommands[id]
    return casaBusca(`${label} ${group} ${shortcutLabel(id)}`, query)
  }
  const results = entries.filter(({ id }) => matches(id))
  const index = Math.min(active, Math.max(0, results.length - 1))
  const shortcuts = commandIds.filter((id) => shortcutLabel(id) && matches(id))
  const groups = [...new Set(shortcuts.map((id) => keyboardCommands[id].group))]

  useEffect(() => { if (open) { setQuery(''); setActive(0) } }, [open])
  useEffect(() => { option.current?.scrollIntoView?.({ block: 'nearest' }) }, [index, query, open])

  const choose = (entry: PaletteEntry): void => {
    if (chosen.current || entry.unavailable) return
    chosen.current = entry.id
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent data-command-surface className="max-w-xl" onCloseAutoFocus={(event) => {
        event.preventDefault()
        const id = chosen.current
        chosen.current = null
        onClosed(id)
      }}>
        <DialogHeader>
          <DialogTitle>{palette ? 'Paleta de comandos' : 'Ajuda de atalhos'}</DialogTitle>
          <DialogDescription>
            {palette ? 'Digite para buscar, use as setas para escolher e Enter para executar.' : 'Pesquise por ação, área ou combinação de teclas.'}
          </DialogDescription>
        </DialogHeader>
        <input
          aria-label={palette ? 'Buscar comando' : 'Buscar atalho'}
          role={palette ? 'combobox' : undefined}
          aria-expanded={palette ? true : undefined}
          aria-controls={listId}
          aria-activedescendant={palette && results.length ? `${listId}-${index}` : undefined}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0) }}
          onKeyDown={(event) => {
            if (!palette || event.nativeEvent.isComposing) return
            if (results.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              setActive((index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
            } else if (event.key === 'Enter' && results[index]) {
              event.preventDefault()
              choose(results[index])
            }
          }}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        />
        {palette ? (
          <>
            <div id={listId} role="listbox" aria-label="Comandos" className="max-h-[50vh] overflow-auto">
              {results.map((entry, i) => (
                <button
                  key={entry.id}
                  id={`${listId}-${i}`}
                  ref={i === index ? option : undefined}
                  role="option"
                  type="button"
                  tabIndex={-1}
                  aria-selected={i === index}
                  aria-disabled={!!entry.unavailable}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(entry)}
                  className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent ${i === index ? 'bg-accent ring-1 ring-inset ring-primary' : ''}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span>{keyboardCommands[entry.id].label}</span>
                    <kbd className="shrink-0 text-xs text-muted-foreground">{shortcutLabel(entry.id)}</kbd>
                  </span>
                  {entry.unavailable && <span className="block text-xs text-muted-foreground">{entry.unavailable}</span>}
                </button>
              ))}
            </div>
            {!results.length && <p role="status" className="text-sm text-muted-foreground">Nenhum comando encontrado.</p>}
          </>
        ) : (
          <div id={listId} tabIndex={0} className="max-h-[50vh] space-y-4 overflow-auto px-1">
            {groups.map((group) => (
              <section key={group} className="space-y-1">
                <h3 className="text-sm font-semibold">{group}</h3>
                <dl className="space-y-1">
                  {shortcuts.filter((id) => keyboardCommands[id].group === group).map((id) =>
                    <div key={id} className="flex flex-wrap justify-between gap-x-2 rounded bg-muted/40 px-2 py-1 text-sm">
                      <dt>{keyboardCommands[id].label}</dt>
                      <dd><kbd className="text-xs text-muted-foreground">{shortcutLabel(id)}</kbd></dd>
                    </div>
                  )}
                </dl>
              </section>
            ))}
            {!groups.length && <p role="status" className="text-sm text-muted-foreground">Nenhum atalho encontrado.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
