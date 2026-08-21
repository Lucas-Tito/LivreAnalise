import { describe, expect, it } from 'vitest'
import { parseFfmpegDuration } from '../src/main/services/ffmpeg'

// O ffmpeg-static nao traz ffprobe, entao a duracao sai do stderr do ffmpeg.
// Os trechos abaixo sao saida real do ffmpeg 7.0.2.
describe('parseFfmpegDuration', () => {
  it('reads the duration of a wav', () => {
    const stderr = `Input #0, wav, from 'jfk.wav':
  Duration: 00:00:11.00, bitrate: 256 kb/s
  Stream #0:0: Audio: pcm_s16le ([1][0][0][0] / 0x0001), 16000 Hz, 1 channels, s16, 256 kb/s`
    expect(parseFfmpegDuration(stderr)).toBeCloseTo(11, 3)
  })

  it('reads hours, minutes and hundredths', () => {
    expect(parseFfmpegDuration('  Duration: 01:23:45.67, start: 0.000000')).toBeCloseTo(
      5025.67,
      2
    )
  })

  it('returns null when the duration is unknown', () => {
    expect(parseFfmpegDuration('  Duration: N/A, bitrate: N/A')).toBeNull()
  })

  it('returns null for output with no duration line', () => {
    expect(parseFfmpegDuration('ffmpeg version 7.0.2-static')).toBeNull()
  })
})
