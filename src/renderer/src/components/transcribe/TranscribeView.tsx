import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  AudioLines,
  ChevronDown,
  ChevronRight,
  Download,
  FileAudio,
  Loader2,
  StopCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatBytes, formatDuration } from '@/lib/utils'
import type {
  TranscriptionEnv,
  TranscriptionEvent,
  TranscriptionModel,
  TranscriptionSegment
} from '@shared/types'

const LANGUAGES = [
  { id: 'pt', label: 'Portugues' },
  { id: 'en', label: 'Ingles' },
  { id: 'es', label: 'Espanhol' },
  { id: '', label: 'Detectar automaticamente' }
]

type Stage =
  | { kind: 'idle' }
  | { kind: 'download'; what: 'modelo' | 'programa'; received: number; total: number }
  | { kind: 'confirm'; modelId: string; bytes: number }
  | { kind: 'preparing'; detail?: string }
  | { kind: 'running'; progress: number }
  | { kind: 'done'; outputPath: string; segments: number }
  | { kind: 'error'; message: string }

interface Props {
  onBack: () => void
}

export function TranscribeView({ onBack }: Props): JSX.Element {
  const [env, setEnv] = useState<TranscriptionEnv | null>(null)
  const [models, setModels] = useState<TranscriptionModel[]>([])
  const [mediaPath, setMediaPath] = useState<string | null>(null)
  const [modelId, setModelId] = useState('medium-q5_0')
  const [language, setLanguage] = useState('pt')
  const [binaryPath, setBinaryPath] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [segments, setSegments] = useState<TranscriptionSegment[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  const refreshEnv = async (): Promise<void> => {
    const [nextEnv, nextModels] = await Promise.all([
      window.api.transcription.env(),
      window.api.transcription.models()
    ])
    setEnv(nextEnv)
    setModels(nextModels)
    setModelId((current) => current || nextEnv.defaultModelId)
  }

  useEffect(() => {
    refreshEnv()
    return window.api.transcription.onEvent((event: TranscriptionEvent) => {
      if (event.kind === 'download') {
        setStage({
          kind: 'download',
          what: event.what,
          received: event.receivedBytes,
          total: event.totalBytes
        })
      } else if (event.kind === 'phase') {
        if (event.phase === 'preparando') setStage({ kind: 'preparing', detail: event.detail })
        else setStage({ kind: 'running', progress: 0 })
      } else if (event.kind === 'segment') {
        setSegments((prev) => [...prev, event.segment])
        setStage({ kind: 'running', progress: event.progress })
      } else if (event.kind === 'done') {
        setStage({ kind: 'done', outputPath: event.outputPath, segments: event.segments })
      } else if (event.kind === 'error') {
        setStage({ kind: 'error', message: event.message })
      } else if (event.kind === 'canceled') {
        setStage({ kind: 'idle' })
        setSegments([])
      }
    })
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [segments.length])

  const selectedModel = models.find((m) => m.id === modelId)
  const busy =
    stage.kind === 'download' || stage.kind === 'preparing' || stage.kind === 'running'

  const pickFile = async (): Promise<void> => {
    const path = await window.api.transcription.pickMedia()
    if (path) {
      setMediaPath(path)
      setSegments([])
      setStage({ kind: 'idle' })
    }
  }

  // Pergunta antes de baixar, com o tamanho real vindo do servidor.
  const askForModel = async (): Promise<void> => {
    const bytes = await window.api.transcription.modelSize(modelId)
    setStage({ kind: 'confirm', modelId, bytes })
  }

  const runTranscription = async (): Promise<void> => {
    if (!mediaPath) return
    setSegments([])
    try {
      await window.api.transcription.start({
        mediaPath,
        modelId,
        language: language || null,
        binaryPath: binaryPath || null
      })
    } catch (e) {
      setStage({ kind: 'error', message: (e as Error).message })
    }
  }

  const start = async (): Promise<void> => {
    if (!selectedModel?.ready) return askForModel()
    await runTranscription()
  }

  const confirmDownload = async (): Promise<void> => {
    try {
      await window.api.transcription.downloadModel(modelId)
      await refreshEnv()
      await runTranscription()
    } catch (e) {
      setStage({ kind: 'error', message: (e as Error).message })
    }
  }

  const downloadBinary = async (): Promise<void> => {
    try {
      await window.api.transcription.downloadBinary()
      await refreshEnv()
      setStage({ kind: 'idle' })
    } catch (e) {
      setStage({ kind: 'error', message: (e as Error).message })
    }
  }

  const lastSegment = segments[segments.length - 1]

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-auto p-8">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          <AudioLines className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Transcrever</h1>
        </div>
      </div>

      {env && !env.ffmpeg && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          O ffmpeg embutido nao foi localizado e nao existe ffmpeg no sistema. Sem ele
          nao e possivel extrair o audio.
        </p>
      )}

      {env && !env.binaryPath && (
        <div className="rounded-md border bg-card p-3 text-sm">
          <p className="mb-2">
            O programa de transcricao (whisper.cpp) nao foi encontrado.
          </p>
          {env.canDownloadBinary ? (
            <Button size="sm" variant="secondary" onClick={downloadBinary} disabled={busy}>
              <Download className="h-4 w-4" /> Baixar o programa
            </Button>
          ) : (
            <p className="text-muted-foreground">
              Neste sistema nao ha download pronto. Instale o whisper-cli e informe o
              caminho em Avancado.
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={pickFile} disabled={busy}>
            <FileAudio className="h-4 w-4" /> Escolher arquivo
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {mediaPath ?? 'Nenhum audio ou video selecionado'}
          </span>
        </div>

        <button
          className="mt-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setAdvanced((v) => !v)}
        >
          {advanced ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Avancado
        </button>

        {advanced && (
          <div className="mt-3 space-y-3 border-t pt-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Modelo</span>
              <select
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={busy}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} — {formatBytes(model.approxBytes)}
                    {model.ready ? ' (baixado)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium">Idioma</span>
              <select
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={busy}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium">Caminho do whisper-cli</span>
              <Input
                value={binaryPath}
                placeholder={env?.binaryPath ?? '/usr/local/bin/whisper-cli'}
                onChange={(e) => setBinaryPath(e.target.value)}
                disabled={busy}
              />
            </label>
          </div>
        )}
      </div>

      {stage.kind === 'confirm' && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm">
            O modelo <strong>{selectedModel?.label}</strong> ainda nao esta no seu
            computador. Baixar agora? Sao <strong>{formatBytes(stage.bytes)}</strong>,
            uma vez so — depois ele fica salvo.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={confirmDownload}>
              <Download className="h-4 w-4" /> Baixar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStage({ kind: 'idle' })}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {stage.kind === 'download' && (
        <ProgressCard
          title={`Baixando o ${stage.what}`}
          detail={`${formatBytes(stage.received)} de ${formatBytes(stage.total)}`}
          fraction={stage.total > 0 ? stage.received / stage.total : 0}
          onCancel={() => window.api.transcription.cancel()}
        />
      )}

      {stage.kind === 'preparing' && (
        <ProgressCard
          title="Preparando"
          detail={stage.detail ?? 'convertendo o audio'}
          fraction={null}
          onCancel={() => window.api.transcription.cancel()}
        />
      )}

      {stage.kind === 'running' && (
        <ProgressCard
          title="Transcrevendo"
          detail={
            lastSegment
              ? `${formatDuration(lastSegment.end)} de audio processado`
              : 'iniciando'
          }
          fraction={stage.progress}
          onCancel={() => window.api.transcription.cancel()}
        />
      )}

      {stage.kind === 'done' && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Transcricao concluida</p>
          <p className="mt-1 text-muted-foreground">
            {stage.segments} trechos salvos em <code>{stage.outputPath}</code>
          </p>
          <p className="mt-2 text-muted-foreground">
            Importe esse arquivo como documento no seu projeto.
          </p>
        </div>
      )}

      {stage.kind === 'error' && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {stage.message}
        </p>
      )}

      {!busy && stage.kind !== 'confirm' && (
        <Button onClick={start} disabled={!mediaPath || !env?.ffmpeg || !env?.binaryPath}>
          <AudioLines className="h-4 w-4" /> Transcrever
        </Button>
      )}

      {segments.length > 0 && (
        <div
          ref={logRef}
          className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-6"
        >
          {segments.map((segment, index) => (
            <div key={index}>
              <span className="text-muted-foreground">
                [{formatDuration(segment.start)}]
              </span>{' '}
              {segment.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProgressCard({
  title,
  detail,
  fraction,
  onCancel
}: {
  title: string
  detail: string
  fraction: number | null
  onCancel: () => void
}): JSX.Element {
  const percent = fraction === null ? null : Math.round(fraction * 100)
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Loader2 className="h-4 w-4 animate-spin" /> {title}
          {percent !== null && <span className="tabular-nums">{percent}%</span>}
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <StopCircle className="h-4 w-4" /> Cancelar
        </Button>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{
            width: percent === null ? '100%' : `${percent}%`,
            opacity: percent === null ? 0.4 : 1
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
