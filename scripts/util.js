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
 * Take an array of 2d points and flatten them to an array of numbers,
 * like what is used by PIXI.Polygon.
 * Much faster than Array.flatMap.
 * @param {Point[]} ptsArr        Array of objects with x, y values
 * @param {function} transformFn  Function to apply to each object
 * @returns {number[]} An array with [pt0.x, pt0.y, pt1.x, ...]
 */
export flatMapPoint2d = function(ptsArr, transformFn) {
	const N = ptsArr.length;
	const ln = N * 2;
    const newArr = Array(ln);
    for ( let i = 0; i < N; i += 1 ) {
	    const j = i * 2;
	    const pt = testFn(ptsArr[i], i);
	    newArr[j] = pt.x;
	    newArr[j + 1] = pt.y;
    }
	return newArr;
}

/**
 * Rotate a point around a given angle
 * @param {Point} point
 * @param {number} angle  In radians
 * @returns {Point}
 */
export function rotatePoint(point, angle) {
  return {
    x: (point.x * Math.cos(angle)) - (point.y * Math.sin(angle)),
    y: (point.y * Math.cos(angle)) + (point.x * Math.sin(angle))
  };
}

/**
 * Translate a point by a given dx, dy
 * @param {Point} point
 * @param {number} dx
 * @param {number} dy
 * @returns {Point}
 */
export function translatePoint(point, dx, dy) {
  return {
    x: point.x + dx,
    y: point.y + dy
  };
}

/**
 * Retrieve an embedded property from an object using a string.
 * @param {object} obj
 * @param {string} str
 * @returns {object}
 */
export function getObjectProperty(obj, str) {
  return str
    .replace(/\[([^\[\]]*)\]/g, ".$1.")
    .split(".")
    .filter(t => t !== "")
    .reduce((prev, cur) => prev && prev[cur], obj);
}

/**
 * Get elements of an array by a list of indices
 * https://stackoverflow.com/questions/43708721/how-to-select-elements-from-an-array-based-on-the-indices-of-another-array-in-ja
 * @param {Array} arr       Array with elements to select
 * @param {number[]} indices   Indices to choose from arr. Indices not in arr will be undefined.
 * @returns {Array}
 */
export function elementsByIndex(arr, indices) {
  return indices.map(aIndex => arr[aIndex]);
}

/**
 * Convert a grid units value to pixel units, for equivalency with x,y values.
 */
export function zValue(value) {
  const { distance, size } = canvas.scene.grid;
  return (value * size) / distance;
}

/**
 * Convert pixel units to grid units
 */
