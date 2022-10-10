/* globals
PIXI
*/
"use strict";

// From:
// https://blog.hamaluik.ca/posts/building-a-collision-engine-part-1-2d-gjk-collision-detection/
// https://blog.hamaluik.ca/posts/building-a-collision-engine-part-2-2d-penetration-vectors/

import { cross3d } from "./util.js";


// Moved to patching.js
/**
 * @param {Point} direction Direction vector with two dimensions
 */
// function support(direction) {
//   const ln = this.closed ? this.points.length : this.points.length - 2;
//   if ( ln <= 0 ) return undefined;
//
//   let furthestDistance = Number.NEGATIVE_INFINITY;
//   let furthestVertex = null;
//   for ( let i = 0; i < ln; i += 2 ) {
//     const v = { x: this.points[i], y: this.points[i + 1] };
//     const distance = dot(v, direction);
//     if ( distance > furthestDistance ) {
//       furthestDistance = distance;
//       furthestVertex = v;
//     }
//   }
//
//   return furthestVertex;
// }
//
// function centroid() {
//   if ( this.points.length < 2 ) return undefined;
//
//   const centroid = { x: 0, y: 0 };
//   let signedArea = 0;
//
//   const points = [...this.points]; // Copy to avoid changing
//   if ( !this.closed ) points.push(this.points[0], this.points[1]);
//   const ln = points.length;
//   let i;
//   for ( i = 0; i < ln; i += 2 ) {
//     const x0 = this.points[i];
//     const y0 = this.points[i + 1];
//     const x1 = this.points[i + 2];
//     const y1 = this.points[i + 3];
//
//     const a = (x0 * y1) - (x1 * y0);
//     signedArea += a;
//     centroid.x += (x0 + x1) * a;
//     centroid.y += (y0 + y1) * a;
//   }
//
//   // Do last vertex separatel to avoid modulus operation each iteration.
//   const x0 = this.points[i];
//   const y0 = this.points[i + 1];
//   const x1 = this.points[0];
//   const y1 = this.points[1];
//   const a = (x0 * y1) - (x1 * y0);
//   signedArea += a;
//   centroid.x += (x0 + x1) * a;
//   centroid.y += (y0 + y1) * a;
//
//   signedArea *= 0.5;
//   centroid.x /= (6.0 * signedArea);
//   centroid.y /= (6.0 * signedArea);
//
//   return centroid;
// }
//
// Object.defineProperty(PIXI.Polygon.prototype, "support", {
//   value: support,
//   writable: true,
//   configurable: true
// });
//
//
// Object.defineProperty(PIXI.Polygon.prototype, "centroid", {
//   value: centroid,
//   writable: true,
//   configurable: true
// });

const EvolveResult = {
  NoIntersection: 0,
  FoundIntersection: 1,
  StillEvolving: 2
};

const PolygonWinding = {
  Clockwise: 0,
  CounterClockwise: 1
};

class Edge {
  distance;

  normal;

  index;

  constructor(distance, normal, index) {
    this.distance = distance;
    this.normal = normal;
    this.index = index;
  }
}

export class GJK2D {
  _vertices = [];

  _direction = new PIXI.Point();

  _shapeA;

  _shapeB;

  getSupport(direction) {
    const a = this._shapeA.support(direction);
    const b = this._shapeB.support(direction.multiplyScalar(-1));
    return a.subtract(b);
  }

  _addSupport(direction) {
    const newVertex = this.getSupport(direction);
    this._vertices.push(newVertex);
    return newVertex.dot(direction) > 0;
  }

  tripleProduct(a, b, c) {
    const firstZ = a.cross(b);
    const second = cross3d({ x: 0, y: 0, z: firstZ}, {x: c.x, y: c.y, z: 0});
    return new PIXI.Point(second.x, second.y);
  }

