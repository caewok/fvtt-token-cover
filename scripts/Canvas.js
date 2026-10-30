/* globals
canvas,
CONFIG,
foundry,
game,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "./const.js";
import { Settings } from "./settings.js";
import { buildOcclusionTester, buildLOSCalculator } from "./CoverCalculator.js";
import { log, fastFlag } from "./util.js";

// Patches for the Canvas class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Wraps ----- //

/**
 * A hook event that fires when the Canvas is ready.
 * Needed here to enable the debug viewer.
 * @event
 * @category Canvas
 * @param {Canvas} canvas The Canvas which is now ready for use
 */
function canvasReady(_canvas) {
  log(`${MODULE_ID}|canvasReady`);

  // Destroy any old calculator.
  if ( CONFIG[MODULE_ID].losCalculator ) {
    CONFIG[MODULE_ID].losCalculator.destroy();
    CONFIG[MODULE_ID].losCalculator = null;
  }

  // Create a shared occlusion tester.
  CONFIG[MODULE_ID].occlusionTester = buildOcclusionTester();

  // Create a shared los calculator.
  const calc = CONFIG[MODULE_ID].losCalculator = buildLOSCalculator();

  // Replace for any tokens already in the scene.
  canvas.tokens.placeables.forEach(token => {
    const losViewer = token[MODULE_ID]?.coverCalculator.losViewer;
    if ( !losViewer ) return;
    losViewer.calculator = calc;
  });

  // Render the debug viewer is debug is set.
  if ( Settings.get(Settings.KEYS.DEBUG.LOS) ) Settings.toggleLOSDebugGraphics(true);
}

/**
 * A hook event that fires when the Canvas is deactivated.
 * Needed here because the destroy token hook is too late; by then, the children of the
 * token layer are already removed and so the graphics geometry gets destroyed twice.
 * @event canvasTearDown
 * @category Canvas
 * @param {Canvas} canvas   The Canvas instance being deactivated
 */
function canvasTearDown(_canvas) {
  Settings.toggleLOSDebugGraphics(false);
  Settings.updateLightMonitor(Settings.KEYS.LIGHT_MONITOR.TYPES.NONE);

  // Destroy any old calculator.
  if ( CONFIG[MODULE_ID].losCalculator ) {
    CONFIG[MODULE_ID].losCalculator.destroy();
    CONFIG[MODULE_ID].losCalculator = null;
  }
}

PATCHES.BASIC.HOOKS = { canvasReady, canvasTearDown };
