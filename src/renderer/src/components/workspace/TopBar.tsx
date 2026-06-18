import { useState } from 'react'
import { BookText, Download, Upload, FolderOpen, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'

export function TopBar(): JSX.Element {
  const project = useAppStore((s) => s.project)
  const closeProject = useAppStore((s) => s.closeProject)
  const refreshDocuments = useAppStore((s) => s.refreshDocuments)
  const refreshCodes = useAppStore((s) => s.refreshCodes)
  const refreshGroups = useAppStore((s) => s.refreshGroups)
  const [working, setWorking] = useState<string | null>(null)

  const handleExport = async (): Promise<void> => {
    setWorking('export')
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
      setWorking(null)
    }
  }

  const handleImport = async (): Promise<void> => {
    if (
      !confirm(
        'Importar um .qdpx adiciona os dados ao projeto atual. Deseja continuar?'
      )
    ) {
      return
    }
    setWorking('import')
    try {
      const report = await window.api.qdpx.import()
      if (report) {
        await Promise.all([refreshDocuments(), refreshCodes(), refreshGroups()])
        const skipped =
          report.skipped.length > 0
            ? `\n\nIgnorado (nao suportado): ${report.skipped.join(', ')}`
            : ''
        alert(
          `Importacao concluida:\n${report.documents} documentos, ${report.codes} codigos, ${report.groups} grupos, ${report.codings} codificacoes.${skipped}`
        )
      }
    } catch (e) {
      alert(`Erro ao importar: ${(e as Error).message}`)
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
      <div className="flex items-center gap-2">
        <BookText className="h-5 w-5 text-primary" />
        <span className="font-semibold">LivreAnalise</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm">{project?.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleImport}
          disabled={working !== null}
        >
          {working === 'import' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Importar QDPX
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={working !== null}
        >
          {working === 'export' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Exportar QDPX
        </Button>
        <Button size="sm" variant="ghost" onClick={closeProject}>
          <FolderOpen className="h-4 w-4" /> Trocar projeto
        </Button>
        <ThemeToggle />
      </div>
    </div>
  )
}
