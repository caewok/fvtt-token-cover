/* globals
game,
foundry,
canvas,
PIXI
*/
"use strict";

import { MODULE_ID, EPSILON } from "./const.js";
import { Point3d } from "./Point3d.js";

/**
 * Log message only when debug flag is enabled from DevMode module.
 * @param {Object[]} args  Arguments passed to console.log.
 */
export function log(...args) {
  try {
    const isDebugging = game.modules.get("_dev-mode")?.api?.getPackageDebugValue(MODULE_ID);
    if ( isDebugging ) {
      console.log(MODULE_ID, "|", ...args);
    }
  } catch(e) {
    // Empty
  }
}

/**
 * Convert a grid units value to pixel units, for equivalency with x,y values.
 */
export function zValue(value) {
  const { distance, size } = canvas.scene.grid;
  return (value * size) / distance;
}


/**
 * Is point c counterclockwise, clockwise, or colinear w/r/t ray with endpoints A|B?
 * If the point is within ± √2 / 2 of the line, it will be considered collinear.
 * See equivalentPixel function for further discussion on the choice of √2 / 2.
 * @param {Point} a   First endpoint of the segment
 * @param {Point} b   Second endpoint of the segment
 * @param {Point} c   Point to test
 * @returns {number}   Same as foundry.utils.orient2dFast
 *                    except 0 if within √2 /2 of the ray.
 *                    Positive: c counterclockwise/left of A|B
 *                    Negative: c clockwise/right of A|B
 *                    Zero: A|B|C collinear.
 */
// export function orient2dPixelLine(a, b, c) {
//   const orientation = foundry.utils.orient2dFast(a, b, c);
//   const dist2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
//   const orientation2 = Math.pow(orientation, 2);
//   const cutoff = 0.5 * dist2; // 0.5 is (√2 / 2)^2.
//
//   return (orientation2 < cutoff) ? 0 : orientation;
// }

/**
 * Like foundry.utils.lineSegmentIntersects but requires the two segments cross.
 * In other words, sharing endpoints or an endpoint on the other segment does not count.
 * @param {Point} a                   The first endpoint of segment AB
 * @param {Point} b                   The second endpoint of segment AB
 * @param {Point} c                   The first endpoint of segment CD
 * @param {Point} d                   The second endpoint of segment CD
 * @param {object} [options]
 * @param {object} [delta]            If provided, reject if an endpoint is within this delta of the other line.
 *
 * @returns {boolean}                 Do the line segments cross?
 */
export function lineSegmentCrosses(a, b, c, d, { delta } = {}) {
  if ( typeof delta !== "undefined" ) {
//     const p1 = perpendicularPoint(a, b, d);
//     if ( distanceBetweenPoints(d, p1) <= delta ) return false;
//
//     const p2 = perpendicularPoint(a, b, c);
//     if ( distanceBetweenPoints(c, p2) <= delta ) return false;

    // Don't test the other line b/c crossing AB in a T-shape is sufficient
    const p3 = perpendicularPoint(c, d, a);
    if ( distanceBetweenPoints(a, p3) <= delta ) return false;

    const p4 = perpendicularPoint(c, d, b);
    if ( distanceBetweenPoints(b, p4) <= delta ) return false;
  }

  const xa = foundry.utils.orient2dFast(a, b, c);
  if ( !xa ) return false;

  const xb = foundry.utils.orient2dFast(a, b, d);
  if ( !xb ) return false;

  const xc = foundry.utils.orient2dFast(c, d, a);
  if ( !xc ) return false;

  const xd = foundry.utils.orient2dFast(c, d, b);
  if ( !xd ) return false;

  const xab = (xa * xb) < 0; // Cannot be equal to 0.
  const xcd = (xc * xd) < 0; // Cannot be equal to 0.

  return xab && xcd;
}

/**
 * Test orientation of a line to a point.
 * If the point is within √2 / 2 of the line, it is collinear
 * @param {Point} a                   The first endpoint of segment AB
 * @param {Point} b                   The second endpoint of segment AB
 * @param {Point} c                   Point to test
 * @returns {number}
 */
