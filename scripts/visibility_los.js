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
 * Wrap PointSource.prototype._createPolygon
 * Add a map to temporarily store shadows
 */
export function _createPolygonPointSource(wrapped) {
  this._losShadows ??= new Map();
  this._losShadows.clear();

  return wrapped();
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

  const algorithm = getSetting(SETTINGS.LOS.ALGORITHM);
  const types = SETTINGS.LOS.TYPES;
  if ( algorithm === types.POINTS ) {
    const hasLOS = wrapped(visionSource, mode, target, test);
    return testLOSPoint(visionSource, target, test, hasLOS);
  }

  // Only need to test area once, so use the center point to do this.
  const center = target.center;
  const avgElevation = CoverCalculator.averageTokenElevation(target);
  const centerPoint = new Point3d(center.x, center.y, avgElevation);

  if ( !test.point.almostEqual(centerPoint) && test.centerPoint ) return test.centerPoint.hasLOSArea;

  if ( algorithm === types.AREA ) {
    const centerPointIsVisible = wrapped(visionSource, mode, target, test);
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

export function testLOSPoint(visionSource, target, test, hasLOS ) {
  // If not in the line of sight, no need to test for wall collisions
  // If wall height is not active, collisions will be equivalent to hasLOS
  if ( !hasLOS || !game.modules.get("wall-height")?.active ) return hasLOS;

  // Test all non-infinite walls for collisions
  const origin = new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ);
  hasLOS = !ClockwiseSweepPolygon.testCollision3d(origin, test.point, { type: "sight", mode: "any", wallTypes: "limited" });

  const debug = game.modules.get(MODULE_ID).api.debug.los;
  debug && drawing.drawSegment({A: origin, B: test.point}, {
    color: hasLOS ? drawing.COLORS.green : drawing.COLORS.red,
    alpha: 0.5
  })

  return hasLOS;
}

export function getConstrainedTokenShape(target) {
  const boundsScale = 1;
  // Construct the constrained token shape if not yet present.
  // Store in token so it can be re-used (wrapped updateVisionSource will remove it when necessary)
  this._constrainedTokenShape ||= calculateConstrainedTokenShape(this, { boundsScale });
  return this._constrainedTokenShape;
}

/**
 * Intersect the token bounds against line-of-sight polygon to trim the token bounds
 * to only that portion that does not overlap a wall.
 * @param {Token} token
 * @return {PIXI.Polygon}
 */
export function calculateConstrainedTokenShape(token, { boundsScale } = {}) {
  boundsScale ??= 1;

  let bbox = token.bounds;
  if ( boundsScale !== 1) {
    // BoundsScale is a percentage where less than one means make the bounds smaller,
    // greater than one means make the bounds larger.
    const scalar = boundsScale - 1;
    bbox.pad(Math.ceil(bbox.width * scalar), Math.ceil(bbox.height * scalar)); // Prefer integer values; round up to avoid zeroes.
  }

  let walls = Array.from(canvas.walls.quadtree.getObjects(bbox).values());
  if ( !walls.length ) return bbox;

  // Only care about walls that strictly intersect the bbox or are inside the bbox.
  // Many times with a grid, a wall will overlap a bbox edge.
  walls = walls.filter(w =>
    bbox.lineSegmentIntersects(w.A, w.B, { inside: true, intersectFn: foundry.utils.lineSegmentIntersects }));

  // Don't include walls that are in line with a boundary edge
  walls = walls.filter(w => {
    if ( w.A.x === w.B.x && (w.A.x === bbox.left || w.A.x === bbox.right) ) return false;
    if ( w.A.y === w.B.y && (w.A.y === bbox.top || w.A.y === bbox.bottom) ) return false;
    return true;
  });

  if ( !walls.length ) return bbox;

  // One or more walls are inside or intersect the bounding box.
  const constrained = new ClockwiseSweepPolygon();
  constrained.initialize(token.center, { type: "sight", source: token.vision, boundaryShapes: [bbox] });
  constrained.compute();

  // Check if we are basically still dealing with an unconstrained token shape, b/c
  // that is faster than dealing with an arbitrary polygon.
  if ( constrained.points.length !== 10 ) return constrained;

  for ( const pt of constrained.iteratePoints({ close: false }) ) {
    if ( !(pt.x.almostEqual(bbox.left) || pt.x.almostEqual(bbox.right)) ) return constrained;
    if ( !(pt.x.almostEqual(bbox.top) || pt.y.almostEqual(bbox.bottom)) ) return constrained;
  }

  return bbox;
}
