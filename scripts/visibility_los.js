/* globals
Token,
canvas,
game,
ClockwiseSweepPolygon,
foundry
*/
"use strict";

import { MODULE_ID } from "./const.js";
import { SETTINGS, getSetting } from "./settings.js";
import { Point3d } from "./Point3d.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Area2d } from "./Area2d.js";
import { Area3d } from "./Area3d.js";
import * as drawing from "./drawing.js";

/* Visibility algorithm
Three tests, increasing in difficulty and stringency. User can select between 0% and 100%
of token area that must be seen to be visible. 0% means any tiny portion counts. User can
also adjust the token size up or down. For example, you might want only the inner 80% of
the token to count. Or for a particularly large creature that expands beyond its token
(dragon!) you might make it 120% of the token size.

Tests:
1. Center point to test LOS and FOV.
< 50% area: If the center point is within the LOS/FOV , the token is visibile. Return if true.
> 50% area: Center point must be seen, but is not sufficient in itself, to be visible.
            Filter sources that do not meet this criterion.

After this point, constrain the token shape such that if it overlaps a wall, the shape
is trimmed accordingly.

2. Visibility polygon to test LOS.
Draw rays from the vision source origin to the viewable edges of the constrained token shape.
Test if a wall intersects (blocks) both rays.

If no walls present, then we are done; return true.
If not testing area, then if walls only block one side, we are done; return true.
If a wall blocks both rays, then we are done; return false.

3. Intersect test.
Intersect the constrained token shape against the source los or fov. If not testing area,
then it is sufficient to test if the constrained token shape intersects the los/fov.

1 + 3 alone appear to do better than 1 + 2 + 3, so skipping 2 for now.
*/


/* Token visibility testing workflow
Token.prototype.isVisible
- Constructs "tolerance" based on width and height of token
- Calls canvas.effects.visibility.testVisibility(this.center, {tolerance, object: this})

CanvasVisibility.prototype.testVisibility
- Prepares array of points based on tolerance. Default is 2 px. Either [0, 0] or
  set of 9 points: center, 8 points arranged in square, tolerance away from center
- Creates a config = { object, tests: offsets.map(o => point, los)}
- Calls lightSource.testVisibility for each active lightSource
- Calls modes.basicSight.testVisibility for each visionSource. (basic detection test)
- Calls detectionMode.testVisibility on each vision source with special detection modes

DetectionMode.prototype.testVisibility
- Calls DetectionMode.prototype._canDetect for the given visionSource and object
- Calls DetectionMode.prototype._testPoint for each test object (test point) for the given visionSource and object

DetectionMode.prototype._canDetect
- Theoretical detection; should not consider relative positions of objects

DetectionMode.prototype._testPoint
- For given point, call _testLOS
- For given point, call _testRange

DetectionMode.prototype._testLOS
- Tests whether the visionSource.los contains the test point

DetectionMode.prototype._testRange
- Tests whether the test point is within range of a light source visionSource.object.getLightRadius

*/


// ***** WRAPPERS

/**
 * Wrap VisionSource.prototype.initialize
 * Clear the cache when initializing
 */
export function initializeVisionSource(wrapper, data={}) {
  this._losCache = {};
  return wrapper(data);
}

/**
 * Override VisionSource.prototype._createPolygon()
 * Pass an optional type; store the resulting los for that type in the token.
 * Pass other options to affect the config.
 * @param {string} type   light, sight, sound, move
 */
export function _createPolygonVisionSource(config) {
  config ??= this._getPolygonConfiguration();
  this._losCache ??= {};

  // Vision source is destroyed on token move, so we can cache for the type.
  if ( this._losCache[config.type] ) return this._losCache[config.type];

  const origin = { x: this.data.x, y: this.data.y };
  const poly = CONFIG.Canvas.losBackend.create(origin, config);
  this._losCache[config.type] = poly;
  return poly;
}


/**
 * Wrap Token.prototype.updateVisionSource
 * Reset the constrained token shape when updating vision for a token.
 * @param {Function} wrapper
 * @param {object} [options]        Options which affect how the vision source is updated
 * @param {boolean} [options.defer]     Defer refreshing the LightingLayer to manually call that refresh later.
 * @param {boolean} [options.deleted]   Indicate that this vision source has been deleted.
 *
 */
export function tokenUpdateVisionSource(wrapped, { defer=false, deleted=false }={}) {
  // Remove the prior constrained shape, if any
  this._constrainedTokenShape = undefined;
  return wrapped({ defer, deleted });
}

/**
 * Wrap DetectionMode.prototype._testLOS
 */
