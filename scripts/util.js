/* globals
game
*/
"use strict";

import { MODULE_ID } from "./const.js";

// Minimum absolute difference of floats before they are considered equal
const EPSILON = 1e-08;

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

export function midPoint(a, b) {
  return { x: (a.x + b.x ) * 0.5,
           y: (a.y + b.y ) * 0.5 };
}

/**
 * Dot product of two points.
 * @param {Point} a
 * @param {Point} b
 * @returns {Number}
 */
export function dot(a, b) { return (a.x * b.x) + (a.y * b.y); }

/**
 * Cross product of two points
 * @param {Point} p1
 * @param {Point} p2
 * @return {Number}
 */
export function cross3d(a, b) {
  const c = { x: 0, y: 0, z: 0 };
  c.x = a.y * b.z - a.z * b.y;
  c.y = a.z * b.x - a.x * b.z;
  c.z = a.x * b.y - a.y * b.x;
  return c;
}

/**
 * Normalize 2d vector such that the vector length is 1
 * @param {Point} v
 * @returns {Point}
 */
export function normalize2d(v) {
  const length = Math.sqrt(dot(v, v));
  const mult = length >= EPSILON ? (1 / length) : 0;
  return { x: v.x * mult, y: v.y * mult }
}