export function orient2dPixel(a, b, c) {
  a = a.to2d();
  b = b.to2d();
  c = c.to2d();

  const p = perpendicularPoint(a, b, c);
  if ( distanceSquaredBetweenPoints(c, p3) <= 0.5 ) return 0;

  return foundry.utils.orient2d(a, b, c);
}

/**
 * Version of Ray.prototype.towardsPointSquared
 * Default is to move 1 pixel along the line.
 * @param {Point} a           Starting point
 * @param {Point} b           Ending point
 * @param {number} distance2  Square of the distance to move
 * @returns {Point} New point on the line, sqrt(distance2) from a.
 */
export function walkLineIncrement(a, b, distance2 = 1) {
  const delta = b.subtract(a);
  const mag2 = delta.magnitudeSquared();
  const t = Math.sqrt(distance2 / mag2);

  const outPoint = new PIXI.Point();
  delta.multiplyScalar(t, outPoint).add(a, outPoint);
  return outPoint;
}

export function walkLinePercentage(a, b, percent = .5) {
  const delta = b.subtract(a);
  const outPoint = new PIXI.Point();
  delta.multiplyScalar(percent, outPoint).add(a, outPoint);
  return outPoint;
}

/**
 * Get the point on a line AB that forms a perpendicular line to a point C.
 * From https://stackoverflow.com/questions/10301001/perpendicular-on-a-line-segment-from-a-given-point
 * This is basically simplified vector projection: https://en.wikipedia.org/wiki/Vector_projection
 * @param {Point} a
 * @param {Point} b
 * @param {Point} c
 * @return {Point} The point on line AB or null if a,b,c are collinear. Not
 *                 guaranteed to be within the line segment a|b.
 */
export function perpendicularPoint(a, b, c) {
  a = a.to2d();
  b = b.to2d();
  c = c.to2d();

  const delta = b.subtract(a);
  const dab = delta.magnitudeSquared();

  // Same as: const u = (((c.x - a.x) * delta.x) + ((c.y - a.y) * delta.y)) / dab;
  const outPoint = new PIXI.Point();
  c.subtract(a, outPoint).multiply(delta, outPoint);

  const t = (outPoint.x + outPoint.y) / dab;

  // Same as:
  //     x: a.x + (t * delta.x),
  //     y: a.y + (t * delta.y)
  // Reuse the outPoint
  delta.multiplyScalar(t, outPoint).add(a, outPoint);
  return outPoint;
}

export function distanceBetweenPoints(a, b) {
  return b.subtract(a).magnitude();
}

export function distanceSquaredBetweenPoints(a, b) {
  return b.subtract(a).magnitudeSquared();
}


/**
 * Quickly test whether the line segment AB intersects with a wall in 3d.
 * Extension of lineSegmentPlaneIntersects where the plane is not infinite.
 * Takes advantage of the fact that 3d walls in Foundry move straight out of the canvas
 * @param {Point3d} a   The first endpoint of segment AB
 * @param {Point3d} b   The second endpoint of segment AB
 * @param {Point3d} c   The first corner of the rectangle
 * @param {Point3d} d   The second corner of the rectangle
 * @param {Point3d} e   The third corner of the rectangle
 * @param {Point3d} f   The fourth corner of the rectangle
 *                      Optional. Default is for the plane to go up in the z direction.
 *
 * @returns {boolean} Does the line segment intersect the rectangle in 3d?
 */
export function lineSegment3dWallIntersection(a, b, wall, epsilon = 1e-8) {
  let bottomZ = wall.bottomZ;
  let topZ = wall.bottomZ;

  if ( !isFinite(bottomZ) ) bottomZ = Number.MIN_SAFE_INTEGER;
  if ( !isFinite(topZ) ) topZ = Number.MAX_SAFE_INTEGER;

  // Four corners of the wall: c, d, e, f
  const c = new Point3d(wall.A.x, wall.A.y, bottomZ);
  const d = new Point3d(wall.B.x, wall.B.y, bottomZ);

  // First test if wall and segment intersect from 2d overhead.
  if ( !foundry.utils.lineSegmentIntersects(a, b, c, d) ) { return null; }

  // Second test if segment intersects the wall as a plane
  const e = new Point3d(wall.A.x, wall.A.y, topZ);

  if ( !lineSegment3dPlaneIntersects(a, b, c, d, e) ) { return null; }

  // At this point, we know the wall, if infinite, would intersect the segment
  // But the segment might pass above or below.
  // Simple approach is to get the actual intersection with the infinite plane,
  // and then test for height.
  const ix = lineWall3dIntersection(a, b, wall, epsilon);
  if ( !ix || ix.z < wall.bottomZ || ix.z > wall.topZ ) { return null; }

  return ix;
}

