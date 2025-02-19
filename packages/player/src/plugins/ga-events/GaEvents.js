// Clappr player is Copyright 2014 Globo.com Player authors. All rights reserved.

import { CorePlugin, Events, Playback, $ } from '@clappr/core';
import gaTrackingSnippet from './ga-tracking';

export class GaEvents extends CorePlugin {
  get name() {
    return 'ga_events';
  }

  constructor(core) {
    super(core);
    this._volumeTimer = null;
    this._doSendPlay = true;
    this.readPluginConfig(this.options.gaEventsPlugin);
    gaTrackingSnippet(this._gaCfg.name, this._gaCfg.debug, this._gaCfg.trace);
    this._ga('create', this._trackingId, this._createFieldsObject);
  }

  bindEvents() {
    const eventsToAlwaysBind = [
      { event: Events.CONTAINER_TIMEUPDATE, handler: this.onTimeUpdate },
      { event: Events.CONTAINER_PLAY, handler: this.onPlay },
      { event: Events.CONTAINER_SEEK, handler: (event) => this.onSeek(event) },
      { event: Events.CONTAINER_PAUSE, handler: this.onPause },
      { event: Events.CONTAINER_STOP, handler: this.onStop },
      { event: Events.CONTAINER_ENDED, handler: this.onEnded },
    ];

    const conditionalEvents = [
      { condition: 'ready', event: Events.CONTAINER_READY, handler: this.onReady },
      { condition: 'buffering', event: Events.CONTAINER_STATE_BUFFERING, handler: this.onBuffering },
      { condition: 'bufferfull', event: Events.CONTAINER_STATE_BUFFERFULL, handler: this.onBufferFull },
      { condition: 'loadedmetadata', event: Events.CONTAINER_LOADEDMETADATA, handler: this.onLoadedMetadata },
      { condition: 'volume', event: Events.CONTAINER_VOLUME, handler: (event) => this.onVolumeChanged(event) },
      { condition: 'fullscreen', event: Events.CONTAINER_FULLSCREEN, handler: this.onFullscreen },
      { condition: 'playbackstate', event: Events.CONTAINER_PLAYBACKSTATE, handler: this.onPlaybackChanged },
      { condition: 'highdefinitionupdate', event: Events.CONTAINER_HIGHDEFINITIONUPDATE, handler: this.onHD },
      { condition: 'playbackdvrstatechanged', event: Events.CONTAINER_PLAYBACKDVRSTATECHANGED, handler: this.onDVR },
      { condition: 'error', event: Events.CONTAINER_ERROR, handler: this.onError },
    ];

    this.listenTo(this.core.mediaControl, Events.MEDIACONTROL_CONTAINERCHANGED, this.containerChanged);
    this._container = this.core.activeContainer;
    if (this._container) {
      // Set resolved source as eventLabel if not defined in plugin configuration
      if (!this._label) {
        this._label = this._container.options.src;
      }

      eventsToAlwaysBind.forEach(({ event, handler }) => {
        this.listenTo(this._container, event, handler);
      });

      conditionalEvents.forEach(({ condition, event, handler }) => {
        if (this._hasEvent(condition)) {
          this.listenTo(this._container, event, handler);
        }
      });
    }
  }

  getExternalInterface() {
    // Expose player method only if tracker name is available
    if (this._trackerName) {
      return {
        gaEventsTracker: this.gaTracker
      };
    }

    return {};
  }

  containerChanged() {
    this.stopListening();
    this.bindEvents();
  }

  get _ga() {
    return window[window.GoogleAnalyticsObject];
  }

  gaTracker() {
    return this._ga.getByName && this._ga.getByName(this._trackerName);
  }

  gaEvent(category, action, label, value) {
    this._ga(this._send, 'event', category, action, label, value);
  }

  gaException(desc, isFatal=false) {
    this._ga(this._send, 'exception', {
      'exDescription': desc,
      'exFatal': isFatal
    });
  }

