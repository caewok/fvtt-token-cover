/* globals
game,
foundry,
canvas
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
 * Test if two points are almost equal.
 * If points have keys, better to use p.equal
 * @param {Point} a   Point with 2 dimensions
 * @param {Point} b   Point with 2 dimensions
 * @returns {boolean}
 */
export function points2dAlmostEqual(a, b, epsilon = EPSILON) {
  return a.x.almostEqual(b.x, epsilon) && a.y.almostEqual(b.y, epsilon);
}

export function points3dAlmostEqual(a, b, epsilon = EPSILON) {
  return a.x.almostEqual(b.x, epsilon)
    && a.y.almostEqual(b.y, epsilon)
    && a.z.almostEqual(b.z, epsilon);
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
export function orient2dPixelLine(a, b, c) {
  const orientation = foundry.utils.orient2dFast(a, b, c);
  const dist2 = Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
  const orientation2 = Math.pow(orientation, 2);
  const cutoff = 0.5 * dist2; // 0.5 is (√2 / 2)^2.

  return (orientation2 < cutoff) ? 0 : orientation;
}

/**
 * Like foundry.utils.lineSegmentIntersects but requires the two segments cross.
 * In other words, sharing endpoints or an endpoint on the other segment does not count.
 * @param {Point} a                   The first endpoint of segment AB
 * @param {Point} b                   The second endpoint of segment AB
 * @param {Point} c                   The first endpoint of segment CD
 * @param {Point} d                   The second endpoint of segment CD
 *
 * @returns {boolean}                 Do the line segments cross?
 */
export function lineSegmentCrosses(a, b, c, d) {
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
 * Version of Ray.prototype.towardsPointSquared
 * Default is to move 1 pixel along the line.
 * @param {Point} a           Starting point
 * @param {Point} b           Ending point
 * @param {number} distance2  Square of the distance to move
 * @returns {Point} New point on the line, sqrt(distance2) from a.
 */
export function walkLineIncrement(a, b, distance2 = 1) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.sqrt(distance2 / (Math.pow(dx, 2) + Math.pow(dy, 2)));
  return {
    x: a.x + (t * dx),
    y: a.y + (t * dy)
   };
}

export function walkLinePercentage(a, b, percent = .5) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  return {
    x: a.x + (percent * dx),
    y: a.y + (percent * dy)
  }
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
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dab = Math.pow(dx, 2) + Math.pow(dy, 2);
  if ( !dab ) return null;

  const u = (((c.x - a.x) * dx) + ((c.y - a.y) * dy)) / dab;
  return {
    x: a.x + (u * dx),
    y: a.y + (u * dy)
  };
}

export function distanceBetweenPoints2d(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceSquaredBetweenPoints2d(a, b) {
  return Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2);
}

export function distanceBetweenPoints3d(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function distanceSquaredBetweenPoints3d(a, b) {
  return Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2) + Math.pow(b.z - a.z, 2);
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
export function lineSegment3dPlaneIntersects(a, b, c, d, e = {x: c.x, y: c.y, z: c.z + 1}) {
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
export function lineWall3dIntersection(a, b, wall, epsilon = 1e-8) {
  const x = wall.A.x;
  const y = wall.A.y;
  const c = new Point3d(x, y, 0);

  // Perpendicular vectors are (-dy, dx) and (dy, -dx)
  const d = new Point3d(-(wall.B.y - y), (wall.B.x - x), 0);

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
  const adx = a.x - d.x;
  const bdx = b.x - d.x;
  const cdx = c.x - d.x;
  const ady = a.y - d.y;
  const bdy = b.y - d.y;
  const cdy = c.y - d.y;
  const adz = a.z - d.z;
  const bdz = b.z - d.z;
  const cdz = c.z - d.z;

  return (adx * ((bdy * cdz) - (bdz * cdy)))
    + (bdx * ((cdy * adz) - (cdz * ady)))
    + (cdx * ((ady * bdz) - (adz * bdy)));
}