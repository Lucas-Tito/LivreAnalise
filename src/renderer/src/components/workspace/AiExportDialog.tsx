import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  FileDown,
  Info,
  Loader2,
  Terminal
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { useAppStore } from '@/stores/appStore'
import { cn } from '@/lib/utils'
import type { AiExportScope } from '@shared/aiExport'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ESCOPOS: {
  id: AiExportScope
  label: string
  explicacao: string
  exigeDocumento?: boolean
}[] = [
  {
    id: 'structure',
    label: 'Somente estrutura',
    explicacao:
      'Seus códigos, grupos e coleções, sem nenhum trecho de entrevista.'
  },
  {
    id: 'document',
    label: 'Documento',
    explicacao:
      'Apenas o documento aberto, com os trechos codificados marcados no texto.',
    exigeDocumento: true
  },
  {
    id: 'full',
    label: 'Completo',
    explicacao:
      'Todos os documentos do projeto, com as marcações e a estrutura. Pode ser grande demais para alguns chats.'
  }
]

export function AiExportDialog({ open, onOpenChange }: Props): JSX.Element {
  const currentDocument = useAppStore((s) => s.currentDocument)
  const [scope, setScope] = useState<AiExportScope>('structure')
  const [exportando, setExportando] = useState(false)
  const [salvoEm, setSalvoEm] = useState<string | null>(null)
  const [instrucoes, setInstrucoes] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [mostrarCli, setMostrarCli] = useState(false)
  const [mostrarArquivo, setMostrarArquivo] = useState(true)

  useEffect(() => {
    if (!open) {
      setSalvoEm(null)
      setCopiado(false)
      setMostrarCli(false)
      setMostrarArquivo(true)
    }
  }, [open])

  useEffect(() => {
    if (mostrarCli && !instrucoes) {
      window.api.aiExport.cliInstructions().then(setInstrucoes).catch(() => undefined)
    }
  }, [mostrarCli, instrucoes])

  const exportar = async (): Promise<void> => {
    setExportando(true)
    setSalvoEm(null)
    try {
      const resultado = await window.api.aiExport.export(
        scope,
        currentDocument?.id ?? null
      )
      if (resultado) setSalvoEm(resultado.path)
    } catch (e) {
      alert(`Erro ao exportar: ${(e as Error).message}`)
    } finally {
      setExportando(false)
    }
  }

  const copiar = async (): Promise<void> => {
    await navigator.clipboard.writeText(instrucoes)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Exportar para IA</DialogTitle>
        </DialogHeader>

        <div className="min-w-0">
          <button
            onClick={() => setMostrarArquivo((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent"
          >
            <FileDown className="h-4 w-4 shrink-0" />
            Gerar arquivo
            <span className="ml-auto text-xs text-muted-foreground">
              {mostrarArquivo ? 'ocultar' : 'mostrar'}
            </span>
          </button>

          {mostrarArquivo && (
          <div className="mt-2 space-y-2">
          <ul className="space-y-1">
            {ESCOPOS.map((opcao) => {
              const indisponivel = opcao.exigeDocumento && !currentDocument
              return (
                <li key={opcao.id} className="flex min-w-0 items-center gap-2">
                  {/* o title vai no span porque botao desabilitado nao dispara
                      evento de mouse no Chromium */}
                  <span
                    className="min-w-0 flex-1"
                    title={
                      indisponivel
                        ? 'Abra um documento para usar essa função.'
                        : undefined
                    }
                  >
                  <button
                    disabled={indisponivel}
                    onClick={() => setScope(opcao.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      scope === opcao.id
                        ? 'border-primary bg-accent'
                        : 'hover:bg-accent/50',
                      indisponivel && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span
                      className={cn(
                        'h-3 w-3 shrink-0 rounded-full border',
                        scope === opcao.id && 'border-primary bg-primary'
                      )}
                    />
                    <span className="truncate">{opcao.label}</span>
                  </button>
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <Info className="h-4 w-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 text-sm">
                      {opcao.explicacao}
                    </PopoverContent>
                  </Popover>
                </li>
              )
            })}
          </ul>

          <Button onClick={exportar} disabled={exportando} className="w-full">
            {exportando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exportar
          </Button>

          {salvoEm && (
            <p className="text-xs text-muted-foreground">
              Salvo em <code>{salvoEm}</code>
            </p>
          )}
          </div>
          )}
        </div>

        <div className="min-w-0 border-t pt-3">
          <button
            onClick={() => setMostrarCli((v) => !v)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors hover:bg-accent"
          >
            <Terminal className="h-4 w-4 shrink-0" />
            Avançado — IA por CLI
            <span className="ml-auto text-xs text-muted-foreground">
              {mostrarCli ? 'ocultar' : 'mostrar'}
            </span>
          </button>

          {mostrarCli && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">
                Uma IA de terminal pode ler o projeto direto, sem exportar arquivo. O
                acesso é somente-leitura: o banco é aberto em modo readonly, então
                escrever é recusado pelo próprio driver. Copie as instruções abaixo e
                cole na sua IA.
              </p>
              <pre className="max-h-40 w-full min-w-0 overflow-auto whitespace-pre rounded-md border bg-muted/40 p-2 text-[11px] leading-4">
                {instrucoes || 'Carregando...'}
              </pre>
              <Button size="sm" variant="secondary" onClick={copiar} disabled={!instrucoes}>
                {copiado ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copiado ? 'Copiado' : 'Copiar instruções'}
              </Button>
            </div>
          )}
        </div>
        <p className="min-w-0 border-t pt-3 text-xs text-muted-foreground">
          Ao enviar o material para uma IA, você pode estar quebrando o
          consentimento dos participantes.
        </p>
      </DialogContent>
    </Dialog>
  )
}
