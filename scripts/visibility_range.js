/* globals
Token,
CONFIG
*/
"use strict";

import { SETTINGS, getSetting } from "./settings.js";
import { DEBUG, MODULES_ACTIVE } from "./const.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { Draw } from "./geometry/Draw.js";
import { log } from "./util.js";

/* Range Options

3d: Measure distance in 3d.

Algorithms (points):
- Center point
- 9-point (Foundry default)
- 17-point (Token top and bottom)
*/

/**
 * Wrap DetectionMode.prototype.testVisibility
 * Create extra points if necessary.
 * Modify tests so LOS area algorithms can use only the center point
 * @param {VisionSource} visionSource           The vision source being tested
 * @param {TokenDetectionMode} mode             The detection mode configuration
 * @param {CanvasVisibilityTestConfig} config   The visibility test configuration
 * @returns {boolean}                           Is the test target visible?
 */
export function testVisibilityDetectionMode(wrapped, visionSource, mode, {object, tests}={}) {
  if ( !(object instanceof Token) ) return wrapped(visionSource, mode, { object, tests });

  tests = elevatePoints(tests, object);

  return wrapped(visionSource, mode, { object, tests });
}

/**
 * Wrap LightSource.prototype.testVisibility
 * Same as testVisibilityDetectionMode.
 * Create extra points if necessary; modify tests so LOS area algorithms can use only center point.
 * @param {object} config               The visibility test configuration
 * @param {CanvasVisibilityTest[]} config.tests  The sequence of tests to perform
 * @param {PlaceableObject} config.object        The target object being tested
 * @returns {boolean}                   Is the target object visible to this source?
 */
export function testVisibilityLightSource(wrapped, {tests, object}={}) {
  if ( !(object instanceof Token) ) return wrapped({ object, tests });

  tests = elevatePoints(tests, object);

  return wrapped({ object, tests });
}

/**
 * @param {object[]} tests                    Test object, containing point and los Map
 * @param {PlaceableObject} object            The target placeable
 * @returns {object[]} tests, with elevation and possibly other tests added.
 */
function elevatePoints(tests, object) {
  if ( !(object instanceof Token) || !tests.length ) return tests;

  // We assume for the moment that test points are arranged as in default Foundry:
  // center, 4 corners, 4 midpoints
  // We deal with the center test in testVisibilityCanvasVisibility
  const rangeAlg = getSetting(SETTINGS.RANGE.ALGORITHM);
  if ( rangeAlg === SETTINGS.RANGE.TYPES.FIVE ) tests = tests.splice(0, 5);

  // Create default elevations
  const { topZ, bottomZ } = object;
  const objectHeight = topZ - bottomZ;
  const avgElevation = bottomZ + (objectHeight * 0.5);
  for ( const test of tests ) {
    test.point.z ??= avgElevation;
    test.centerPoint = false;
  }

  // Identify the center point
  tests[0].centerPoint = true;

  // If top/bottom equal or not doing 3d points, no need for extra test points
  if ( !objectHeight || !getSetting(SETTINGS.RANGE.POINTS3D) ) return tests;

  // Add points to the tests array representing top and bottom
  const tests3d = [tests[0]];
  const ln = tests.length;
  const top = topZ;
  const bottom = bottomZ + (objectHeight * 0.1);
  for ( let i = 1; i < ln; i += 1 ) {
    const test = tests[i];
    const { x, y } = test.point;
    if ( test.los.size > 0 ) log("Test point has los mapping already.");

    tests3d.push(
      // Use the same map so that x,y contains tests are cached and not repeated.
      buildTestObject(x, y, top, test.los),
      buildTestObject(x, y, bottom, test.los)
    );
  }

  return tests3d;
}

/**
 * Override Level's SightHandler.getTestPoints
 * Levels:
 * - not precise: returns center point only
 * - precise, not exact: center + 4 corners at target LOS height
 * - precise and exact: 5 precise points plus center + 4 corners at target ~ elevation
 * (targetElevation = token.document.elevation + (targetLOSH - token.document.elevation) * 0.1)
 */
export function getTestPointsSightHandlerLevels(token, tol = 4) {
  const rangeAlg = getSetting(SETTINGS.RANGE.ALGORITHM);

  // Convert back to elevation units b/c that is what Levels expects.
  const { topZ, bottomZ, center, w, h } = token;
  const { x, y } = center;
  const topE = CONFIG.GeometryLib.utils.pixelsToGridUnits(topZ);
  const bottomE = CONFIG.GeometryLib.utils.pixelsToGridUnits(bottomZ);

  const height = topE - bottomE;
  const avgE = bottomE + (height * 0.5);
  const bottom = bottomE + (height * 0.1);
  const top = topE;

  // Construct center point
  const tests = [{ x, y, z: avgE }];

  if ( rangeAlg === SETTINGS.RANGE.TYPES.FIVE || rangeAlg === SETTINGS.RANGE.TYPES.NINE ) {
    // Construct corners, using tolerance to inset.
    const { x: lx, y: ly } = token;
    tests.push(
      { x: lx + tol, y: ly + tol, z: avgE },
      { x: lx + tol, y: ly + h - tol, z: avgE },
      { x: lx + w - tol, y: ly + h - tol, z: avgE },
      { x: lx + w - tol, y: ly + tol, z: avgE }
    );
  }

  if ( rangeAlg === SETTINGS.RANGE.TYPES.NINE ) {
    // Construct the side points, using tolerance to inset
    const w2 = w * 0.5;
    const h2 = h * 0.5;
    tests.push(
      { x: x - w2 + tol, y, z: avgE },
      { x, y: y - h2 + tol, z: avgE },
      { x: x + w2 - tol, y, z: avgE },
      { x, y: y + h2 - tol, z: avgE }
    );
  }

  if ( !(height && getSetting(SETTINGS.RANGE.POINTS3D)) ) return tests;

  // Add an additional center point for testing center top/bottom
  tests.push({ x, y, z: avgE });

  // Convert the remaining tests from the middle to the top/bottom
  // (Skip middle as mostly redundant.)
  const ln = tests.length - 1;
  for ( let i = 1; i < ln; i += 1 ) {
    const test = tests[i];
    test.z = top;
    tests.push({ x: test.x, y: test.y, z: bottom });
  }

  return tests;
}

/**
 * Helper function to construct a test object for testVisiblity
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {object}  Object with { point, los }
 *  See CanvasVisibility.prototype.testVisibility
 */
function buildTestObject(x, y, z = 0, los = new Map()) {
  return { point: new Point3d(x, y, z), los, centerPoint: false };
}

/**
 * Wrap DetectionMode.prototype._testRange
 * Test in 3d if setting is enabled.
 * @param {VisionSource} visionSource           The vision source being tested
 * @param {TokenDetectionMode} mode             The detection mode configuration
 * @param {PlaceableObject} target              The target object being tested
 * @param {CanvasVisibilityTest} test           The test case being evaluated
 * @returns {boolean}                           Is the target within range?
 */
export function _testRangeDetectionMode(wrapper, visionSource, mode, target, test) {
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