export function linePlane3dIntersection(a, b, c, d, epsilon = 1e-8) {
  const u = b.subtract(a);
  const dot = d.dot(u);

  if ( Math.abs(dot) > epsilon ) {
    // The factor of the point between a -> b (0 - 1)
    // if 'fac' is between (0 - 1) the point intersects with the segment.
    // Otherwise:
    // < 0.0: behind a.
    // > 1.0: infront of b.
    const w = a.subtract(c);
    const fac = -d.dot(w) / dot;
    const uFac = u.multiplyScalar(fac);
    a.add(uFac, uFac);
    return uFac;
  }

  // The segment is parallel to the plane.
  return null;
}


/**
 * Quickly test whether the line segment AB intersects with a plane.
 * This method does not determine the point of intersection, for that use lineLineIntersection.
 * Each Point3d should have {x, y, z} coordinates.
 *
 * @param {Point3d} a   The first endpoint of segment AB
 * @param {Point3d} b   The second endpoint of segment AB
 * @param {Point3d} c   The first point defining the plane
 * @param {Point3d} d   The second point defining the plane
 * @param {Point3d} e   The third point defining the plane.
 *                      Optional. Default is for the plane to go up in the z direction.
 *
 * @returns {boolean} Does the line segment intersect the plane?
 * Note that if the segment is part of the plane, this returns false.
 */
export function lineSegment3dPlaneIntersects(a, b, c, d, e = new Point3d(c.x, c.y, c.z + 1)) {
  // A and b must be on opposite sides.
  // Parallels the 2d case.
  const xa = orient3dFast(a, c, d, e);
  const xb = orient3dFast(b, c, d, e);
  return xa * xb <= 0;
}

/**
 * Get the intersection of a 3d line with a wall extended as a plane.
 * See https://stackoverflow.com/questions/5666222/3d-line-plane-intersection
 * @param {Point3d} a   First point on the line
 * @param {Point3d} b   Second point on the line
 * @param {Wall} wall   Wall to intersect
 */
export function lineWall3dIntersection(a, b, wall, epsilon = EPSILON) {
  const Ax = wall.A.x;
  const Ay = wall.A.y;

  const c = new Point3d(Ax, Ay, 0);

  // Perpendicular vectors are (-dy, dx) and (dy, -dx)
  const d = new Point3d(-(wall.B.y - Ay), (wall.B.x - Ax), 0);

  return linePlane3dIntersection(a, b, c, d, epsilon);
}

/**
 * See https://github.com/mourner/robust-predicates
 * Each Point3d should have {x, y, z} coordinates.
 * @param {Point3d} a
 * @param {Point3d} b
 * @param {Point3d} c
 * @param {Point3d} d
 * @return {number}
 * Returns a positive value if the point d lies above the plane passing through a, b, and c,
 *   meaning that a, b, and c appear in counterclockwise order when viewed from d.
 * Returns a negative value if d lies below the plane.
 * Returns zero if the points are coplanar.
 *
 * The result is also an approximation of six times the signed volume of the tetrahedron
 * defined by the four points.
 */
export function orient3dFast(a, b, c, d) {
  const deltaAD = a.subtract(d);
  const deltaBD = b.subtract(d);
  const deltaCD = c.subtract(d);

  return ( deltaAD.x * ((deltaBD.y * deltaCD.z) - (deltaBD.z * deltaCD.y)))
    + (deltaBD.x * ((deltaCD.y * deltaAD.z) - (deltaCD.z * deltaAD.y)))
    + (deltaCD.x * ((deltaAD.y * deltaBD.z) - (deltaAD.z * deltaBD.y)));
}
