/* globals
canvas,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { DEBUG } from "./const.js";
import { SETTINGS, getSetting } from "./settings.js";
import { testLOSPoint, drawDebugPoint, testLOSCorners, testLOSArea, testLOSArea3d } from "./visibility_los.js";

// Patches for the DetectionMode class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Mixes ----- //

/**
 * Mixed wrap DetectionMode.prototype._testLOS
 * Handle different types of LOS visibility tests.
 */
function _testLOS(wrapped, visionSource, mode, target, test) {
  // Only apply this test to tokens
  if ( !(target instanceof Token) ) return wrapped(visionSource, mode, target, test);

  // If not constrained by walls or no walls present, line-of-sight is guaranteed.
  if ( !this.walls || !canvas.walls.placeables.length ) return true;

  // Check the cached value; return if there.
  let hasLOS = test.los.get(visionSource);
  if ( hasLOS === true || hasLOS === false ) return hasLOS;

  const debug = DEBUG.los;
  const algorithm = getSetting(SETTINGS.LOS.ALGORITHM);
  const types = SETTINGS.LOS.TYPES;
  switch ( algorithm ) {
    case types.POINTS:
      hasLOS = testLOSPoint(visionSource, target, test);
      debug && drawDebugPoint(visionSource, test.point, hasLOS); // eslint-disable-line no-unused-expressions
      break;
    case types.CORNERS:
      hasLOS = testLOSCorners(visionSource, target, test);
      break;
    case types.AREA:
      hasLOS = testLOSArea(visionSource, target, test);
      break;
    case types.AREA3D:
      hasLOS = testLOSArea3d(visionSource, target, test);
      break;
  }

  test.los.set(visionSource, hasLOS);
  return hasLOS;
}

PATCHES.BASIC.MIXES = { _testLOS };





