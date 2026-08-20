import { useState } from 'react'
import { BookText, Download, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'

export function TopBar(): JSX.Element {
  const project = useAppStore((s) => s.project)
  const closeProject = useAppStore((s) => s.closeProject)
  const [working, setWorking] = useState(false)

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
    </div>
  )
}