export function pixelsToGridUnits(pixels) {
  const { distance, size } = canvas.scene.dimensions;
  return (pixels * distance) / size;
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
 * Test if an edge CD blocks a line segment AB in 2d.
 * Endpoints count, so if AB crosses C or D, it is blocked.
 * But if AB ends at C or on CD, it does not.
 * It is assumed that A is the start of the segment/ray and so only B is tested.
 * @param {Point} a                   The first endpoint of segment AB
 * @param {Point} b                   The second endpoint of segment AB
 * @param {Point} c                   The first endpoint of segment CD
 * @param {Point} d                   The second endpoint of segment CD
 * @returns {boolean} Does the edge CD block?
 */
export function segmentBlocks(a, b, c, d) {
  if ( b.almostEqual(c) || b.almostEqual(d) ) return false;

  if ( lineSegmentCrosses(a, b, c, d) ) return true;

  if ( foundry.utils.lineSegmentIntersects(a, b, c, d)
    && (!foundry.utils.orient2dFast(a, b, c) || !foundry.utils.orient2dFast(a, b, d)) ) return true;

  return false;
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
  if ( distanceSquaredBetweenPoints(c, p) <= 0.5 ) return 0;

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
 * Möller-Trumbore ray-triangle intersection
 * Calculate intersection of a ray and a triangle in three dimensions.
 * @param {Point3d} A   Point on the line. For a ray, the ray origin point.
 * @param {Point3d} rayVector   Line vector, from origin.
 * @param {Point3d} v0          Triangle vertex 0
 * @param {Point3d} v1          Triangle vertex 1
 * @param {Point3d} v2          Triangle vertex 2
 * @returns {number|null}  Intersection point of the line, relative to A.
 */
export function lineIntersectionTriangle3d(A, rayVector, v0, v1, v2) {
  const EPSILON = 1e-08;

  const edge1 = v1.subtract(v0);
  const edge2 = v2.subtract(v0);

  const h = rayVector.cross(edge2);
  const a = edge1.dot(h);

  if ( a.almostEqual(0, EPSILON) ) return null; // Ray is parallel to triangle.

  const f = 1.0 / a;

  const s = A.subtract(v0);
  return lineTriangleIntersectionLocation(rayVector, edge1, edge2, s, f, h);

  // To compute the intersection location using t and outPoint = new Point3d():
  // A.add(rayVector.multiplyScalar(t, outPoint), outPoint);
  // If t > 0, t is on the ray.
  // if t < 1, t is between rayOrigin and B, where rayVector = B.subtract(A)
}

/**
 * Helper to get intersection of line with triangle, assuming not parallel.
 * @param {Point3d} rayVector   Line vector, from origin A.
 * @param {Point3d} edge1       Vector from v0 for one triangle edge
 * @param {Point3d} edge2       Vector from v0 for other triangle edge
 * @param {number} f            Ratio from rayIntersectsTriangle3d
 * @param {Point3d} h           Cross of rayVector with edge2.
 * @param {Point3d} s           A minus v0.
 * @returns {number|null}
 */
export function lineTriangleIntersectionLocation(rayVector, edge1, edge2, s, f, h) {
  const u = f * s.dot(h);
  if ( u < 0.0 || u > 1.0 ) return null;

  const q = s.cross(edge1);
  const v = f * rayVector.dot(q);
  if ( v < 0.0 || (u + v) > 1.0 ) return null;

  return f * edge2.dot(q); // t

  // To compute the intersection location using t and outPoint = new Point3d():
  // A.add(rayVector.multiplyScalar(t, outPoint), outPoint);
  // If t > 0, t is on the ray.
  // if t < 1, t is between rayOrigin and B, where rayVector = B.subtract(A)
}

/**
 * Test if line intersects a quadrilateral in 3d.
 * Applies Möller-Trumbore ray-triangle intersection but does the planar test only once.
 * @param {Point3d} A           Point on the line. For a ray, the ray origin point.
 * @param {Point3d} rayVector   Line vector, from origin.
 * @param {Point3d} r0          Quad vertex 0  Expected vertices in CW order.
 * @param {Point3d} r1          Quad vertex 1
 * @param {Point3d} r2          Quad vertex 2
 * @param {Point3d} r3          Quad vertex 3
 * @returns {number|null}  Place on the ray of the intersection or null if none.
 */
export function lineIntersectionQuadrilateral3d(A, rayVector, r0, r1, r2, r3) {
  // Triangles are 0-1-2 and 0-2-3
  const edge1 = r1.subtract(r0);
  const edge2 = r2.subtract(r0);

  const h = rayVector.cross(edge2);
  const a = edge1.dot(h);

  if ( a.almostEqual(0, EPSILON) ) return null; // Ray is parallel to triangle.

  const f = 1.0 / a;
  const s = A.subtract(r0);

  const tri1 = lineTriangleIntersectionLocation(rayVector, edge1, edge2, s, f, h);
  if ( tri1 !== null ) return tri1;

  const edge3 = r3.subtract(r0);
  const h2 = rayVector.cross(edge3);
  const a2 = edge1.dot(h);
  const f2 = 1.0 / a2;

  return lineTriangleIntersectionLocation(rayVector, edge1, edge3, s, f2, h2);
}

/**
 * Boolean test for whether a line segment intersects a quadrilateral.
 * Relies on Möller-Trumbore ray-triangle intersection.
 * @param {Point3d} A     First endpoint of the segment
 * @param {Point3d} B     Second endpoint of the segment
 * @param {Point3d} r0          Quad vertex 0  Expected vertices in CW order.
 * @param {Point3d} r1          Quad vertex 1
 * @param {Point3d} r2          Quad vertex 2
 * @param {Point3d} r3          Quad vertex 3
 * @returns {boolean} True if intersection occurs.
 */
export function lineSegmentIntersectsQuadrilateral3d(A, B, r0, r1, r2, r3, { EPSILON = 1e-08 } = {}) {
  const rayVector = B.subtract(A);
  const t = lineIntersectionQuadrilateral3d(A, rayVector, r0, r1, r2, r3);
  if ( t === null ) return false;

  return !(t < EPSILON || t > (1 + EPSILON));
}

/**
 * Test whether a line segment AB intersects with a flat, convex polygon in 3d.
 * @param {Point3d} a   The first endpoint of segment AB
 * @param {Point3d} b   The second endpoint of segment AB
 * @param {Points3d[]} points    The polygon to test, as an array of 3d points.
 *   It is assumed, but not strictly tested, that the points form both a plane and a convex polygon.
 * @returns {boolean}
 */
export function lineSegment3dPolygonIntersects(a, b, points) {
  if ( points.length < 3 ) {
    console.warn("lineSegment3dPolygonIntersects provided less than 3 points.");
    return false;
  }

  // First test the infinite plane.
  if ( !lineSegment3dPlaneIntersects(a, b, points[0], points[1], points[2]) ) return false;

  // Flip around and test whether some of the points are to the right and left of the segment.

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
 * Get the intersection of a 3d line with a tile extended

/**
 * Adapted from https://github.com/mourner/robust-predicates/blob/main/src/orient3d.js
 * @param {Point3d} a   Point in the plane
 * @param {Point3d} b   Point in the plane
 * @param {Point3d} c   Point in the plane
 * @param {Point3d} d   Point to test
 * @returns {boolean}
 *   - Returns a positive value if the point d lies above the plane passing through a, b, and c,
 *     meaning that a, b, and c appear in counterclockwise order when viewed from d.
 *   - Returns a negative value if d lies below the plane.
 *   - Returns zero if the points are coplanar.
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
