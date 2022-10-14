/* globals
Token,
canvas,
game,
ClockwiseSweepPolygon,
foundry,
PIXI
*/
"use strict";

import { SETTINGS, getSetting } from "./settings.js";
import { lineSegmentCrosses, walkLineIncrement, points3dAlmostEqual } from "./util.js";
import { Point3d } from "./Point3d.js";

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


/* Token range options
CENTER
√ Wrap CanvasVisibility.prototype.testVisibility to intercept the tolerance option.

FOUNDRY
- Default, just wrap

FOUNDRY_3D
√ Wrap _testRange and call 2 times per point (top, bottom). Also test the dead center first.

3D: test range in 3 dimensions. Always do this for 2d as well.
√ Wrap _testRange and test 3d distance if _testRange returns true.
(The 3d distance will always be >= than 2d distance)
*/

/* Token los options
POINTS
- Base Foundry (Don't need to shift points to top and bottom)

AREA
- Constrain token boundary by walls.
- Determine overlap area between token boundary and LOS.

3D: Cast shadows to token elevation (top if viewer is looking down; bottom if viewer is looking up)
  Block off token boundary covered by shadows, determine remaining token area.

*/


// ***** WRAPPERS

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
  if ( object instanceof Token && algorithm === SETTINGS.RANGE.CENTER ) tolerance = 0;
  return wrapped(point, { tolerance, object });
}


/**
 * Wrap DetectionMode.prototype.testVisibility
 * Create extra points if necessary
 * @param {VisionSource} visionSource           The vision source being tested
 * @param {TokenDetectionMode} mode             The detection mode configuration
 * @param {CanvasVisibilityTestConfig} config   The visibility test configuration
 * @returns {boolean}                           Is the test target visible?
 */
