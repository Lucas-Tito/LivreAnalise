import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { mensagemDeErro } from './erros'
import { createNameSaver } from './nameAutosave'

interface Options {
  initialName: string
  write: (name: string, historyGroup: string) => Promise<void>
  onClose: () => void
  // Renomeação em linha segue editores comuns: Enter/blur confirma, Esc cancela.
  autosave?: boolean
}

// O componente que usa este hook deve ser montado por sessão/alvo. Um refresh
// da lista nunca pode reiniciar o rascunho ou o undo nativo do campo de texto.
export function useNameEditor({ initialName, write, onClose, autosave = true }: Options) {
  const [name, setName] = useState(initialName)
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [error, setError] = useState<string | null>(null)
  const [historyGroup] = useState(() => crypto.randomUUID())
  const [saver] = useState(() => createNameSaver(initialName, (value) => write(value, historyGroup)))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const leavingRef = useRef<Promise<boolean> | null>(null)

  const save = async (): Promise<void> => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setStatus('saving')
    try {
      await saver.flush()
      window.api.app.setNameDirty(false)
      setStatus('saved')
      setError(null)
    } catch (err) {
      setStatus('error')
      setError(mensagemDeErro(err, 'Não foi possível salvar o nome.'))
      throw err
    }
  }
  const saveRef = useRef(save)
  saveRef.current = save

  const leave = useCallback((): Promise<boolean> => {
    if (leavingRef.current) return leavingRef.current
    leavingRef.current = (async () => {
      try {
        await saveRef.current()
        closeRef.current()
        return true
      } catch {
        return false
      }
    })().finally(() => { leavingRef.current = null })
    return leavingRef.current
  }, [])

  useEffect(() => {
    useAppStore.getState().registerSairDaRenomeacao(leave)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (useAppStore.getState().sairDaRenomeacao === leave) {
        useAppStore.getState().registerSairDaRenomeacao(null)
        window.api.app.setNameDirty(false)
      }
    }
  }, [leave])

  const change = (value: string): void => {
    setName(value)
    saver.change(value)
    window.api.app.setNameDirty(true)
    setStatus('dirty')
    setError(value.trim() ? null : 'O nome não pode ficar vazio.')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (autosave && value.trim()) {
      timerRef.current = setTimeout(() => void saveRef.current().catch(() => undefined), 800)
    }
  }

  const cancel = async (): Promise<boolean> => {
    // Também restaura o original se um blur já havia iniciado uma gravação.
    change(initialName)
    return leave()
  }

  return { name, status, error, change, save, leave, cancel }
}
