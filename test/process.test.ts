import { expect, it } from 'vitest'
import { runProcess } from '../src/main/services/process'
import { createTranscriptStream } from '../src/main/services/transcript'

it('decodes split UTF-8 bytes and flushes the final transcript line without newline', async () => {
  const segments: string[] = []
  const stream = createTranscriptStream((segment) => segments.push(segment.text))
  const text = '[00:00:00.000 --> 00:00:01.000] ação'
  const result = await runProcess(process.execPath, ['-e', `
    const b = Buffer.from(${JSON.stringify(text)});
    const at = b.indexOf(0xc3) + 1;
    process.stdout.write(b.subarray(0, at));
    setTimeout(() => process.stdout.write(b.subarray(at)), 30);
  `], { onStdout: stream.push })
  stream.end()
  expect(result.code).toBe(0)
  expect(segments).toEqual(['ação'])
})

it('aborts an asynchronous subprocess without blocking the event loop', async () => {
  const controller = new AbortController()
  const pending = runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal })
  setTimeout(() => controller.abort(), 30)
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})

it('bounds stderr while retaining the end of an error log', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stderr.write("x".repeat(100000) + "fim")'])
  expect(result.stderr.length).toBeLessThanOrEqual(16384)
  expect(result.stderr.endsWith('fim')).toBe(true)
})
