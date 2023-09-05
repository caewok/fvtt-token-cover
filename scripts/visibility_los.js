/* globals
canvas,
CONFIG,
LimitedAnglePolygon,
PointSourcePolygon,
Token
*/
"use strict";

import { DEBUG, MODULES_ACTIVE } from "./const.js";
import { SETTINGS, getSetting } from "./settings.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { Area2d } from "./Area2d.js";
import { Area3d } from "./Area3d.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import { Draw } from "./geometry/Draw.js";
import { CoverCalculator } from "./CoverCalculator.js";

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

  // See PointSource.prototype._createPolygon
  const polygonClass = CONFIG.Canvas.polygonBackends[config.type];
  const poly = polygonClass.create(origin, config);
  this._losCache[config.type] = poly;
  return poly;
}

/**
 * Wrap DetectionMode.prototype._testLOS
 */
export function _testLOSDetectionMode(wrapped, visionSource, mode, target, test) {
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
 * Draw red or green test points for debugging.
 * @param {VisionSource} visionSource
 * @param {Point} pt
 * @param {boolean} hasLOS       Is there line-of-sight to the point?
 */
function drawDebugPoint(visionSource, pt, hasLOS) {
  const origin = new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ);
  Draw.segment({A: origin, B: pt}, {
    color: hasLOS ? Draw.COLORS.green : Draw.COLORS.red,
    alpha: 0.5
  });
}

function isConstrained(los) {
  const boundaryShapes = los.config.boundaryShapes;
  if ( boundaryShapes.length === 0 ) return false;
  if ( boundaryShapes.length >= 2 ) return true;

  const boundaryShape = boundaryShapes[0];
  if ( !(boundaryShape instanceof LimitedAnglePolygon) ) return true;

  return boundaryShape.radius < canvas.dimensions.maxR;
}


/**
 * Test a point for line-of-sight. Confirm:
 * 1. Point is on the same level as the visionSource.
 * 2. Point is in LOS.
 * 3. Point is within the constrained target shape.
 * 4. No collisions with wall height limited walls.
 * @param {VisionSource} visionSource
 * @param {Token} target
 * @param {object} test       Object containing Point to test
 * @returns {boolean} True if source has line-of-sight to point
 */
function testLOSPoint(visionSource, target, test) {
  // Test for Levels to avoid vision between levels tiles
  const origin = new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ);
  const pt = test.point;
  if ( !hasLOSCeilingFloorLevels(origin, pt) ) return false;

  // If not within LOS, then we are done.
  if ( MODULES_ACTIVE.PERFECT_VISION ) {
    if ( !isConstrained(visionSource.los) ) {
      if ( !visionSource.los.contains(pt.x, pt.y) ) return false;
    } else {
      const { angle, rotation, externalRadius } = visionSource.data;
      if ( angle !== 360 ) {
        const dx = pt.x - visionSource.x;
        const dy = pt.y - visionSource.y;
        if ( (dx * dx) + (dy * dy) > (externalRadius * externalRadius) ) {
          const aMin = rotation + 90 - (angle / 2);
          const a = Math.toDegrees(Math.atan2(dy, dx));
          if ( ((((a - aMin) % 360) + 360) % 360) > angle ) return false;
        }
      }
      const origin = { x: visionSource.x, y: visionSource.y };
      const type = visionSource.los.config.type;
      if ( CONFIG.Canvas.losBackend.testCollision(origin, pt, { source: visionSource, type, mode: "any" }) ) {
        return false;
      }
    }
  } else if ( !visionSource.los.contains(pt.x, pt.y) ) return false;

  // If not within the constrained token shape, then don't test.
  // Assume that unconstrained token shapes contain all test points.
  const cst = ConstrainedTokenBorder.get(target);
  if ( !cst.contains(pt.x, pt.y) ) return false;

  // If wall height is not active, collisions will be equivalent to the contains test
  // because no limited walls to screw this up. (Note that contains is true at this point.)
  if ( !MODULES_ACTIVE.WALL_HEIGHT ) return true;

  // Test all non-infinite walls for collisions
  if ( MODULES_ACTIVE.LEVELS ) return !CONFIG.Levels.API.testCollision(origin, pt);
  else return !PointSourcePolygon.testCollision3d(origin, pt, { type: "sight", mode: "any", wallTypes: "limited" });
}

/**
 * Test a target token for line-of-sight using corners of the token and corners of the target.
 * (dnd5e DMG rule)
 * Tests all corners and returns true if at least one corner->corner is unblocked.
 * @param {VisionSource} visionSource
 * @param {Token} target
 * @param {object} test       Object containing Point to test
 * @returns {boolean} True if source has line-of-sight to point
 */
function testLOSCorners(visionSource, target, test) {
  if ( !(target instanceof Token) ) return testLOSPoint(visionSource, target, test);

  // If this is not the center point, do not test.
  if ( !testIsCenterPoint(target, test) ) return false;

  const coverCalc = new CoverCalculator(visionSource, target, {
    type: "sight",
    deadTokensBlock: false,
    liveTokensBlock: false,
    liveForceHalfCover: false,
    proneTokensBlock: false
  });

  coverCalc.debug = DEBUG.los;
  const cover = targetCover(SETTINGS.COVER.TYPES.CORNER_CORNERS_GRID);
  return cover < COVER.TYPES.HIGH;
}