  readPluginConfig(cfg) {
    if (!cfg) {
      throw new Error(this.name + ' plugin config is missing');
    }
    if (!cfg.trackingId) {
      throw new Error(this.name + ' plugin "trackingId" required config parameter is missing');
    }

    this._gaCfg = cfg.gaCfg || { name: 'ga', debug: false, trace: false };
    this._trackingId = cfg.trackingId;
    this._createFieldsObject = cfg.createFieldsObject;
    this._trackerName = this._createFieldsObject && this._createFieldsObject.name;
    this._send = this._trackerName ? this._trackerName + '.send' : 'send';
    this._category = cfg.eventCategory || 'Video';
    this._label = cfg.eventLabel; // Otherwise filled in bindEvents()
    this._setValue = cfg.eventValueAuto === true;
    this._events = $.isArray(cfg.eventToTrack) && cfg.eventToTrack || this._defaultEvents;
    this._eventMap = $.isPlainObject(cfg.eventMapping) && cfg.eventMapping || this._defaultEventMap;
    this._gaPlayOnce = cfg.sendPlayOnce === true;
    this._gaEx = cfg.sendExceptions === true;
    this._gaExDesc = cfg.sendExceptionsMsg === true;

    // Add 'error' to tracked events if GA exceptions are enabled
    if (this._gaEx && !this._hasEvent('error')) {
      this._events.push('error');
    }

    this._gaPercent = $.isArray(cfg.progressPercent) && cfg.progressPercent || [];
    this._gaPercentCat = cfg.progressPercentCategory || this._category;
    this._gaPercentAct = $.isFunction(cfg.progressPercentAction) && cfg.progressPercentAction || function(i) {
      return 'progress_' + i + 'p';
    };
    this._processGaPercent = this._gaPercent.length > 0;
    this._gaSeconds = $.isArray(cfg.progressSeconds) && cfg.progressSeconds || [];
    this._gaSecondsCat = cfg.progressSecondsCategory || this._category;
    this._gaSecondsAct = $.isFunction(cfg.progressSecondsAction) && cfg.progressSecondsAction || function(i) {
      return 'progress_' + i + 's';
    };
    this._gaSecondsTimerStarted = false;
    this._processGaSeconds = this._gaSeconds.length > 0;
  }

  get _defaultEventMap() {
    return {
      'ready': 'ready',
      'buffering': 'buffering',
      'bufferfull': 'bufferfull',
      'loadedmetadata': 'loadedmetadata',
      'play': 'play',
      'seek': 'seek',
      'pause': 'pause',
      'stop': 'stop',
      'ended': 'ended',
      'volume': 'volume',
      'fullscreen': 'fullscreen',
      'error': 'error',
      'playbackstate': 'playbackstate',
      'highdefinitionupdate': 'highdefinitionupdate',
      'playbackdvrstatechanged': 'playbackdvrstatechanged'
    };
  }

  get _defaultEvents() {
    return [
      'play',
      'seek',
      'pause',
      'stop',
      'ended',
      'volume'
    ];
  }

  _hasEvent(e) {
    return this._events.indexOf(e) !== -1;
  }

  _action(e) {
    return this._eventMap[e];
  }

  _value(v) {
    if (this._setValue) {
      return v;
    }
  }

  get position() {
    return this.isLive ? 0 : this._position;
  }

  get duration() {
    return this.isLive ? 0 : this._container && this._container.getDuration();
  }

  get isLive() {
    return this._container.getPlaybackType() === Playback.LIVE;
  }

  get isPlaying() {
    return this._container.isPlaying();
  }

  trunc(v) {
    return parseInt(v, 10);
  }

  onTimeUpdate(o){
    this._position = o.current && this.trunc(o.current) || 0;

    if (this.isLive || !this.isPlaying) {
      return;
    }

    // Check for "seconds" progress event
    this._processGaSeconds && this.processGaSeconds(this._position);

    // Check for "percent" progress event
    this._processGaPercent && this.processGaPercent(this._position);
  }

  processGaSeconds(pos) {
    if (this._gaSecondsPrev !== pos && this._gaSeconds.indexOf(pos) !== -1) {
      this._gaSecondsPrev = pos;
      this.gaEvent(this._gaSecondsCat, this._gaSecondsAct(pos), this._label);
    }
  }

  processGaPercent(pos) {
    // FIXME: check if (duration > 0) ?
    const percent = this.trunc((pos * 100) / this.duration);

    $.each(this._gaPercent, (i, v) => {
      // Percentage value may never match expected value. To fix that, we compare to previous and current.
      // This introduce a small approximation, but this function is called multiples time per seconds.
      if (this._gaPercentPrev < v && percent >= v) {
        this.gaEvent(this._gaPercentCat, this._gaPercentAct(v), this._label);

        return false;
      }
    });
    this._gaPercentPrev = percent;
  }

  onReady() {
    this.gaEvent(this._category, this._action('ready'), this._label);
  }

  onBuffering() {
    this.gaEvent(this._category, this._action('buffering'), this._label);
  }