  _evolveSimplex() {
    switch ( this._vertices.length ) {
      case 0: {
        const c1 = this._shapeA.centroid();
        const c2 = this._shapeB.centroid();
        c2.subtract(c1, this._direction);
        break;
      }
      case 1: {
        // Flip the direction
        this._direction.multiplyScalar(-1, this._direction);
        break;
      }
      case 2: {
        const b = this._vertices[1];
        const c = this._vertices[0];

        // Line cb is formed by the first two vertices
        const cb = b.subtract(c);

        // Line c0 is the line from the first vertex to the origin
        const c0 = c.multiplyScalar(-1);

        // Use the triple-cross-product to calculate a direction perpendicular
        // to line cb in the direction of the origin
        this._direction = this.tripleProduct(cb, c0, cb);

        break;
      }
      case 3: {
        // Calculate if the simplex contains the origin
        const a = this._vertices[2];
        const b = this._vertices[1];
        const c = this._vertices[0];

        const a0 = a.multiplyScalar(-1); // V2 to the origin
        const ab = b.subtract(a); // V2 to v1
        const ac = c.subtract(a); // V2 to v0

        const abPerp = this.tripleProduct(ac, ab, ab);
        const acPerp = this.tripleProduct(ab, ac, ac);

        if ( abPerp.dot(a0) > 0 ) {
          // The origin is outside line ab
          // Get rid of c and add a new support in the direction of abPerp
          this._vertices.splice(0, 1);
          this._direction = abPerp;

        } else if ( acPerp.dot(a0) > 0 ) {
          // The origin is outside line ac
          // Get rid of b and add a new support in the direction of acPerp
          this._vertices.splice(1, 1);
          this._direction = acPerp;

        } else {
          // The origin is inside both ab and ac,
          // So it must be inside the triangle!
          return EvolveResult.FoundIntersection;
        }
        break;
      }
      default:
        console.error(`Cannot have simplex with ${this._vertices.length} verts!`);
    }

    return this._addSupport(this._direction)
      ? EvolveResult.StillEvolving
      : EvolveResult.NoIntersection;
  }

  test(shapeA, shapeB) {
    // Reset everything
    this._vertices = [];
    this._shapeA = shapeA;
    this._shapeB = shapeB;

    // Do the actual test
    let result = EvolveResult.StillEvolving;
    while ( result === EvolveResult.StillEvolving ) {
      result = this._evolveSimplex();
    }
    return result === EvolveResult.FoundIntersection;
  }

  // Calculate penetration vector using EPA method
  _findClosestEdge(winding) {
    let closestDistance = Number.POSITIVE_INFINITY;
    let closestNormal = new PIXI.Point();
    let closestIndex = 0;
    let line = new PIXI.Point();
    const ln = this._vertices.length;
    for ( let i = 0; i < ln; i += 1 ) {
      let j = i + 1;
      if ( j >= this._vertices.length ) j = 0;

      line.copyTo(this._vertices[j]);
      line.subtract(this._vertices[i], line);

      let norm;
      switch ( winding ) {
        case PolygonWinding.Clockwise:
          norm = new PIXI.Point(line.y, -line.x);
          break;
        case PolygonWinding.CounterClockwise:
          norm = new PIXI.Point(-line.y, line.x);
          break;
      }

      norm.normalize(norm);

      // Calculate how far way the edge is from the origin
      const dist = norm.dot(this._vertices[i]);
      if ( dist < closestDistance ) {
        closestDistance = dist;
        closestNormal = norm;
        closestIndex = j;
      }
    }

    return new Edge(closestDistance, closestNormal, closestIndex);
  }

  intersect(shapeA, shapeB) {
    // First, calculate the base simplex
    if ( !this.test(shapeA, shapeB) ) return null; // Not intersecting

    // Calculate the winding of the existing simplex
    const v0 = this._vertices[0];
    const v1 = this._vertices[1];
    const v2 = this._vertices[2];
    const e0 = (v1.x - v0.x) * (v1.y * v0.y);
    const e1 = (v2.x - v1.x) * (v2.y * v1.y);
    const e2 = (v0.x - v2.x) * (v0.y * v2.y);
    const winding = (e0 + e1 + e2 >= 0) ? PolygonWinding.Clockwise : PolygonWinding.CounterClockwise;

    let intersection = new PIXI.Point();
    for ( let i = 0; i < 32; i += 1 ) {
      const edge = this._findClosestEdge(winding);
      const support = this.getSupport(edge.normal);
      const distance = support.dot(edge.normal);

      // Make sure the values are copied
      intersection = new PIXI.Point();
      edge.normal.copyTo(intersection);
      intersection.multiplyScalar(distance, intersection);

      if ( Math.abs(distance - edge.distance) <= 0.000001 ) return intersection;
      else this._vertices.push(edge.index, support);
    }

    return intersection;
  }
}
