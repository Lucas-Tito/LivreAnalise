import { type JSX, useEffect, useRef, useState } from 'react'
import { mensagemDeErro } from '@/lib/erros'
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
  { id: 'pt', label: 'Português' },
  { id: 'en', label: 'Inglês' },
  { id: 'es', label: 'Espanhol' },
  { id: '', label: 'Detectar automaticamente' }
]

type Stage =
  | { kind: 'idle' }
  | { kind: 'checking' }
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
  const [checkedBinaryPath, setCheckedBinaryPath] = useState<string | null>(null)
  const envRequest = useRef(0)
  const [advanced, setAdvanced] = useState(false)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [segments, setSegments] = useState<TranscriptionSegment[]>([])
  const [recheckingModels, setRecheckingModels] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const operation = useRef(0)

  const cancelOperation = async (): Promise<void> => {
    const request = ++operation.current
    try {
      await window.api.transcription.cancel()
      if (request === operation.current) {
        setStage({ kind: 'idle' })
        setSegments([])
      }
    } catch (e) {
      if (request === operation.current) showFailure(e)
    }
  }

  const refreshEnv = async (): Promise<void> => {
    const request = ++envRequest.current
    const [nextEnv, nextModels] = await Promise.all([
      window.api.transcription.env(binaryPath || null),
      window.api.transcription.models()
    ])
    if (request === envRequest.current) {
      setEnv(nextEnv)
      setCheckedBinaryPath(binaryPath)
    }
    setModels(nextModels)
    setModelId((current) => current || nextEnv.defaultModelId)
  }

  useEffect(() => {
    void refreshEnv().catch((e) => setStage({ kind: 'error', message: mensagemDeErro(e) }))
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
        setRecheckingModels(true)
        void window.api.transcription.models()
          .then(setModels)
          .catch(() => undefined)
          .finally(() => setRecheckingModels(false))
      } else if (event.kind === 'canceled') {
        setStage({ kind: 'idle' })
        setSegments([])
      }
    })
  }, [])

  useEffect(() => {
    let live = true
    const request = ++envRequest.current
    const timer = setTimeout(() => {
      void window.api.transcription.env(binaryPath || null).then((next) => {
        if (live && request === envRequest.current) {
          setEnv(next)
          setCheckedBinaryPath(binaryPath)
        }
      }).catch((e) => {
        if (live) setStage({ kind: 'error', message: mensagemDeErro(e) })
      })
    }, 250)
    return () => { live = false; clearTimeout(timer) }
  }, [binaryPath])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [segments.length])

  const selectedModel = models.find((m) => m.id === modelId)
  const busy =
    stage.kind === 'checking' || stage.kind === 'download' || stage.kind === 'preparing' || stage.kind === 'running'
  const locked = busy || stage.kind === 'confirm'

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
    setStage({ kind: 'checking' })
    try {
      const bytes = await window.api.transcription.modelSize(modelId)
      setStage({ kind: 'confirm', modelId, bytes })
    } catch (e) { showFailure(e) }
  }

  // O Electron prefixa o erro do main com "Error invoking remote method
  // 'transcription:...'": esse detalhe de IPC nao ajuda ninguem na tela.
  // O main serializa com toString(), entao sobra ainda o "Error:" original.
  const showFailure = (e: unknown): void => {
    setStage({ kind: 'error', message: mensagemDeErro(e) })
  }

  const runTranscription = async (selectedId = modelId): Promise<void> => {
    if (!mediaPath) return
    setSegments([])
    setStage({ kind: 'preparing', detail: 'iniciando' })
    try {
      await window.api.transcription.start({
        mediaPath,
        modelId: selectedId,
        language: language || null,
        binaryPath: binaryPath || null
      })
    } catch (e) {
      showFailure(e)
      void refreshEnv().catch(() => undefined)
    }
  }

  const start = async (): Promise<void> => {
    if (!selectedModel?.ready) return askForModel()
    await runTranscription()
  }

  const confirmDownload = async (): Promise<void> => {
    if (stage.kind !== 'confirm') return
    const request = ++operation.current
    const selectedId = stage.modelId
    setStage({ kind: 'download', what: 'modelo', received: 0, total: stage.bytes })
    try {
      if (!(await window.api.transcription.downloadModel(selectedId))) return
      if (request !== operation.current) return
      await refreshEnv()
      if (request !== operation.current) return
      await runTranscription(selectedId)
    } catch (e) {
      if (request === operation.current) showFailure(e)
    }
  }

  // Transcrever precisa de duas peças: o programa (poucos MB) e o modelo
  // (centenas de MB). O aviso baixava só o programa, terminava rápido e o modelo
  // era pedido depois, o que parecia um download que não tinha funcionado (#42).
  // Agora o mesmo botão emenda o modelo escolhido, se ele ainda não existir.
  const downloadBinary = async (): Promise<void> => {
    const request = ++operation.current
    setStage({ kind: 'download', what: 'programa', received: 0, total: 0 })
    try {
      if (!(await window.api.transcription.downloadBinary())) return
      if (request !== operation.current) return
      if (selectedModel && !selectedModel.ready) {
        if (!(await window.api.transcription.downloadModel(modelId))) return
        if (request !== operation.current) return
      }
      await refreshEnv()
      if (request !== operation.current) return
      setStage({ kind: 'idle' })
    } catch (e) {
      if (request === operation.current) showFailure(e)
    }
  }

  const faltaModelo = selectedModel != null && !selectedModel.ready

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

      {models.length === 0 && <p role="status" className="text-sm text-muted-foreground">Verificando os modelos locais…</p>}

      {env && !env.ffmpeg && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          O ffmpeg embutido não foi localizado e não existe ffmpeg no sistema. Sem ele
          não é possível extrair o áudio.
        </p>
      )}

      {env && !env.binaryPath && (
        <div className="rounded-md border bg-card p-3 text-sm">
          <p className="mb-2">
            {env.canDownloadBinary && faltaModelo ? (
              <>
                Para transcrever são dois downloads, feitos uma vez só: o programa de
                transcrição (whisper.cpp, poucos MB) e o modelo{' '}
                <strong>{selectedModel.label}</strong> (
                {formatBytes(selectedModel.approxBytes)}).
              </>
            ) : (
              'O programa de transcrição (whisper.cpp) não foi encontrado.'
            )}
          </p>
          {env.canDownloadBinary ? (
            <Button size="sm" variant="secondary" onClick={downloadBinary} disabled={locked}>
              <Download className="h-4 w-4" />{' '}
              {faltaModelo ? 'Baixar tudo' : 'Baixar o programa'}
            </Button>
          ) : (
            <p className="text-muted-foreground">
              Neste sistema não há download pronto. Instale o whisper-cli e informe o
              caminho em Avançado.
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => void pickFile().catch(showFailure)} disabled={locked}>
            <FileAudio className="h-4 w-4" /> Escolher arquivo
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {mediaPath ?? 'Nenhum áudio ou vídeo selecionado'}
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
          Avançado
        </button>

        {advanced && (
          <div className="mt-3 space-y-3 border-t pt-3">
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Modelo</span>
              <select
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                disabled={locked}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} ({formatBytes(model.approxBytes)}
                    {model.ready ? ', baixado' : ''})
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
                disabled={locked}
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
                disabled={locked}
              />
            </label>
            {binaryPath && checkedBinaryPath === binaryPath && !env?.binaryPath && (
              <p role="alert" className="text-sm text-destructive">O caminho informado não é um arquivo executável acessível.</p>
            )}
          </div>
        )}
      </div>

      {stage.kind === 'checking' && <p role="status" className="text-sm text-muted-foreground">Consultando o tamanho do modelo…</p>}

      {stage.kind === 'confirm' && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm">
            O modelo <strong>{selectedModel?.label}</strong> ainda não está no seu
            computador. Baixar agora? São <strong>{formatBytes(stage.bytes)}</strong>,
            uma vez só — depois ele fica salvo.
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
          onCancel={() => void cancelOperation()}
        />
      )}

      {stage.kind === 'preparing' && (
        <ProgressCard
          title="Preparando"
          detail={stage.detail ?? 'convertendo o áudio'}
          fraction={null}
          onCancel={() => void cancelOperation()}
        />
      )}

      {stage.kind === 'running' && (
        <ProgressCard
          title="Transcrevendo"
          detail={
            lastSegment
              ? `${formatDuration(lastSegment.end)} de áudio processado`
              : 'iniciando'
          }
          fraction={stage.progress}
          onCancel={() => void cancelOperation()}
        />
      )}

      {stage.kind === 'done' && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Transcrição concluída</p>
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
        <Button onClick={start} disabled={recheckingModels || !mediaPath || !selectedModel || !env?.ffmpeg || !env?.binaryPath || checkedBinaryPath !== binaryPath}>
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