  onBufferFull() {
    this.gaEvent(this._category, this._action('bufferfull'), this._label);
  }

  onLoadedMetadata() {
    this.gaEvent(this._category, this._action('loadedmetadata'), this._label);
  }

  onPlay() {
    if (this._gaPlayOnce) {
      if (!this._doSendPlay) {
        return;
      }
      this._doSendPlay = false;
    }
    this.gaEvent(this._category, this._action('play'), this._label, this._value(this.position));

    // Start "seconds" progress event timer (if LIVE playback type)
    this.isLive && this._processGaSeconds && this._startGaSecondsTimer();
  }

  _startGaSecondsTimer() {
    if (this._gaSecondsTimerStarted) {
      return;
    }

    this._gaSecondsTimerStarted = true;
    this._gaSecondsElapsed = 0;
    this.processGaSeconds(this._gaSecondsElapsed);
    this._gaSecondsTimerId = setInterval(() => {
      this._gaSecondsElapsed++;
      this.processGaSeconds(this._gaSecondsElapsed);
    }, 1000);
  }

  _stopGaSecondsTimer() {
    clearInterval(this._gaSecondsTimerId);
    this._gaSecondsPrev = -1;
    this._gaSecondsTimerStarted = false;
  }

  onSeek(pos) {
    if (this._hasEvent('seek')) {
      this.gaEvent(this._category, this._action('seek'), this._label, this._value(this.trunc(pos)));
    }
    if (this._gaPlayOnce) {
      this._doSendPlay = true;
    }

    // Adjust previous "percent" event value
    if (!this.isLive && this._processGaPercent) {
      this._gaPercentPrev = this.trunc((this.trunc(pos) * 100) / this.duration) - 1;
    }

    // Stop "seconds" progress event timer (if LIVE playback type)
    this.isLive && this._processGaSeconds && this._stopGaSecondsTimer();
  }

  onPause() {
    if (this._hasEvent('pause')) {
      this.gaEvent(this._category, this._action('pause'), this._label, this._value(this.position));
    }
    if (this._gaPlayOnce) {
      this._doSendPlay = true;
    }

    // Stop "seconds" progress event timer (if LIVE playback type)
    this.isLive && this._processGaSeconds && this._stopGaSecondsTimer();
  }

  onStop() {
    if (this._hasEvent('stop')) {
      this.gaEvent(this._category, this._action('stop'), this._label, this._value(this.position));
    }
    if (this._gaPlayOnce) {
      this._doSendPlay = true;
    }

    // Stop "seconds" progress event timer (if LIVE playback type)
    this.isLive && this._processGaSeconds && this._stopGaSecondsTimer();
  }

  onEnded() {
    if (this._hasEvent('ended')) {
      this.gaEvent(this._category, this._action('ended'), this._label, this._value(this.position));
    }
    if (this._gaPlayOnce) {
      this._doSendPlay = true;
    }

    // Check for video ended progress events
    this._processGaSeconds && this.processGaSeconds(this.duration);
    this._processGaPercent && this.processGaPercent(this.duration);
  }

  onVolumeChanged(e) {
    // Rate limit to avoid HTTP hammering
    clearTimeout(this._volumeTimer);
    this._volumeTimer = setTimeout(() => {
      this.gaEvent(this._category, this._action('volume'), this._label, this._value(this.trunc(e)));
    }, 400);
  }

  onFullscreen() {
    this.gaEvent(this._category, this._action('fullscreen'), this._label);
  }

  onPlaybackChanged() {
    this.gaEvent(this._category, this._action('playbackstate'), this._label);
  }

  onHD() {
    this.gaEvent(this._category, this._action('highdefinitionupdate'), this._label);
  }

  onDVR() {
    this.gaEvent(this._category, this._action('playbackdvrstatechanged'), this._label);
  }

  resolveErrMsg(o) {
    if (!this._gaExDesc) {
      return 'error';
    }

    let msg;

    if (typeof o.error === 'string') {
      msg = o.error;
    } else if ($.isPlainObject(o.error) && o.error.message) {
      msg = o.error.message;
    } else {
      // FIXME: find out a more elegant way
      msg = 'Error: ' + o.error;
    }

    return msg;
  }

  onError(errorObj) {
    if (this._gaEx) {
      this.gaException(this.resolveErrMsg(errorObj), true);
    } else {
      this.gaEvent(this._category, this._action('error'), this._label);
    }
  }
}
