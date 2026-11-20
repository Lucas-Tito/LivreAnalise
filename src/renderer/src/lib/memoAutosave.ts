import { createNoteSaver } from './noteAutosave'

type Saver = ReturnType<typeof createNoteSaver>
const pending = new Map<string, Saver>()

export function memoSaver(key: string, initial: string, write: (body: string) => Promise<void>) {
  const saver = pending.get(key) ?? createNoteSaver({ title: '', body: initial }, async (draft) => {
    await write(draft.body)
    return draft
  })
  return {
    read: () => saver.read().body,
    isPending: () => pending.has(key),
    change(body: string) {
      saver.change({ title: '', body })
      pending.set(key, saver)
      window.api.app.setMemoDirty?.(true)
    },
    discard() {
      if (pending.get(key) === saver) pending.delete(key)
      window.api.app.setMemoDirty?.(pending.size > 0)
    },
    flush: () => flushMemo(key, saver)
  }
}

async function flushMemo(key: string, saver: Saver): Promise<void> {
  if (pending.get(key) !== saver) return
  await saver.flush()
  if (pending.get(key) === saver) pending.delete(key)
  window.api.app.setMemoDirty?.(pending.size > 0)
}

export async function flushPendingMemos(): Promise<void> {
  for (const [key, saver] of pending) await flushMemo(key, saver)
}
