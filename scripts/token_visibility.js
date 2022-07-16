/* globals
Token,
canvas,
game,
ClockwiseSweepPolygon,
foundry,
PIXI
*/
"use strict";

import { SETTINGS } from "./module.js";
import { orient2dPixelLine } from "util.js";

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
*/

// ***** WRAPPERS

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
 * Wrap CanvasVisibility.prototype.testVisibility.
 * For now, override only for testing token object
 *
 * Test whether a point on the Canvas is visible based on the current vision and LOS polygons.
 *
 * @param {Point} point                 The point in space to test, an object with coordinates x and y.
 * @param {object} [options]            Additional options which modify visibility testing.
 * @param {number} [options.tolerance=2]    A numeric radial offset which allows for a non-exact match. For example,
 *                                          if tolerance is 2 then the test will pass if the point is within 2px of a
 *                                          vision polygon.
 * @param {PIXI.DisplayObject} [options.object] An optional reference to the object whose visibility is being tested
 * @returns {boolean}                   Whether the point is currently visible.
 */
export function testVisibility(wrapped, point, {tolerance=2, object=null}={}) { // eslint-disable-line no-unused-vars
  if ( !object || !(object instanceof Token) || !SETTINGS.useTestVisibility ) return wrapped(point, {tolerance, object});


  if ( !canvas.effects.visionSources.size ) return game.user.isGM;

  return objectIsVisible(point, object, {
    hasFOV: canvas.scene.globalLight,
    percentArea: SETTINGS.percentArea,
    boundsScale: SETTINGS.boundsScale });
}

// ***** API

/**
 * Test if a token has cover with regard to another token by checking the vision of
 * the first. Assumes FOV and just tests for LOS to the object.
 * @param {Token} token
 * @param {Token|Object}
 */
export function objectHasCoverFromToken(token, object, { percentArea = 0, boundsScale = 1 } = {}) {
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
 * @param {Object}      Optional parameters
 *
 * Options:
 * @param {boolean} hasFOV        Assume that the token has unlimited field of vision?
 * @param {number} percent_area   Percent of the token that must be visible to count.
 * @param {number} bounds_scale   Scale the bounds of the token before considering visibility.
 * @param {VisionSource[]} visionSources  Sources of vision to test
 * @param {LightSource[]} lightSources    Sources of light to test
 *
 * @return {boolean} True if object is visible
 */
export function objectIsVisible(point, object, {
  hasFOV = canvas.scene.globalLight,
  percentArea = 0,
  boundsScale = 1,
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
  // TO-DO: Move constraint test here? Would be much slower.

  if ( percentArea <= .50 ) {
    // If less than 50% of the token area is required to be viewable, then
    // if the center point is viewable, the token is viewable from that source.
    testLOSFOV(visionSet, lightSet, lvSet, result, containsTestFn, point);

    if ( result.hasFOV && result.hasLOS ) return true;

  } else { // Includes the 50% case at the moment
    // If more than 50% of the token area is required to be viewable, then
    // the center point must be viewable for the token to be viewable from that source.
    // (necessary but not sufficient)
    visionSet.forEach(v => v.fov.contains(point.x, point.y) || visionSet.delete(v));
    lightSet.forEach(l => l.containsPoint(point) || lightSet.delete(l));
    lvSet.forEach(l => l.containsPoint(point) || lvSet.delete(l) );

    if ( !visionSet.size && !lightSet.size && !lvSet.size ) return false;
  }

  // Construct the constrained token shape if not yet present.
  // Store in token so it can be re-used (wrapped updateVisionSource will remove it when necessary)
  object._constrainedTokenShape ||= constrainedTokenShape(object, { boundsScale });
  const constrained = object._constrainedTokenShape;
  const constrained_bbox = constrained.getBounds();
  const notConstrained = constrained instanceof PIXI.Rectangle;

  // Test the bounding box for line-of-sight for easy cases
  // Draw ray from source to the two corners that are at the edge of the viewable
  // bounding box.
  // Test if walls intersect the rays or are between the rays

  // If unconstrained token shape (rectangle):
  // no walls: has los
  // walls only on one side: has los
  // walls don't intersect rays: has los

  // If constrained token shape:
  // no walls: has los
  // otherwise, not clear whether has los

  // From this point, we are left testing remaining sources by checking whether the
  // polygon intersects the constrained bounding box.

  if ( percentArea !== 0 ) {
    const bounds_poly = notConstrained ? constrained.toPolygon() : constrained;
    testLOSFOV(visionSet, lightSet, lvSet, result, areaTestFn, bounds_poly, percentArea);

  } else if ( notConstrained ) {
    testLOSFOV(visionSet, lightSet, lvSet, result, sourceIntersectsBoundsTestFn, constrained_bbox);

  } else {
    const constrained_edges = [...constrained.iterateEdges()];
    testLOSFOV(visionSet, lightSet, lvSet, result, sourceIntersectsPolygonTestFn,
      constrained_bbox, constrained_edges);
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
  return seen_area > percentArea;
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
 * @param {PolygonEdge[]} edges  Edges for the constrained boundary box.
 * @return {boolean} True if the bbox intersects the polygon.
 */
const sourceIntersectsPolygonTestFn = function(poly, bbox, edges) {
  return sourceIntersectsPolygonBounds(poly, bbox, edges);
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
      { intersectFn: altLineSegmentIntersects }) ) return true;
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
function sourceIntersectsPolygonBounds(source, bbox, bounds_edges) {
  const ln2 = bounds_edges.length;

  for ( const si of source.iterateEdges() ) {
    // Only if the segment intersects the bounding box or is completely inside, test each edge
    if ( !bbox.lineSegmentIntersects(si.A, si.B, { inside: true }) ) continue;

    for (let j = 0; j < ln2; j += 1) {
      const sj = bounds_edges[j];
      if ( altLineSegmentIntersects(si.A, si.B, sj.A, sj.B) ) return true;
    }
  }
  return false;
}

/**
 * Alternative lineSegmentIntersects test that rejects collinear lines as well
 * as lines that intersect at an endpoint.
 */
function altLineSegmentIntersects(a, b, c, d) {
  // First test the orientation of A and B with respect to CD to reject collinear cases
  const xa = orient2dPixelLine(a, b, c);
  const xb = orient2dPixelLine(a, b, d);
  if ( !xa || !xb ) return false;
  const xab = (xa * xb) < 0;

  // Also require an intersection of CD with respect to AB
  const xcd = (foundry.utils.orient2dFast(c, d, a) * foundry.utils.orient2dFast(c, d, b)) < 0;
  return xab && xcd;
}

/**
 * Intersect the token bounds against line-of-sight polygon to trim the token bounds
 * to only that portion that does not overlap a wall.
 * @param {Token} token
 * @return {PIXI.Polygon}
 */
function constrainedTokenShape(token, { boundsScale = SETTINGS.boundsScale } = {}) {
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
    bbox.lineSegmentIntersects(w.A, w.B, { inside: true, intersectFn: altLineSegmentIntersects }));
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