export function testVisibilityDetectionMode(wrapped, visionSource, mode, {object, tests}={}) {
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

  // Create default elevations
  visionSource.z ??= visionSource.object.elevation;
  const objectHeight = object.topZ - object.bottom.Z;
  const avgElevation = object.bottomZ + (objectHeight * 0.5);
  for ( const test of tests ) {
    test.point.z ??= avgElevation;
  }

  // If top/bottom equal or not doing 3d points, no need for extra test points
  if ( !objectHeight || !getSetting(SETTINGS.RANGE.FOUNDRY_3D) ) {
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
 * If using RANGE.FOUNDRY_3D, shift points to top and bottom.
 * Test 3d if 2d range is true.
 * @param {VisionSource} visionSource           The vision source being tested
 * @param {TokenDetectionMode} mode             The detection mode configuration
 * @param {PlaceableObject} target              The target object being tested
 * @param {CanvasVisibilityTest} test           The test case being evaluated
 * @returns {boolean}                           Is the target within range?
 */
export function _testRangeDetectionMode(wrapper, visionSource, mode, target, test) {
  const inRange = wrapper(visionSource, mode, target, test);
  if ( !(target instanceof Token) || !inRange ) return inRange;

  const radius = visionSource.object.getLightRadius(mode.range);
  const dx = test.point.x - visionSource.x;
  const dy = test.point.y - visionSource.y;
  const dz = test.point.z - visionSource.z;
  return ((dx * dx) + (dy * dy) + (dz * dz)) <= (radius * radius);
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
  if ( algorithm === SETTINGS.LOS.TYPES.POINTS ) {
    const hasLOS = wrapped(visionSource, mode, target, test);
    return testLOSPoint(visionSource, target, test, hasLOS);

  } else if ( algorithm === SETTINGS.LOS.TYPES.AREA ) {
    // Only need to test area once, so use the center point to do this.
    const avgElevation = target.bottomZ + ((target.topZ - target.bottom.Z) * 0.5);
    const { x, y } = target.center;

    if ( !points3dAlmostEqual(test.point, { x, y, z: avgElevation }) ) return false;
    const hasLOS = wrapped(visionSource, mode, target, test);
    return testLOSArea(visionSource, target, hasLOS);
  }
}

function testLOSPoint(visionSource, target, test, hasLOS ) {
  // If not in the line of sight, no need to test for wall collisions
  if ( !hasLOS ) return false;

  // If no wall heights, then don't bother checking wall collisions
  if ( !game.modules.get("wall-height")?.active ) return true;

  // Test shadows and return true if not in shadow?

  // Test all non-infinite walls for collisions
  const origin = new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ)
  return !ClockwiseSweepPolygon.testCollision3d(origin, test.point, { type: "sight", mode: "any", wallTypes: "limited" });
}

function testLOSArea(visionSource, target, hasLOS) {
  const percentArea = getSetting(SETTINGS.VISION.PERCENT_AREA);
  const boundsScale = 1;
//   const boundsScale = getSetting(SETTINGS.VISION.BOUNDS_SCALE);

  // If less than 50% of the token area is required to be viewable, then
  // if the center point is viewable, the token is viewable from that source.
  if ( hasLOS && percentArea < 0.50 ) return true;

  // If more than 50% of the token area is required to be viewable, then
  // the center point must be viewable for the token to be viewable from that source.
  // (necessary but not sufficient)
  if ( !hasLOS && percentArea >= 0.50 ) return false;

  // Construct the constrained token shape if not yet present.
  // Store in token so it can be re-used (wrapped updateVisionSource will remove it when necessary)
  target._constrainedTokenShape ||= constrainedTokenShape(target, { boundsScale });
  const constrained = target._constrainedTokenShape;
  const constrained_bbox = constrained.getBounds();
  const notConstrained = constrained instanceof PIXI.Rectangle;

  // Check whether the polygon intersects the constrained bounding box
  if ( percentArea !== 0 ) {
    const bounds_poly = notConstrained ? constrained.toPolygon() : constrained;
    hasLOS = areaTestFn(visionSource.los, bounds_poly, percentArea);

  } else if ( notConstrained ) {
    hasLOS = sourceIntersectsBoundsTestFn(visionSource.los, constrained_bbox);

  } else {

    /*
    Following doesn't seem to work b/c it returns true when separated by a wall:
    path1 = visionSource.los.toClipperPoints()
    path2 = constrained.toClipperPoints();
    diff = ClipperLib.Clipper.MinkowskiDiff(path1, path2, true)
    ClipperLib.Clipper.PointInPolygon(new ClipperLib.IntPoint(0, 0), res[0])
    */

    hasLOS = sourceIntersectsPolygonTestFn(visionSource.los, constrained_bbox, constrained);
  }

  return hasLOS;
}

/**
 * For a given los polygon, get the shadows at a given elevation.
 * Used to determine if there is line-of-sight to a tokken at a specific elevation with shadows.
 */
function shadowsForPolygonAtElevation(polygon, sourceElevation, targetElevation) {


}

// ***** API

/**
 * Test if a token has cover with regard to another token by checking the vision of
 * the first. Assumes FOV and just tests for LOS to the object.
 * @param {Token} token
 * @param {Token|Object}
 *
 * @param {Object}      [options]  Additional options which modify visibility testing.
 * @param {number} [options.percent_area]   Percent of the token that must be visible to count.
 * @param {number} [options.bounds_scale]   Scale the bounds of the token before considering visibility.
 * @returns {boolean} True if object is visible
 */
export function objectHasCoverFromToken(token, object, {
  percentArea = getSetting(SETTINGS.PERCENT_AREA),
  boundsScale = getSetting(SETTINGS.BOUNDS_SCALE) } = {}) {

  return objectIsVisible(object.center, object, {
    hasFOV: true,
    percentArea,
    boundsScale,
    visionSources: new Set([token.vision]),
    lightSources: new Set()
  });
}

/**
 * Test if an object is visible from a given token.
 * Useful for checking visibility for cover under various limits.
 * Separately checks for line-of-sight and field-of-view.
 * @param {PointSource} source
 * @param {Token}       token
 *
 * @param {Object}      [options]  Additional options which modify visibility testing.
 * @param {boolean} [options.hasFOV]        Assume that the token has unlimited field of vision?
 * @param {number} [options.percent_area]   Percent of the token that must be visible to count.
 * @param {number} [options.bounds_scale]   Scale the bounds of the token before considering visibility.
 * @param {VisionSource[]} [options.visionSources]  Sources of vision to test
 * @param {LightSource[]} [options.lightSources]    Sources of light to test
 *
 * @returns {boolean} True if object is visible
 */
export function objectIsVisible(point, object, {
  hasFOV = canvas.scene.globalLight,
  percentArea = getSetting(SETTINGS.PERCENT_AREA),
  boundsScale = getSetting(SETTINGS.BOUNDS_SCALE),
  visionSources = canvas.effects.visionSources,
  lightSources = canvas.effects.lightSources } = {}) {

  percentArea = Math.clamped(percentArea, 0, 1);

  // Test each vision source
  // https://ptb.discord.com/channels/170995199584108546/956307084931112960/985541410495283250
  // Atropos — Today at 6:49 AM
  // Yeah, there is a piece you are missing here. For a point to be visible it must be in both
  // line of sight as well as in a FOV polygon. From the perspective of only one vision source,
  // only testing FOV would be sufficient, but it gets more complex when you have other light
  // sources in the scene which provide additional FOV polygons but with different LOS.
  // Consider, for example, an object which is outside of the Token's FOV, but inside the
  // Token's LOS. If that object is inside the FOV of a light source, it will still be visible.

  const result = { hasLOS: false, hasFOV };
  const visionSet = new Set();
  const lightSet = new Set();
  const lvSet = new Set();

  // Filter for relevant sources
  visionSources.forEach(v => v.active && visionSet.add(v));
  lightSources.forEach(l => {
    if ( !l.active || l.disabled ) { return; }
    l.data.vision ? lvSet.add(l) : lightSet.add(l); // eslint-disable-line no-unused-expressions
  });

  // Ignoring the somewhat artificial case of a token centered on a wall or corner, currently
  // ignored. Or a token that has walked through a wall at a corner.
  // Seems very difficult to construct a scenario in which the center point does not
  // control visibility as defined below.

  if ( percentArea <= .50 ) {
    // If less than 50% of the token area is required to be viewable, then
    // if the center point is viewable, the token is viewable from that source.
    testLOSFOV(visionSet, lightSet, lvSet, result, containsTestFn, point);

    if ( result.hasFOV && result.hasLOS ) return true;

  } else {
    // If more than 50% of the token area is required to be viewable, then
    // the center point must be viewable for the token to be viewable from that source.
    // (necessary but not sufficient)
    visionSet.forEach(v => v.fov.contains(point.x, point.y) || visionSet.delete(v));
    lightSet.forEach(l => l.containsPoint(point) || lightSet.delete(l));
    lvSet.forEach(l => l.containsPoint(point) || lvSet.delete(l) );

    if ( !visionSet.size && !lvSet.size && !lightSet.size ) return false;
  }

  // Construct the constrained token shape if not yet present.
  // Store in token so it can be re-used (wrapped updateVisionSource will remove it when necessary)
  object._constrainedTokenShape ||= constrainedTokenShape(object, { boundsScale });
  const constrained = object._constrainedTokenShape;
  const constrained_bbox = constrained.getBounds();
  const notConstrained = constrained instanceof PIXI.Rectangle;

  // From this point, we are left testing remaining sources by checking whether the
  // polygon intersects the constrained bounding box.

  if ( percentArea !== 0 ) {
    const bounds_poly = notConstrained ? constrained.toPolygon() : constrained;
    testLOSFOV(visionSet, lightSet, lvSet, result, areaTestFn, bounds_poly, percentArea);

  } else if ( notConstrained ) {
    testLOSFOV(visionSet, lightSet, lvSet, result, sourceIntersectsBoundsTestFn, constrained_bbox);

  } else {
    testLOSFOV(visionSet, lightSet, lvSet, result, sourceIntersectsPolygonTestFn,
      constrained_bbox, constrained);
  }

  return result.hasFOV && result.hasLOS;
}

// ***** FUNCTIONS

/**
 * {Set{VisionSource}} visionSources
 * {Set{LightSource}} lightSources
 * {Set{lightVisionSources}} lightSources   Light sources that provide vision
 * {hasLOS: {boolean}, hasFOV: {boolean}}   Tracker for whether we have found los and fov
 * {Function} testFn                        Function to test for los and fov. Passed
 *                                          the source polygon and ...args
 * {Object} ...args                         Passed to testFn
 */
function testLOSFOV(visionSources, lightSources, lightVisionSources, result, testFn, ...args) {
  for ( const visionSource of visionSources ) {
    if ( !result.hasFOV && testFn(visionSource.fov, ...args) ) {
      result.hasFOV = true;
      result.hasLOS = true;
      return;
    }
    result.hasLOS ||= testFn(visionSource.los, ...args);
    if ( result.hasLOS && result.hasFOV ) return;
  }

  for ( const lightVisionSource of lightVisionSources ) {
    if ( testFn(lightVisionSource.los, ...args) ) {
      result.hasLOS = true;
      result.hasFOV = true;
      return;
    }
  }

  for ( const lightSource of lightSources ) {
    result.hasFOV ||= testFn(lightSource.los, ...args);
    if ( result.hasLOS && result.hasFOV ) return;
  }
}

/**
 * Helper used in testLOSFOV
 * @param {PIXI.Polygon} poly
 * @param {Point} point
 * @return {boolean} True if the polygon contains the point.
 */
const containsTestFn = function(poly, point) { return poly.contains(point.x, point.y); };

/**
 * Helper used in testLOSFOV
 * @param {PIXI.Polygon} poly
 * @param {PIXI.Polygon} bounds_poly
 * @param {number} percentArea
 * @return {boolean} True if the intersect area between poly and bounds_poly is greater
 *                   than the percentArea.
 */
const areaTestFn = function(poly, bounds_poly, percentArea) {
  const seen_area = sourceSeesPolygon(poly, bounds_poly);
  return seen_area > percentArea || seen_area.almostEqual(percentArea);
};

/**
 * Helper used in testLOSFOV
 * @param {PIXI.Polygon} poly
 * @param {PIXI.Rectangle} bbox
 * @return {boolean} True if the bbox intersects the polygon
 */
const sourceIntersectsBoundsTestFn = function(poly, bbox) {
  return sourceIntersectsBounds(poly, bbox);
};

/**
 * Helper used in testLOSFOV
 * @param {PIXI.Polygon} poly
 * @param {PIXI.Polygon} bbox Constrained boundary box
 * @param {PIXI.Polygon} bounds Constrained polygon
 * @return {boolean} True if the bbox intersects the polygon.
 */
const sourceIntersectsPolygonTestFn = function(poly, bbox, bounds) {
  return sourceIntersectsPolygonBounds(poly, bbox, bounds);
};

/**
 * Does the source intersect the bounding box?
 * @param {PIXI.Polygon} source
 * @param {PIXI.Rectangle} bbox
 * @return {boolean} True if the bbox intersects the source.
 */
function sourceIntersectsBounds(source, bbox) {
  for ( const si of source.iterateEdges() ) {
    if ( bbox.lineSegmentIntersects(si.A, si.B,
      { intersectFn: foundry.utils.lineSegmentIntersects }) ) return true;
  }
  return false;
}

/**
 * Stricter intersection test between polygon and a constrained token bounds.
 * 1. Overlapping edges are not considered intersecting.
 * 2. endpoints that overlap the other segment are not considered intersecting.
 * 3. bounds rectangle used to skip edges
 *
 * (1) and (2) are to avoid situations in which the boundary polygon and the source polygon
 * are separated by a wall.
 */
function sourceIntersectsPolygonBounds(source, bbox, bounds) {
  const bounds_edges = [...bounds.iterateEdges()];
  const ln2 = bounds_edges.length;

  for ( const si of source.iterateEdges() ) {
    // Only if the segment intersects the bounding box or is completely inside, test each edge
    if ( !bbox.lineSegmentIntersects(si.A, si.B, { inside: true }) ) continue;

    // Options to test if segment penetrates bounds:
    // (1) segment crosses a bounding edge.
    // (2) one segment endpoint is collinear to a bounding edge and the other is contained but not collinear.
    // (3) both segment endpoints are collinear, and moving a short ways along the segment is contained but not collinear
    // (4) both segment endpoints are collinear to the same edge. -- skip this segment
    let aIsCollinear = false;
    let bIsCollinear = false;
    let overlappingEdge = false;

    const pt = walkLineIncrement(si.A, si.B);
    let ptIsCollinear = false;
    for ( let j = 0; j < ln2; j += 1 ) {
      const sj = bounds_edges[j];

      // (1) Segment crosses a bounding edge.
      if ( lineSegmentCrosses(sj.A, sj.B, si.A, si.B) ) return true;

      const orientA = foundry.utils.orient2dFast(sj.A, sj.B, si.A);
      const orientB = foundry.utils.orient2dFast(sj.A, sj.B, si.B);

      //
      if ( !(orientA || orientB) ) {
        // (4) Segment endpoints collinear to same edge.
        overlappingEdge = true;
        break;
      }

      aIsCollinear ||= !orientA;
      bIsCollinear ||= !orientB;
      ptIsCollinear ||= foundry.utils.orient2dFast(sj.A, sj.B, pt);
    }

    if ( overlappingEdge ) continue;

    if ( aIsCollinear && bIsCollinear ) {
      // (3) Both segment endpoints are collinear.
      if ( ptIsCollinear && bounds.contains(pt.x, pt.y) ) return true;
    } else if ( aIsCollinear && bounds.contains(si.B.x, si.B.y) ) {
      // (2) One segment endpoint is collinear (A)
      return true;

    } else if ( bIsCollinear && bounds.contains(si.A.x, si.A.y) ) {
      // (2) One segment endpoint is collinear (B)
      return true;

    }

  }

  return false;
}

/**
 * Intersect the token bounds against line-of-sight polygon to trim the token bounds
 * to only that portion that does not overlap a wall.
 * @param {Token} token
 * @return {PIXI.Polygon}
 */
export function constrainedTokenShape(token, { boundsScale } = {}) {
  boundsScale ??= getSetting(SETTINGS.BOUNDS_SCALE);

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

/**
 * For a given source of vision, test whether its fov or los polygon
 * contains any part of a given polygon shape
 * @param {VisionSource} source
 * @param {PIXI.Polygon} poly
 * @return {Number} 0 if not seen; percent of the polygon seen otherwise
 */
function sourceSeesPolygon(source, poly) {
  const intersect = source.intersectPolygon(poly);
  if ( !intersect.points.length ) return 0;
  return intersect.area() / poly.area();
}

