import { Loader } from '@clappr/core'

import type {
  PlayerMediaSource,
  PlayerMediaSourceDesc,
  TransportPreference,
} from '../types'

// TODO rewrite using the Playback classes and canPlay static methods
export function buildMediaSourcesList(
  sources: PlayerMediaSourceDesc[],
  priorityTransport: TransportPreference = 'dash',
): PlayerMediaSourceDesc[] {
  const playbacks = Loader.registeredPlaybacks
  const [preferred, rest] = sources.reduce(
    ([preferred, rest]: [PlayerMediaSourceDesc[], PlayerMediaSourceDesc[]], item: PlayerMediaSourceDesc): [PlayerMediaSourceDesc[], PlayerMediaSourceDesc[]] => {
      for (const p of playbacks) {
        if (p.canPlay(item.source, item.mimeType)) {
          if (p.name === priorityTransport) {
            preferred.push(item)
          } else {
            rest.push(item)
          }
          break
        }
      }
      return [preferred, rest]
    },
    [[], []],
  )
  return preferred.concat(rest)
}

export function unwrapSource(s: PlayerMediaSource): string {
  return typeof s === 'string' ? s : s.source
}

export function wrapSource(s: PlayerMediaSource): PlayerMediaSourceDesc {
  return typeof s === 'string' ? { source: s, mimeType: guessMimeType(s) } : s
}

function guessMimeType(s: string): string | undefined {
  if (s.endsWith('.mpd')) {
    return 'application/dash+xml'
  }
  if (s.endsWith('.m3u8')) {
    // return 'application/vnd.apple.mpegurl'
    return 'application/x-mpegurl'
  }
}

export function isDashSource(source: string, mimeType?: string) {
  if (mimeType) {
    return mimeType === 'application/dash+xml' // TODO consider video/mp4
  }
  return source.endsWith('.mpd')
}

export function isHlsSource(source: string, mimeType?: string) {
  if (mimeType) {
    return ['application/vnd.apple.mpegurl', 'application/x-mpegurl'].includes(
      mimeType.toLowerCase(),
    )
  }
  return source.endsWith('.m3u8')
}
