import { useState } from 'react'
import { History, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VersionsDialog({ open, onOpenChange }: Props): JSX.Element {
  const versions = useAppStore((s) => s.versions)
  const createVersion = useAppStore((s) => s.createVersion)
  const restoreVersion = useAppStore((s) => s.restoreVersion)
  const [label, setLabel] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreate = async (): Promise<void> => {
    setWorking(true)
    setError(null)
    try {
      await createVersion(label.trim() || null)
      setLabel('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const handleRestore = async (id: string): Promise<void> => {
    if (!confirm('Restaurar esta versão como um novo projeto? O projeto atual permanece como está.')) return
    setWorking(true)
    setError(null)
    try {
      await restoreVersion(id)
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const sorted = [...versions].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Versões do projeto</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Rótulo do checkpoint (opcional)..."
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button onClick={() => void handleCreate()} disabled={working}>
            <History className="h-4 w-4" /> Salvar
          </Button>
        </div>
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="max-h-72 overflow-auto rounded-md border">
          {sorted.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Nenhuma versão ainda. Salve um checkpoint antes de uma revisão grande.
            </p>
          ) : (
            <ul className="divide-y">
              {sorted.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {v.label ?? (v.kind === 'auto' ? 'Automática' : 'Checkpoint')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()} · {v.kind === 'auto' ? 'auto' : 'manual'} · app {v.appVersion} · schema {v.schemaVersion}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working}
                    onClick={() => void handleRestore(v.id)}
                    title="Abre a cópia como novo projeto (nunca sobrescreve o atual)"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar cópia
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
