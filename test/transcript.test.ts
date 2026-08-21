import { describe, expect, it } from 'vitest'
import {
  formatTimestamp,
  formatTranscript,
  formatTranscriptLine,
  parseWhisperLine,
  progressFromSegment,
  transcriptPathFor
} from '../src/main/services/transcript'

describe('formatTimestamp', () => {
  it('formats like transcrever.py does', () => {
    expect(formatTimestamp(0)).toBe('00:00:00.000')
    expect(formatTimestamp(9.5)).toBe('00:00:09.500')
    expect(formatTimestamp(65.001)).toBe('00:01:05.001')
    expect(formatTimestamp(3723.456)).toBe('01:02:03.456')
  })

  it('keeps two digits in the seconds field', () => {
    // o padStart existe por isso: 1.5s nao pode virar "00:00:1.500"
    expect(formatTimestamp(1.5)).toBe('00:00:01.500')
  })

  it('never emits a negative timestamp', () => {
    expect(formatTimestamp(-3)).toBe('00:00:00.000')
  })
})

describe('parseWhisperLine', () => {
  it('parses the whisper-cli segment line', () => {
    expect(parseWhisperLine('[00:00:00.000 --> 00:00:04.000]   Bom dia a todos')).toEqual({
      start: 0,
      end: 4,
      text: 'Bom dia a todos'
    })
  })

  it('parses hours and milliseconds', () => {
    const seg = parseWhisperLine('[01:02:03.456 --> 01:02:09.500] fala longa')
    expect(seg?.start).toBeCloseTo(3723.456, 3)
    expect(seg?.end).toBeCloseTo(3729.5, 3)
  })

  it('accepts the comma decimal separator', () => {
    expect(parseWhisperLine('[00:00:01,500 --> 00:00:02,000] oi')?.start).toBeCloseTo(1.5, 3)
  })

  // linha copiada verbatim da saida do whisper-cli 1.9.3 rodando o ggml-tiny
  it('parses the real output of whisper-cli', () => {
    expect(
      parseWhisperLine(
        '[00:00:00.000 --> 00:00:10.500]   And so, my fellow Americans, ask not what your country can do for you.'
      )
    ).toEqual({
      start: 0,
      end: 10.5,
      text: 'And so, my fellow Americans, ask not what your country can do for you.'
    })
  })

  it('ignores log lines from the binary', () => {
    expect(parseWhisperLine('whisper_init_from_file_with_params_no_state: loading model')).toBeNull()
    expect(parseWhisperLine('system_info: n_threads = 4')).toBeNull()
    expect(parseWhisperLine('')).toBeNull()
  })

  it('ignores a segment with no speech in it', () => {
    expect(parseWhisperLine('[00:00:00.000 --> 00:00:30.000]  ')).toBeNull()
  })
})

describe('formatTranscript', () => {
  it('writes one line per segment, like the python output', () => {
    const out = formatTranscript([
      { start: 0, end: 4, text: 'primeira fala' },
      { start: 4, end: 9.25, text: 'segunda fala' }
    ])
    expect(out).toBe(
      '[00:00:00.000 -> 00:00:04.000] primeira fala\n' +
        '[00:00:04.000 -> 00:00:09.250] segunda fala\n'
    )
  })

  it('returns an empty string when nothing was transcribed', () => {
    expect(formatTranscript([])).toBe('')
  })

  it('round-trips a parsed line back to the same text', () => {
    const seg = parseWhisperLine('[00:00:01.000 --> 00:00:02.500] uma fala')
    expect(formatTranscriptLine(seg!)).toBe('[00:00:01.000 -> 00:00:02.500] uma fala')
  })
})

describe('progressFromSegment', () => {
  it('reports the fraction of audio already processed', () => {
    expect(progressFromSegment(30, 120)).toBe(0.25)
  })

  it('never passes 100% when the segment overshoots the duration', () => {
    expect(progressFromSegment(130, 120)).toBe(1)
  })

  it('reports zero when the duration is unknown', () => {
    expect(progressFromSegment(30, 0)).toBe(0)
  })
})

describe('transcriptPathFor', () => {
  it('puts the txt next to the media file', () => {
    expect(transcriptPathFor('/home/lucas/entrevista 2.mp4')).toBe(
      '/home/lucas/entrevista 2_transcricao.txt'
    )
  })

  it('handles a file with no extension', () => {
    expect(transcriptPathFor('/home/lucas/audio')).toBe('/home/lucas/audio_transcricao.txt')
  })

  // um ponto no nome do diretorio nao e a extensao do arquivo
  it('does not mistake a dot in the directory for an extension', () => {
    expect(transcriptPathFor('/home/lucas/pasta.v2/audio')).toBe(
      '/home/lucas/pasta.v2/audio_transcricao.txt'
    )
  })
})
