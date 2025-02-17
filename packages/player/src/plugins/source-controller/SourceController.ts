import {
  Events as ClapprEvents,
  CorePlugin,
  type Core as ClapprCore,
} from '@clappr/core'
import {
  type PlaybackError,
  PlaybackErrorCode,
} from '../..//playback.types'
import {
  type PlayerMediaSourceDesc,
} from '../..//types'
import { trace } from '@gcorevideo/utils'

import { CLAPPR_VERSION } from '../build'

const T = 'plugins.source_controller'

const INITIAL_RETRY_DELAY = 1000

const MAX_RETRY_DELAY = 5000

const RETRY_DELAY_BLUR = 500

const VERSION = '0.0.1'

type SyncFn = (cb: () => void) => void

function noSync(cb: () => void) {
  queueMicrotask(cb)
}

/**
 * This plugin is responsible for managing the automatic failover between sources.
 * @beta
 * @remarks
 * Have a look at the {@link https://miro.com/app/board/uXjVLiN15tY=/?share_link_id=390327585787 | source failover diagram} for the details
 * on how sources ordering and selection works.
 *
 * This plugin does not expose any public methods apart from required by the Clappr plugin interface.
 * It is supposed to work autonomously.
 *
 * @example
 * ```ts
 * import { SourceController } from '@gcorevideo/player'
 * 
 * Player.registerPlugin(SourceController)
 * ```
 */
export class SourceController extends CorePlugin {
  /*
   * The Logic itself is quite simple:
   * * Here is the short diagram:
   *
   * sources_list:  
   *       - a.mpd  |    +--------------------+
   *       - b.m3u8 |--->|         init       |
   *       - ...    |    |--------------------|
   *                     | current_source = 0 |
   *                     +--------------------+
   *                            |
   *                            |  source = a.mpd
   *                            |  playback = dash.js
   *                            v
   *                      +------------------+
   *                  +-->|   load source    |
   *                  |   +---------|--------+
   *                  |             v
   *                  |   +------------------+
   *                  |   |       play       |
   *                  |   +---------|--------+
   *                  |             |
   *                  |             v
   *                  |   +-----------------------+
   *                  |   |  on playback_error    |
   *                  |   |-----------------------|
   *                  |   | current_source =      |
   *                  |   |  (current_source + 1) |
   *                  |   |  % len sources_list   |
   *                  |   |                       |
   *                  |   | delay 1..3s           |
   *                  |   +---------------|-------+
   *                  |                   |
   *                  |   source=b.m3u8   |
   *                  |   playback=hls.js |
   *                  +-------------------+
   *
   */
  private sourcesList: PlayerMediaSourceDesc[] = []

  private currentSourceIndex = 0

  private sourcesDelay: Record<string, number> = {}

  private active = false

  private sync: SyncFn = noSync

  get name() {
    return 'source_controller'
  }

  get supportedVersion() {
    return { min: CLAPPR_VERSION }
  }

  constructor(core: ClapprCore) {
    super(core)
    this.sourcesList = this.core.options.sources
    if (this.core.options.source !== undefined) {
      // prevent Clappr from loading all sources simultaneously
      this.core.options.sources = [this.core.options.source]
    } else {
      this.core.options.sources = this.core.options.sources.slice(0, 1)
    }
  }

  /**
   * @internal
   */
  override bindEvents() {
    super.bindEvents()

    this.listenTo(this.core, ClapprEvents.CORE_READY, () => this.onReady())
  }

  private onReady() {
    trace(`${T} onReady`, {
      retrying: this.active,
    })
    const spinner = this.core.activeContainer?.getPlugin('spinner')
    if (spinner) {
      this.sync = (cb: () => void) => {
        spinner.once('spinner:sync', cb)
      }
    } else {
      this.sync = noSync
    }
    this.bindContainerEventListeners()
    if (this.active) {
      this.core.activeContainer?.getPlugin('poster_custom')?.disable()
      spinner?.show()
    }
  }

  private bindContainerEventListeners() {
    trace(`${T} bindContainerEventListeners`, {
      activePlayback: this.core.activePlayback?.name,
    })
    this.core.activePlayback.on(
      ClapprEvents.PLAYBACK_ERROR,
      (error: PlaybackError) => {
        trace(`${T} on PLAYBACK_ERROR`, {
          error: {
            code: error?.code,
            description: error?.description,
            level: error?.level,
          },
          retrying: this.active,
          currentSource: this.sourcesList[this.currentSourceIndex],
        })
        switch (error.code) {
          case PlaybackErrorCode.MediaSourceUnavailable:
            this.core.activeContainer?.getPlugin('poster_custom')?.disable()
            this.retryPlayback()
            break
          // TODO handle other errors
          default:
            break
        }
      },
    )
    this.core.activePlayback.on(ClapprEvents.PLAYBACK_PLAY, () => {
      trace(`${T} on PLAYBACK_PLAY`, {
        currentSource: this.sourcesList[this.currentSourceIndex],
        retrying: this.active,
      })
      if (this.active) {
        this.reset()
        // TODO make poster reset its state on enable
        this.core.activeContainer?.getPlugin('poster_custom')?.enable()
        this.core.activeContainer?.getPlugin('spinner')?.hide()
      }
    })
  }

  private reset() {
    this.active = false
    this.sourcesDelay = {}
  }

  private retryPlayback() {
    trace(`${T} retryPlayback enter`, {
      currentSourceIndex: this.currentSourceIndex,
      currentSource: this.sourcesList[this.currentSourceIndex],
      sourcesList: this.sourcesList,
    })
    this.active = true
    this.getNextMediaSource().then((nextSource: PlayerMediaSourceDesc) => {
      trace(`${T} retryPlayback syncing...`, {
        nextSource,
      })
      const rnd = RETRY_DELAY_BLUR * Math.random()
      this.sync(() => {
        trace(`${T} retryPlayback loading...`, {
          nextSource,
        })
        this.core.load(nextSource.source, nextSource.mimeType)
        trace(`${T} retryPlayback loaded`, {
          nextSource,
        })
        setTimeout(() => {
          // this.core.activePlayback.consent()
          this.core.activePlayback.play()
          trace(`${T} retryPlayback playing`)
        }, rnd)
      })
    })
  }

  private getNextMediaSource(): Promise<PlayerMediaSourceDesc> {
    return new Promise((resolve) => {
      this.sourcesDelay[this.currentSourceIndex] = Math.min(
        MAX_RETRY_DELAY,
        (this.sourcesDelay[this.currentSourceIndex] || INITIAL_RETRY_DELAY) * 2,
      )
      this.currentSourceIndex =
        (this.currentSourceIndex + 1) % this.sourcesList.length
      const delay =
        this.sourcesDelay[this.currentSourceIndex] || INITIAL_RETRY_DELAY
      const s = this.sourcesList[this.currentSourceIndex]
      setTimeout(() => resolve(s), delay)
    })
  }

  static get version() {
    return VERSION
  }
}
