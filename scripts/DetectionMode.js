/* globals
canvas,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { DEBUG } from "./const.js";
import { SETTINGS, getSetting } from "./settings.js";
import { testLOSPoint, drawDebugPoint, testLOSCorners, testLOSArea, testLOSArea3d } from "./visibility_los.js";
import { elevatePoints } from "./visibility_range.js";
import { Draw } from "./geometry/Draw.js";

// Patches for the DetectionMode class
export const PATCHES = {};
PATCHES.BASIC = {};
PATCHES.LEVELS = {};
PATCHES.NO_LEVELS = {};

// ----- NOTE: Wraps ----- //

/**
 * Wrap DetectionMode.prototype.testVisibility
 * Create extra points if necessary.
 * Modify tests so LOS area algorithms can use only the center point
 * @param {VisionSource} visionSource           The vision source being tested
 * @param {TokenDetectionMode} mode             The detection mode configuration
 * @param {CanvasVisibilityTestConfig} config   The visibility test configuration
 * @returns {boolean}                           Is the test target visible?
 */
function testVisibility(wrapped, visionSource, mode, {object, tests}={}) {
  if ( !(object instanceof Token) ) return wrapped(visionSource, mode, { object, tests });
  tests = elevatePoints(tests, object);
  return wrapped(visionSource, mode, { object, tests });
}

PATCHES.NO_LEVELS.WRAPS = { testVisibility };

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

/**
 * Mixed wrap DetectionMode.prototype._testRange
 * Test in 3d if setting is enabled.
 * @param {VisionSource} visionSource           The vision source being tested
 * @param {TokenDetectionMode} mode             The detection mode configuration
 * @param {PlaceableObject} target              The target object being tested
 * @param {CanvasVisibilityTest} test           The test case being evaluated
 * @returns {boolean}                           Is the target within range?
 */
function _testRange(wrapper, visionSource, mode, target, test) {
  const debug = DEBUG.range;
  let inRange = false;

  if ( mode.range <= 0 ) {
    // Empty; not in range
    // See https://github.com/foundryvtt/foundryvtt/issues/8505
  } if ( !getSetting(SETTINGS.RANGE.DISTANCE3D)
    || !(target instanceof Token) ) {
    inRange = wrapper(visionSource, mode, target, test);
  } else {
    const radius = visionSource.object.getLightRadius(mode.range);
    const dx = test.point.x - visionSource.x;
    const dy = test.point.y - visionSource.y;
    const dz = test.point.z - visionSource.elevationZ;
    inRange = ((dx * dx) + (dy * dy) + (dz * dz)) <= (radius * radius);
  }
  debug && Draw.point(test.point,  // eslint-disable-line no-unused-expressions
    { alpha: 1, radius: 3, color: inRange ? Draw.COLORS.green : Draw.COLORS.red });

  return inRange;
}

PATCHES.BASIC.MIXES = { _testLOS };
PATCHES.NO_LEVELS.MIXES = { _testRange };
