import { expect, it } from 'vitest'
import { executableArchitecture } from '../scripts/verify-ffmpeg.mjs'

it('distinguishes Intel and ARM Mach-O binaries when cross-packaging macOS', () => {
  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(0x01000007, 4)
  expect(executableArchitecture(header)).toBe('x64')
  header.writeUInt32LE(0x0100000c, 4)
  expect(executableArchitecture(header)).toBe('arm64')
})

it('checks Linux and Windows binaries without executing them', () => {
  const elf = Buffer.alloc(64)
  elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1])
  elf.writeUInt16LE(62, 18)
  expect(executableArchitecture(elf)).toBe('x64')
  const pe = Buffer.alloc(128)
  pe.write('MZ')
  pe.writeUInt32LE(80, 60)
  pe.writeUInt32LE(0x00004550, 80)
  pe.writeUInt16LE(0xaa64, 84)
  expect(executableArchitecture(pe)).toBe('arm64')
})
