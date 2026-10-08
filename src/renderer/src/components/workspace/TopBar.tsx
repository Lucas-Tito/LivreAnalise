import { useState } from 'react'
import { BookText, ChevronDown, Download, History, Loader2, Redo2, Sparkles, StickyNote, Undo2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { mensagemDeErro } from '@/lib/erros'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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
      alert(`Erro ao exportar: ${mensagemDeErro(e)}`)
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
        <Button
          size="sm"
          variant={notesPanelOpen ? 'default' : 'outline'}
          onClick={toggleNotesPanel}
          title="Abrir o painel de notas do projeto"
        >
          <StickyNote className="h-4 w-4" />
          Notas{noteCount > 0 ? ` (${noteCount})` : ''}
        </Button>
        {/* Versões à esquerda do Exportar, como combinado */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setVersoes(true)}
          aria-label="Versões do projeto"
          title="Versões do projeto — checkpoints (restaurar abre uma cópia)"
        >
          <History className="h-4 w-4" />
        </Button>
        {/* Um "Exportar" só: dois botões lado a lado com o mesmo verbo obrigavam
            a ler o complemento para saber qual era qual, e apertavam a barra. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={working}>
              {working ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onClick={() => setExportarIa(true)}>
              <Sparkles className="h-4 w-4" />
              <span className="flex flex-col items-start">
                <span>Para IA</span>
                <span className="text-xs text-muted-foreground">
                  Texto com as marcações, para colar num chat
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleExport()} disabled={working}>
              <Download className="h-4 w-4" />
              <span className="flex flex-col items-start">
                <span>QDPX (REFI-QDA)</span>
                <span className="text-xs text-muted-foreground">
                  Abre no ATLAS.ti e no NVivo
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AiExportDialog open={exportarIa} onOpenChange={setExportarIa} />
      <VersionsDialog open={versoes} onOpenChange={setVersoes} />
    </div>
  )
}
