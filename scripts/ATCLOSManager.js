/* globals
canvas,
CONFIG,
Hooks,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, TRACKER_IDS } from "./const.js";
import { Settings } from "./settings.js";
import { buildDebugViewer, currentDebugViewerClass, buildLOSCalculator } from "./CoverCalculator.js";
import { LOSManager } from "./LOS/LOSManager.js";

export class ATCLOSManager extends LOSManager {
  static debugViewer;

  static registerHooks() {
    super.registerHooks();
    Hooks.on(`${MODULE_ID}.losAlgorithmChanged`, value => this.algorithmChange(value));
  }

  static async initializeDebugViewer(type) {
    type ??= Settings.get(Settings.KEYS.LOS.TARGET.ALGORITHM);
    this.debugViewer ??= buildDebugViewer(currentDebugViewerClass(type));
    return super.initializeDebugViewer();
  }

  static onGLContextChanged(lost) {
    CONFIG[MODULE_ID].webGL2Unavailable = lost;
    const { ALGORITHM, TYPES } = Settings.KEYS.LOS.TARGET;
    if ( Settings.get(ALGORITHM) !== TYPES.WEBGL2 ) return;
    super.onGLContextChanged(lost);
  }

  static async _algorithmChange() {
    CONFIG[MODULE_ID].losCalculator?.destroy();
    const calc = CONFIG[MODULE_ID].losCalculator = buildLOSCalculator(); // Already calls initialize().
    for ( const token of canvas.tokens?.placeables ?? [] ) {
      const losViewer = token[MODULE_ID]?.[TRACKER_IDS.COVER]?.losViewer;
      if ( losViewer ) losViewer.calculator = calc;
    }
    if ( Settings.get(Settings.KEYS.DEBUG.LOS) ) {
      await this.destroyDebugViewer();
      await this.initializeDebugViewer();
    }
  }
}
