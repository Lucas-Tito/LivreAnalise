import { useCallback, useRef, useState } from 'react'
import { mensagemDeErro } from './erros'

export function useAsyncAction(): {
  working: boolean
  error: string | null
  run: (action: () => Promise<unknown>) => Promise<void>
} {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const run = useCallback(async (action: () => Promise<unknown>): Promise<void> => {
    if (pending.current) return
    pending.current = true
    setWorking(true)
    setError(null)
    try { await action() } catch (e) { setError(mensagemDeErro(e, 'Não foi possível concluir a operação.')) }
    finally { pending.current = false; setWorking(false) }
  }, [])
  return { working, error, run }
}
