/* globals
libWrapper
*/
"use strict";

import { tokenUpdateVisionSource, _testLOSDetectionMode } from "./token_visibility.js";
import { MODULE_ID } from "./const.js";
import { log, dot } from "./util.js";

export function registerLibWrapperMethods() {
  libWrapper.register(MODULE_ID, "Token.prototype.updateVisionSource", tokenUpdateVisionSource, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "DetectionMode.prototype._testLOS", _testLOSDetectionMode, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST})
}

export function patchHelperMethods() {
  function setIntersect(b) { return  new Set([...this].filter(x => b.has(x))); }

  Object.defineProperty(Set.prototype, "intersect", {
    value: setIntersect,
    writable: true,
    configurable: true
  });

/**
 * @param {Point} direction Direction vector with two dimensions
 * @returns { PIXI.Point }
 */
function support(direction) {
  const ln = this.closed ? this.points.length : this.points.length - 2;
  if ( ln <= 0 ) return undefined;

  let furthestDistance = Number.NEGATIVE_INFINITY;
  let furthestVertex = null;
  for ( let i = 0; i < ln; i += 2 ) {
    const v = new PIXI.Point(this.points[i], this.points[i + 1]);
    const distance = v.dot(direction);
    if ( distance > furthestDistance ) {
      furthestDistance = distance;
      furthestVertex = v;
    }
  }

  return furthestVertex;
}

function centroid() {
  if ( this.points.length < 2 ) return undefined;

  const centroid = new PIXI.Point();
  let signedArea = 0;

  const points = [...this.points]; // Copy to avoid changing
  if ( !this.isClosed ) points.push(points[0], points[1]);
  const ln = points.length - 2;
  for ( let i = 0; i < ln; i += 2 ) {
    const x0 = points[i];
    const y0 = points[i + 1];
    const x1 = points[i + 2];
    const y1 = points[i + 3];

    const a = (x0 * y1) - (x1 * y0);
    signedArea += a;
    centroid.x += (x0 + x1) * a;
    centroid.y += (y0 + y1) * a;
  }

  signedArea *= 0.5;
  centroid.x /= (6.0 * signedArea);
  centroid.y /= (6.0 * signedArea);

  return centroid;
}

Object.defineProperty(PIXI.Polygon.prototype, "support", {
  value: support,
  writable: true,
  configurable: true
});


Object.defineProperty(PIXI.Polygon.prototype, "centroid", {
  value: centroid,
  writable: true,
  configurable: true
});

Object.defineProperty(PIXI.Point.prototype, "add", {
  value: function(other, outPoint) {
    outPoint ??= new PIXI.Point();
    outPoint.x = this.x + other.x;
    outPoint.y = this.y + other.y;
    return outPoint;
  },
  writable: true,
  configurable: true
});

Object.defineProperty(PIXI.Point.prototype, "subtract", {
  value: function(other, outPoint) {
    outPoint ??= new PIXI.Point();
    outPoint.x = this.x - other.x;
    outPoint.y = this.y - other.y;
    return outPoint;
  },
  writable: true,
  configurable: true
});

/**
 * Multiplies this and other component-wise.
 */
Object.defineProperty(PIXI.Point.prototype, "multiply", {
  value: function(other, outPoint) {
    outPoint ??= new PIXI.Point();
    outPoint.x = this.x * other.x;
    outPoint.y = this.y * other.y;
    return outPoint;
  },
  writable: true,
  configurable: true
});

/**
 * Multiplies each component of this by the scalar.
 */
Object.defineProperty(PIXI.Point.prototype, "multiplyScalar", {
  value: function(scalar, outPoint) {
    outPoint ??= new PIXI.Point();
    outPoint.x = this.x * scalar;
    outPoint.y = this.y * scalar;
    return outPoint;
  },
  writable: true,
  configurable: true
});


Object.defineProperty(PIXI.Point.prototype, "dot", {
  value: function(other) {
    return (this.x * other.x) + (this.y * other.y);
  },
  writable: true,
  configurable: true
});

/**
 * Returns the magnitude of the vector that would result
 * from a regular 3D cross product of the input vectors,
 * taking their Z values implicitly as 0.
 * (thus the scalar returned is the Z value of the 3D cross product vector).
 */
Object.defineProperty(PIXI.Point.prototype, "cross", {
  value: function(other) {
    return (this.x * other.y) - (this.y * other.x);
  },
  writable: true,
  configurable: true
});

Object.defineProperty(PIXI.Point.prototype, "normalize", {
  value: function(outPoint) {
    outPoint ??= new PIXI.Point();
    const magnitude = Math.sqrt((this.x * this.x) + (this.y * this.y));
    outPoint.x = this.x / magnitude;
    outPoint.y = this.y / magnitude;
    return outPoint;
  },
  writable: true,
  configurable: true
});

Object.defineProperty(PIXI.Point.prototype, "magnitude", {
  value: function() {
    return Math.sqrt(this.magnitudeSquared());
  },
  writable: true,
  configurable: true
});

Object.defineProperty(PIXI.Point.prototype, "magnitudeSquared", {
  value: function() {
    return (this.x * this.x) + (this.y * this.y);
  },
  writable: true,
  configurable: true
});

}
