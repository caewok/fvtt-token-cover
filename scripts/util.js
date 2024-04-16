/* globals
CONFIG,
foundry,
fromUuidSync,
PIXI
*/
"use strict";

import { EPSILON, MODULE_ID } from "./const.js";
import { Point3d } from "./geometry/3d/Point3d.js";

/**
 * Remove in place multiple elements of an array that would meet a find test.
 * @param {Array} arr             The array to modify
 * @param {function} find         Test for whether an element should be removed
 *   - @param {object} element    Current element being processed
 *   - @param {number} index      Index of the element being tested
 *   - @param {Array} array       The array, possibly modified by removals
 * @returns {*[]} The modified array, for convenience
 */
export function findSpliceAll(arr, find) {
  for ( let i = arr.length - 1; i >= 0; i -= 1 ) {
    if ( find(arr[i], i, arr) ) arr.splice(i, 1);
  }
  return arr;
}


/**
 * Log if this module's debug config is enabled.
 */
export function log(...args) {
  try {
    if ( CONFIG[MODULE_ID].debug ) console.debug(MODULE_ID, "|", ...args);
  } catch(e) {
    // Empty
  }
}

/**
 * Determine if this user is the first active GM.
 * So that effects are applied only once.
 */
export function isFirstGM() { return game.user === game.users.find((u) => u.isGM && u.active); }

/**
 * Gets the actor object by the actor UUID
 * Comparable to DFred's version.
 * https://github.com/DFreds/dfreds-convenient-effects/blob/8feaede24d310a3fa231d320ae5d33ecb326897f/scripts/foundry-helpers.js#L41
 * @param {string} uuid - the actor UUID
 * @returns {Actor} the actor that was found via the UUID
 */
export function getActorByUuid(uuid) {
  const actorToken = fromUuidSync(uuid);
  return actorToken?.actor ?? actorToken;
}

export function getTokenByUUID(uuid) {
  const token = fromUuidSync(uuid);
  return token?.object;
}

/**
 * Get the key for a given object value. Presumes unique values, otherwise returns first.
 */
export function keyForValue(object, value) {
  return Object.keys(object).find(key => object[key] === value);
}

/**
 * Retrieve an embedded property from an object using a string.
 * @param {object} obj
 * @param {string} str
 * @returns {object}
 */
export function getObjectProperty(obj, str) {
  return str
    .replace(/\[([^\[\]]*)\]/g, ".$1.") // eslint-disable-line no-useless-escape
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

  if ( CONFIG.GeometryLib.utils.lineSegmentCrosses(a, b, c, d) ) return true;

  if ( foundry.utils.lineSegmentIntersects(a, b, c, d)
    && (!foundry.utils.orient2dFast(a, b, c) || !foundry.utils.orient2dFast(a, b, d)) ) return true;

  return false;
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

  if ( !CONFIG.GeometryLib.utils.lineSegment3dPlaneIntersects(a, b, c, d, e) ) { return null; }

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

  return f * edge2.dot(q); // This is t

  // To compute the intersection location using t and outPoint = new Point3d():
  // A.add(rayVector.multiplyScalar(t, outPoint), outPoint);
  // If t > 0, t is on the ray.
  // if t < 1, t is between rayOrigin and B, where rayVector = B.subtract(A)
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
 * Helper to inject configuration html into the application config.
 */
export async function injectConfiguration(app, html, data, template, findString) {
  const myHTML = await renderTemplate(template, data);
  const form = html.find(findString);
  form.append(myHTML);
  app.setPosition(app.position);
}
