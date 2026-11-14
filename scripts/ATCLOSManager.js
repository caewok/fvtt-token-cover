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

  static async initializeDebugViewer() {
    this.debugViewer ??= buildDebugViewer(currentDebugViewerClass());
    return super.initializeDebugViewer();
  }

  static onGLContextChanged(lost) {
    CONFIG[MODULE_ID].webGL2Unavailable = lost;
    const { ALGORITHM, TYPES } = Settings.KEYS.LOS.TARGET;
    if ( Settings.get(ALGORITHM) !== TYPES.WEBGL2 ) return;
    super.onGLContextChanged(lost);
  }

  /**
   * Update calculator and token handlers when algorithm changes.
   */
  static async _algorithmChange() {
    const ALGORITHM = Settings.KEYS.LOS.TARGET.ALGORITHM;
    const usesWebGL2 = Settings.get(ALGORITHM) === ENUMS.ALGORITHM_TYPES.WEBGL2;    // The setting, not the effective type

    CONFIG[MODULE_ID].losCalculator?.destroy();
    const calc = CONFIG[MODULE_ID].losCalculator = buildLOSCalculator();
    for ( const token of canvas.tokens?.placeables ?? [] ) {
      const losViewer = token[MODULE_ID]?.[TRACKER_IDS.COVER]?.losViewer;
      if ( losViewer ) losViewer.calculator = calc;
    }
    await calc.initialize();   // Avoid the window where isReady is false and everything reads as hidden

    if ( Settings.get(Settings.KEYS.DEBUG.LOS) ) {
      await this.destroyDebugViewer();
      await this.initializeDebugViewer();
    }

    // Last, once no viewer or debug popout can reach the WebGL2 renderer.
    if ( !usesWebGL2 ) await PercentVisibleCalculatorWebGL2.destroy();
  }
}
