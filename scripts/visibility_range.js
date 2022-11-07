/* globals
Token,
game
*/

import { SETTINGS, getSetting } from "./settings.js";
import { MODULE_ID } from "./const.js";
import { Point3d } from "./Point3d.js";
import * as drawing from "./drawing.js";
import { log } from "./util.js";

/* Range Options

3d: Measure distance in 3d.

Algorithms (points):
- Center point
- 9-point (Foundry default)
- 17-point (Token top and bottom)
*/

/**
 * Wrap CanvasVisibility.prototype.testVisibility
 * Set tolerance to zero, to cause only a single centerpoint to be tested, for RANGE.CENTER.
 * @param {Point} point                         The point in space to test, an object with coordinates x and y.
 * @param {object} [options]                    Additional options which modify visibility testing.
 * @param {number} [options.tolerance=2]        A numeric radial offset which allows for a non-exact match.
 *                                              For example, if tolerance is 2 then the test will pass if the point
 *                                              is within 2px of a vision polygon.
 * @param {PIXI.DisplayObject} [options.object] An optional reference to the object whose visibility is being tested
 * @returns {boolean}                           Whether the point is currently visible.
 */
export function testVisibilityCanvasVisibility(wrapped, point, {tolerance=2, object=null}={}) {
  if ( !(object instanceof Token) ) return wrapped(point, { tolerance, object });

  if ( game.modules.get("levels")?.active ) {
    // Reset the tolerance
    tolerance = Math.min(object.w, object.h) / 4;

    // Prevent Levels from messing with the Sweep contains method during this visibility test.
    CONFIG.Levels.visibilityTestObject = undefined;
  }

  if ( getSetting(SETTINGS.RANGE.ALGORITHM) === SETTINGS.RANGE.TYPES.CENTER ) tolerance = 0;

  return wrapped(point, { tolerance, object });
}

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

  tests = elevatePoints(tests, visionSource, object);

  return wrapped(visionSource, mode, { object, tests });
}

/**
 * @param {object[]} tests                      Test object, containing point and los Map
 * @param {VisionSource} visionSource           The vision source being tested
 * @param {PlaceableObject} object              The target placeable
 * @returns {object[]} tests, with elevation and possibly other tests added.
 */
function elevatePoints(tests, visionSource, object) {
  if ( !(object instanceof Token) ) return tests;

  // We assume for the moment that test points are arranged as in default Foundry:
  // center, 4 corners, 4 midpoints
  // We deal with the center test in testVisibilityCanvasVisibility
  const rangeAlg = getSetting(SETTINGS.RANGE.ALGORITHM);
  if ( rangeAlg === SETTINGS.RANGE.TYPES.FIVE ) tests = tests.splice(0, 5);

  // Create default elevations
  const objectHeight = object.topZ - object.bottomZ;
  const avgElevation = object.bottomZ + (objectHeight * 0.5);
  for ( const test of tests ) test.point.z ??= avgElevation;

  // Identify the center point
  tests[0].centerPoint = true;

  // If top/bottom equal or not doing 3d points, no need for extra test points
  if ( !objectHeight || !getSetting(SETTINGS.RANGE.POINTS3D) ) return tests;

  // Add points to the tests array representing top and bottom
  const tests3d = [tests[0]];
  const ln = tests.length;
  for ( let i = 1; i < ln; i += 1 ) {
    const test = tests[i];
    const { x, y } = test.point;
    if ( test.los.size > 0 ) log("Test point has los mapping already.");

    tests3d.push(
      // Use the same map so that x,y contains tests are cached and not repeated.
      buildTestObject(x, y, object.topZ, test.los),
      buildTestObject(x, y, object.bottomZ, test.los)
    );
  }

  return tests3d;
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
  return { point: new Point3d(x, y, z), los };
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
  const debug = game.modules.get(MODULE_ID).api.debug.range;
  let inRange = false;

  if ( !getSetting(SETTINGS.RANGE.DISTANCE3D)
    || !(target instanceof Token) ) {
    inRange = wrapper(visionSource, mode, target, test);
  } else {
    const radius = visionSource.object.getLightRadius(mode.range);
    const dx = test.point.x - visionSource.x;
    const dy = test.point.y - visionSource.y;
    const dz = test.point.z - visionSource.elevationZ;
    inRange = ((dx * dx) + (dy * dy) + (dz * dz)) <= (radius * radius);
  }
  debug && drawing.drawPoint(test.point,  // eslint-disable-line no-unused-expressions
    { alpha: 1, radius: 3, color: inRange ? drawing.COLORS.green : drawing.COLORS.red });

  return inRange;
}
