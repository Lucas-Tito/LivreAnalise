import { useEffect, useState } from 'react'
import { mensagemDeErro } from '@/lib/erros'
import { History, RotateCcw, Trash2 } from 'lucide-react'
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
import { formatBytes } from '@/lib/utils'
import type { ProjectVersion } from '@shared/projectVersions'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function VersionsDialog({ open, onOpenChange }: Props): JSX.Element {
  const versions = useAppStore((s) => s.versions)
  const createVersion = useAppStore((s) => s.createVersion)
  const restoreVersion = useAppStore((s) => s.restoreVersion)
  const deleteVersion = useAppStore((s) => s.deleteVersion)
  const refreshVersions = useAppStore((s) => s.refreshVersions)
  const [label, setLabel] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const off = window.api.versions.onChanged(() => void refreshVersions())
    void refreshVersions()
    return off
  }, [open, refreshVersions])

  const handleCreate = async (): Promise<void> => {
    setWorking(true)
    setError(null)
    try {
      await createVersion(label.trim() || null)
      setLabel('')
    } catch (e) {
      setError(mensagemDeErro(e))
    } finally {
      setWorking(false)
    }
  }

  const handleDelete = async (v: ProjectVersion): Promise<void> => {
    const quando = new Date(v.createdAt).toLocaleString()
    if (!window.confirm(`Apagar o checkpoint de ${quando}? A cópia sai do disco e não volta.`)) return
    setWorking(true)
    setError(null)
    try {
      await deleteVersion(v.id)
    } catch (e) {
      setError(mensagemDeErro(e, 'Não foi possível apagar o checkpoint.'))
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
      setError(mensagemDeErro(e))
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
                      {v.label ?? (v.kind === 'auto' ? 'Automática' : v.kind === 'premigracao' ? 'Antes de migrar' : 'Checkpoint')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString()} · {v.kind === 'auto' ? 'auto' : v.kind === 'premigracao' ? 'pré-migração' : 'manual'} · {formatBytes(v.sizeBytes)} · app {v.appVersion} · schema {v.schemaVersion}
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
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    onClick={() => void handleDelete(v)}
                    title="Apagar este checkpoint do disco"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
