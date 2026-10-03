import { useState } from 'react'
import { BookText, Download, History, Loader2, Redo2, Sparkles, StickyNote, Undo2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useZoomStore } from '@/stores/zoomStore'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AiExportDialog } from './AiExportDialog'
import { VersionsDialog } from './VersionsDialog'

export function TopBar(): JSX.Element {
  const project = useAppStore((s) => s.project)
  const closeProject = useAppStore((s) => s.closeProject)
  const notesPanelOpen = useAppStore((s) => s.notesPanelOpen)
  const toggleNotesPanel = useAppStore((s) => s.toggleNotesPanel)
  const documentNotes = useAppStore((s) => s.documentNotes)
  const projectNotes = useAppStore((s) => s.projectNotes)
  const [working, setWorking] = useState(false)
  const [exportarIa, setExportarIa] = useState(false)
  const [versoes, setVersoes] = useState(false)
  const noteCount = documentNotes.length + projectNotes.length
  const zoom = useZoomStore((s) => s.zoom)
  const font = useZoomStore((s) => s.font)
  const zoomIn = useZoomStore((s) => s.zoomIn)
  const zoomOut = useZoomStore((s) => s.zoomOut)
  const resetZoom = useZoomStore((s) => s.resetZoom)
  const setFont = useZoomStore((s) => s.setFont)
  const history = useAppStore((s) => s.history)
  const undo = useAppStore((s) => s.undo)
  const redo = useAppStore((s) => s.redo)

  const handleExport = async (): Promise<void> => {
    setWorking(true)
    try {
      const result = await window.api.qdpx.export()
      if (result) {
        const warn =
          result.warnings.length > 0 ? `\n\nAvisos:\n- ${result.warnings.join('\n- ')}` : ''
        alert(`Projeto exportado para:\n${result.path}${warn}`)
      }
    } catch (e) {
      alert(`Erro ao exportar: ${(e as Error).message}`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={closeProject}
          title="Voltar para a biblioteca de projetos"
          className="-mx-2 flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-accent"
        >
          <BookText className="h-5 w-5 text-primary" />
          <span className="font-semibold">LivreAnalise</span>
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm">{project?.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void undo()}
            disabled={!history.canUndo}
            title={history.undoLabel ? `Desfazer: ${history.undoLabel} (Ctrl+Z)` : 'Desfazer (Ctrl+Z)'}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void redo()}
            disabled={!history.canRedo}
            title={history.redoLabel ? `Refazer: ${history.redoLabel} (Ctrl+Shift+Z)` : 'Refazer (Ctrl+Shift+Z)'}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-md border px-1" title="Zoom do documento (Ctrl++/−/0)">
          <Button size="sm" variant="ghost" onClick={zoomOut} title="Reduzir (Ctrl+-)">
            A-
          </Button>
          <button
            className="min-w-12 text-center text-xs text-muted-foreground"
            onClick={resetZoom}
            title="Restaurar 100% (Ctrl+0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button size="sm" variant="ghost" onClick={zoomIn} title="Ampliar (Ctrl++)">
            A+
          </Button>
          <button
            className={`rounded px-1.5 py-1 text-xs ${font === 'sans' ? 'bg-accent font-medium' : 'text-muted-foreground'}`}
            onClick={() => setFont('sans')}
            title="Fonte sem serifa"
          >
            Sans
          </button>
          <button
            className={`rounded px-1.5 py-1 text-xs ${font === 'serif' ? 'bg-accent font-medium' : 'text-muted-foreground'}`}
            onClick={() => setFont('serif')}
            title="Fonte com serifa"
          >
            Serif
          </button>
        </div>
        <Button
          size="sm"
          variant={notesPanelOpen ? 'default' : 'outline'}
          onClick={toggleNotesPanel}
          title="Abrir o painel de notas do projeto"
        >
          <StickyNote className="h-4 w-4" />
          Notas{noteCount > 0 ? ` (${noteCount})` : ''}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setExportarIa(true)}>
          <Sparkles className="h-4 w-4" />
          Exportar para IA
        </Button>
        <Button size="sm" variant="outline" onClick={() => setVersoes(true)} title="Checkpoints do projeto (restaurar abre uma cópia)">
          <History className="h-4 w-4" />
          Versões
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={working}
        >
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Exportar QDPX
        </Button>
        <ThemeToggle />
      </div>
      <AiExportDialog open={exportarIa} onOpenChange={setExportarIa} />
      <VersionsDialog open={versoes} onOpenChange={setVersoes} />
    </div>
  )
}
