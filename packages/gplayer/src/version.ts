import * as pkg from '../package.json' with { "type": "json" };
import * as lock from '../package-lock.json' with { "type": "json" };

export function version() {
  return {
    gplayer: pkg.version,
    clappr: lock.packages['node_modules/@clappr/core'].version,
    dashjs: lock.packages['node_modules/dashjs'].version,
    hlsjs: lock.packages['node_modules/hls.js'].version,
  }
}