/**
 * Test a target token for line-of-sight using top/bottom token areas.
 * @param {VisionSource} visionSource
 * @param {Token} target
 * @param {object} pt       Point to test
 * @returns {boolean} True if source has line-of-sight to point for center point, false otherwise.
 */
function testLOSArea(visionSource, target, test) {
  // If this is not the center point, do not test.
  if ( !testIsCenterPoint(target, test) ) return false;

  // Avoid errors when testing vision for tokens directly on top of one another
  if ( visionSource.x === target.center.x && visionSource.y === target.center.y ) return false;

  const centerPointIsVisible = testLOSPoint(visionSource, target, test);

  const config = {
    type: "sight",
    liveTokensBlock: false,
    deadTokensBlock: false
  };

  if ( DEBUG.forceLiveTokensBlock ) config.liveTokensBlock = true;
  if ( DEBUG.forceDeadTokensBlock ) config.deadTokensBlock = true;

  const area2d = new Area2d(visionSource, target, config);
  area2d.debug = DEBUG.los;
  return area2d.hasLOS(centerPointIsVisible);
}

/**
 * Test a target token for line-of-sight using top/bottom token areas.
 * @param {VisionSource} visionSource
 * @param {Token} target
 * @param {object} pt       Point to test
 * @returns {boolean} True if source has line-of-sight for center point, false otherwise
 */
function testLOSArea3d(visionSource, target, test) {
  // If this is not the center point, do not test.
  if ( !testIsCenterPoint(target, test) ) return false;

  // Avoid errors when testing vision for tokens directly on top of one another
  if ( visionSource.x === target.center.x && visionSource.y === target.center.y ) return false;

  // TODO: Add debug to config, add a getter to check for targeted?
  const config = {
    type: "sight",
    liveTokensBlock: false,
    deadTokensBlock: false
  };

  if ( DEBUG.forceLiveTokensBlock ) config.liveTokensBlock = true;
  if ( DEBUG.forceDeadTokensBlock ) config.deadTokensBlock = true;

  const area3d = new Area3d(visionSource, target, config);

  // Set debug only if the target is being targeted.
  // Avoids "double-vision" from multiple targets for area3d on scene.
  if ( DEBUG.los ) {
    const targets = canvas.tokens.placeables.filter(t => t.isTargeted);
    area3d.debug = targets.some(t => t === target);
  }
  return area3d.hasLOS();
}

/**
 * Helper to determine whether a test point is a center point.
 * Required b/c Levels obliterates the test object.
 * See https://github.com/theripper93/Levels/blob/d9a48ca21e353413d2d631fa03273a5a28a1dcf7/scripts/wrappers.js#L129-L174
 * @param {Token} target
 * @param {object} test
 * @returns {boolean}
 */
function testIsCenterPoint(target, test) {
  if ( typeof test.centerPoint !== "undefined" ) return test.centerPoint;

  const { center, topZ, bottomZ } = target;
  const avgZ = bottomZ + ((topZ - bottomZ) * 0.5);
  const point = test.point;
  return center.x.almostEqual(point.x) && center.y.almostEqual(point.y) && avgZ.almostEqual(point.z);
}

/**
 * Test whether the origin and test point are on different levels and so no LOS.
 * See https://github.com/theripper93/Levels/blob/v9/scripts/handlers/sightHandler.js
 */
function hasLOSCeilingFloorLevels(origin, testPoint) {
  if ( !MODULES_ACTIVE.LEVELS ) return true;

  const z0 = origin.z;
  const z1 = testPoint.z;

  // Check the background for collisions
  const bgElevation = canvas?.scene?.flags?.levels?.backgroundElevation ?? 0;

  if ( (origin.z < bgElevation && bgElevation < z1)
    || (z1 < bgElevation && bgElevation < z0) ) return false;

  // Loop through all the planes and check for both ceiling and floor collision on each tile
  for (let tile of canvas.tiles.placeables) {
    if ( tile.document.flags?.levels?.noCollision ) continue;
    const bottom = tile.document.flags?.levels?.rangeBottom ?? -Infinity;
    if ( bottom !== -Infinity
      && ((z0 < bottom && bottom < z1) || (z1 < bottom && bottom < z0)) ) {

      const zIntersectionPoint = getPointForPlane(origin, testPoint, bottom);
      if ( tile.containsPixel(zIntersectionPoint.x, zIntersectionPoint.y, 0.99) ) return false;
    }
  }

  return true;
}

// From https://github.com/theripper93/Levels/blob/v9/scripts/handlers/sightHandler.js
// Get the intersection point between the ray and the Z plane
function getPointForPlane(a, b, z) {
  const dabz = b.z - a.z;
  if ( !dabz ) return null;

  const dzaz = z - a.z;
  const x = ((dzaz * (b.x - a.x)) + (a.x * b.z) - (a.x * a.z)) / dabz;
  const y = ((dzaz * (b.y - a.y)) + (b.z * a.y) - (a.z * a.y)) / dabz;
  return { x, y };
}
