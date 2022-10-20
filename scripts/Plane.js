/* globals

*/
"use strict";

import { Point3d } from "./Point3d.js";
import { Matrix } from "./Matrix.js";

// Class to represent a plane
export class Plane {
  /**
   * Default construction is the XY canvas plane
   * @param {Point3d} normal    Normal vector to the plane
   * @param {Point3d} point     Point on the plane
   */
  constructor(point = new Point3d(0, 0, 0), normal = new Point3d(0, 0, 1)) {
    this.normal = normal.normalize(normal);
    this.point = point;
  }

  /**
   * Construct plane from set of 3 points that lie on the plane
   * @param {Point3d} a
   * @param {Point3d} b
   * @param {Point3d} c
   * @returns {Plane}
   */
  static fromPoints(a, b, c) {
    const vAB = b.subtract(a);
    const vAC = c.subtract(a);

    const normal = vAB.cross(vAC);
    return new Plane(normal, a);
  }

  /**
   * Determine the angle between two vectors
   * @param {Point3d} v1
   * @param {Point3d} v2
   * @returns {number}
   */
  static angleBetweenVectors(v1, v2) {
     return Math.acos(v1.dot(v2) / v1.magnitude());
  }

  /**
   * Get vectors on the plane.
   * @param {number} x    X coordinate on the plane.
   * @param {number} y    Y coordinate on the plane.
   * @returns {object} {u: Point3d, v: Point3d} Two vectors on the plane
   */
  vectorsOnPlane() {
    // https://math.stackexchange.com/questions/64430/find-extra-arbitrary-two-points-for-a-plane-given-the-normal-and-a-point-that-l
    // Find the minimum index
    const n = this.normal
    const w = (n.x < n.y && n.x < n.z) ? new Point3d(1,0,0)
      : n.y < n.z ? new Point3d(0 ,1, 0) : new Point3d(0, 0, 1);

    const u = w.cross(n);
    const v = n.cross(u);
    return { u, v }
  }

  /**
   * Calculate the rotation matrix to shift points on the plane to a 2d version.
   * @returns {Matrix} 4x4 rotation matrix
   */
  calculate2dRotationMatrix() {
    // https://math.stackexchange.com/questions/4339940/rotating-3d-coordinates-to-2d-plane
    //const c = vs.u.cross(vs.v);
    const c = this.normal;
    const angle = Plane.angleBetweenVectors(c, new Point3d(0, 0, 1));
    return Matrix.rotationZ(angle)
  }

  /**
   * Line, defined by a point and a vector
   * https://www.wikiwand.com/en/Line%E2%80%93plane_intersection
   * @param {Point3d} vector
   * @param {Point3d} l0
   * @returns {Point3d|null}
   */
  lineIntersection(l0, l) {
    const p_no = this.normal;
    const p_co = this.point;

    const dot = p_no.dot(l);

    // Test if line and plane are parallel and do not intersect.
    if ( dot.almostEqual(0) ) return null;

    const w = l0.subtract(p_co);
    const fac = -p_no.dot(w) / dot;
    const u = l.multiplyScalar(fac);
    return l0.add(u);
  }

  /**
   * Line segment, defined by two points
   * @param {Point3d} p0
   * @param {Point3d} p1
   * @returns {Point3d|null}
   */
  lineSegmentIntersection(p0, p1) {
    return this.lineIntersection(p0, p1.subtract(p0));

//     const p_no = this.normal;
//     const p_co = this.point;
//
//     const u = p1.subtract(p0);
//     const dot = p_no.dot(u);
//
//     if ( dot.almostEqual(0) ) return null;
//
//     const w = p0.subtract(p_co);
//     const fac = -p_no.dot(w) / dot;
//     const u = u.multiplyScalar(fac);
//     return p0.add(u);
  }
}
