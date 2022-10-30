/* globals
Token,
game
*/

import { SETTINGS, getSetting } from "./settings.js";
import { MODULE_ID } from "./const.js";
import { Point3d } from "./Point3d.js";
import * as drawing from "./drawing.js";

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
  const algorithm = getSetting(SETTINGS.RANGE.ALGORITHM);
  if ( object instanceof Token && algorithm === SETTINGS.RANGE.TYPES.CENTER ) tolerance = 0;
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
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && drawing.clearDrawings(); // eslint-disable-line no-unused-expressions
  debug && console.log("Clearing drawings!"); // eslint-disable-line no-unused-expressions
  tests = elevatePoints(tests, visionSource, object);

  const algorithm = getSetting(SETTINGS.LOS.ALGORITHM);
  if ( algorithm === SETTINGS.LOS.TYPES.AREA || algorithm === SETTINGS.LOS.TYPES.AREA3D ) {
    // Link tests to the center test for los area
    const ln = tests.length;
    for ( let i = 1; i < ln; i += 1 ) {
      tests[i].centerPoint = tests[0];
    }
  }

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

  // Create default elevations
  const objectHeight = object.topZ - object.bottomZ;
  const avgElevation = object.bottomZ + (objectHeight * 0.5);
  for ( const test of tests ) test.point.z ??= avgElevation;

  // If top/bottom equal or not doing 3d points, no need for extra test points
  if ( !objectHeight || getSetting(SETTINGS.RANGE.ALGORITHM) !== SETTINGS.RANGE.TYPES.SEVENTEEN ) {
    return tests;
  }

  // Add points to the tests array representing top and bottom
  const tests3d = [tests[0]];
  const ln = tests.length;
  for ( let i = 1; i < ln; i += 1 ) {
    const test = tests[i];
    const { x, y } = test.point;
    if ( test.los.size > 0 ) console.warn("Test point has los mapping already.");

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
  if ( !getSetting(SETTINGS.RANGE.DISTANCE3D)
    || !(target instanceof Token) ) return wrapper(visionSource, mode, target, test);

  const debug = game.modules.get(MODULE_ID).api.debug;
  const radius = visionSource.object.getLightRadius(mode.range);
  const dx = test.point.x - visionSource.x;
  const dy = test.point.y - visionSource.y;
  const dz = test.point.z - visionSource.elevationZ;
  const inRange3d = ((dx * dx) + (dy * dy) + (dz * dz)) <= (radius * radius);
  debug && drawing.drawPoint(test.point,  // eslint-disable-line no-unused-expressions
    { alpha: 1, radius: 3, color: inRange3d ? drawing.COLORS.green : drawing.COLORS.red });

  return inRange3d;
}