export function _testLOSDetectionMode(wrapped, visionSource, mode, target, test) {
  // Only apply this test to tokens
  if ( !(target instanceof Token) ) return wrapped(visionSource, mode, target, test);

  // If not constrained by walls or no walls present, line-of-sight is guaranteed.
  if ( !this.walls || !canvas.walls.placeables.length  ) return true;

  const algorithm = getSetting(SETTINGS.LOS.ALGORITHM);
  const types = SETTINGS.LOS.TYPES;
  if ( algorithm === types.POINTS ) {
    if ( !hasLOSCeilingFloorLevels(new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ), test.point) ) {
      drawDebugPoint(visionSource, test, false);
      return false;
    }
    const losContainsPoint = wrapped(visionSource, mode, target, test);

    let hasLOS = wrapped(visionSource, mode, target, test);
    hasLOS = testLOSPoint(visionSource, target, test, losContainsPoint);
    drawDebugPoint(visionSource, test, hasLOS);
    return hasLOS;
  }

  // Only need to test area once, so use the center point to do this.
  if ( !test.centerPoint ) return false;




  const center = target.center;
  const avgElevation = CoverCalculator.averageTokenElevation(target);
  const centerPoint = new Point3d(center.x, center.y, avgElevation);

  if ( !test.point.almostEqual(centerPoint) && test.centerPoint ) return test.centerPoint.hasLOSArea;
  if ( !hasLOSCeilingFloorLevels(new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ), test.point) ) return false;

  if ( algorithm === types.AREA ) {
    const hasLOS = wrapped(visionSource, mode, target, test);

    const centerPointIsVisible = testLOSPoint(visionSource, target, test, hasLOS);

    const area2d = new Area2d(visionSource, target);
    area2d.debug = game.modules.get(MODULE_ID).api.debug.los;

    test.hasLOSArea = area2d.hasLOS(centerPointIsVisible);
    return test.hasLOSArea;
  } else { // Final: types.AREA3D
    const area3d = new Area3d(visionSource, target);
    area3d.debug = game.modules.get(MODULE_ID).api.debug.los;
    test.hasLOSArea = area3d.hasLOS();
    return test.hasLOSArea;
  }
}

function drawDebugPoint(origin, test, hasLOS) {
  const debug = game.modules.get(MODULE_ID).api.debug.los;
  debug && drawing.drawSegment({A: origin, B: test.point}, {
    color: hasLOS ? drawing.COLORS.green : drawing.COLORS.red,
    alpha: 0.5
  })
}

function testLOSPoint(visionSource, target, test, losContainsPoint ) {
  // If not in the line of sight, no need to test for wall collisions
  // If wall height is not active, collisions will be equivalent to hasLOS
  if ( !losContainsPoint || !game.modules.get("wall-height")?.active ) return losContainsPoint;

  // If not within the constrained token shape, then don't test.
  // Assume that unconstrained token shapes contain all test points.
  const cst = ConstrainedTokenShape.get(target)
  if ( cst._unrestricted ) return true;

  // Test all non-infinite walls for collisions
  const origin = new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ);

  if ( game.modules.get("levels")?.active ) return !CONFIG.Levels.API.testCollision(origin, test.point);
  else return !ClockwiseSweepPolygon.testCollision3d(origin, test.point, { type: "sight", mode: "any", wallTypes: "limited" });

  return hasLOS;
}

/**
 * Test whether the origin and test point are on different levels and so no LOS.
 * See https://github.com/theripper93/Levels/blob/v9/scripts/handlers/sightHandler.js
 */
function hasLOSCeilingFloorLevels(origin, testPoint) {
  if ( !game.modules.get("levels")?.active ) return true;

  const z0 = origin.z;
  const z1 = testPoint.z;

  //Check the background for collisions
  const bgElevation = canvas?.scene?.flags?.levels?.backgroundElevation ?? 0

  if ( (origin.z < bgElevation && bgElevation < z1)
    || (z1 < bgElevation && bgElevation < z0) ) return false;

  //Loop through all the planes and check for both ceiling and floor collision on each tile
  for (let tile of canvas.tiles.placeables) {
    if( tile.document.flags?.levels?.noCollision ) continue;
    const bottom = tile.document.flags?.levels?.rangeBottom ?? -Infinity;
    if ( bottom !== -Infinity &&
      ((z0 < bottom && bottom < z1) || (z1 < bottom && bottom < z0)) ) {

      const zIntersectionPoint = getPointForPlane(origin, testPoint, bottom);
      if ( tile.containsPixel(zIntersectionPoint.x, zIntersectionPoint.y, 0.99) ) return false;
    }
  }

  return true;
}

// From https://github.com/theripper93/Levels/blob/v9/scripts/handlers/sightHandler.js
//Get the intersection point between the ray and the Z plane
function getPointForPlane(a, b, z) {
  const dabz = b.z - a.z;
  if ( !dabz ) return null;

  const dzaz = z - a.z;
  const x = (dzaz * (b.x - a.x) + (a.x * b.z) - (a.x * a.z)) / dabz;
  const y = (dzaz * (b.y - a.y) + (b.z * a.y) - (a.z * a.y)) / dabz;
  return { x, y };
}
