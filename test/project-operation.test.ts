import { expect, it } from 'vitest'
import { withProjectOperation } from '../src/main/services/projectOperation'

it('rejects overlapping transitions and releases the guard after failure', async () => {
  let release!: () => void
  const pending = withProjectOperation(() => new Promise<void>((resolve) => { release = resolve }))
  await expect(withProjectOperation(async () => undefined)).rejects.toThrow('andamento')
  release()
  await pending
  await expect(withProjectOperation(async () => { throw new Error('falha') })).rejects.toThrow('falha')
  await expect(withProjectOperation(async () => 1)).resolves.toBe(1)
})
