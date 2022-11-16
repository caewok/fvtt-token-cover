/* globals
PIXI
*/
"use strict";

// Base class representing a plane in 3d as a set of points.
// (As opposed to the infinite Plane class.)
// Used for representing walls, tiles, drawings, token sides in 3d.
// Can set a view matrix and transform points accordingly.

import { Matrix } from "./Matrix.js";
import * as drawing from "../drawing.js";

/**
 * Represent a Foundry object as a set of 3d points
 */
export class PlanePoints3d {
  /** @type {Point3d[]} */
  points;

  /**
   * Points when a transform is set.
   * @type {Point3d[]}
   */
  tPoints;

  /**
   * Foundry object represented
   * @type {object}
   */
  object;

  /** @type {boolean} */
  viewIsSet;

  /**
   * @param {object} object       Foundry placeable object class
   * @param {Point3d[]} points    Array of points
   */
  constructor(object, points = []) {
    this.object = object;

    // Points must be provided by child class.
    this.points = points;
    this.tPoints = new Array(points.length);
  }

  /**
   * Set the view matrix used to transform the points.
   * @param {Matrix} M
   */
  setViewMatrix(M) {
    this.M = M;
    this._transform(M);
    this._truncateTransform(M);
    this.viewIsSet = true;
  }

  /**
   * Transform the points using a transformation matrix.
   * @param {Matrix} M
   */
  _transform(M) {
    const ln = this.points.length;
    for ( let i = 0; i < ln; i += 1 ) {
      this.tPoints[i] = Matrix.fromPoint3d(this.points[i]).multiply(M).toPoint3d();
    }
  }

  /**
   * Truncate the transformed shape to keep only the below z = 0 portion.
   * This can take, e.g., a rectangle and construct a smaller rectangle from it.
   * @param {number} rep    Number of iterations thus far, for recursion.
   */
  _truncateTransform(rep = 0) {
    if ( rep > 2 ) return;

    let needsRep = false;
    const targetZ = -1; // Must be less than this in the z dimension to keep.
    const ln = this.tPoints.length;
    let A = this.tPoints[ln - 1];
    for ( let i = 0; i < ln; i += 1 ) {
      const B = this.tPoints[i];
      const Aabove = A.z > targetZ;
      const Babove = B.z > targetZ;
      if ( Aabove && Babove ) needsRep = true; // Cannot redo the A--B line until others points are complete.
      if ( !(Aabove ^ Babove) ) {
        A = B;
        continue;
      }

      const res = PlanePoints3d.truncate3dSegmentAtZ(A, B, targetZ, -1, 0);
      if ( res ) {
        A.copyFrom(res.A);
        B.copyFrom(res.B);
      }
      A = B;
    }
    rep += 1;
    needsRep && this._truncateTransform(rep); // eslint-disable-line no-unused-expressions
  }

  /**
   * Transform the shape to a 2d perspective.
   * @returns {Point2d[]}
   */
  perspectiveTransform() {
    if ( !this.viewIsSet ) console.error("PlanePoints3d perspectiveTransform: view is not set.");
    return this.tPoints.map(pt => PlanePoints3d.perspectiveTransform(pt));
  }

  /**
   * Draw the shape on the 2d canvas
   */
  draw(drawingOptions = {}) {
    this.points.forEach(pt => drawing.drawPoint(pt, drawingOptions));
    const poly = new PIXI.Polygon(this.points);
    drawing.drawShape(poly, drawingOptions);
  }

  /**
   * Draw the transformed shape.
   */
  drawTransformed({perspective = true, color = drawing.COLORS.blue, width = 1, fill, fillAlpha = 0.2 } = {}) {
    if ( typeof fill === "undefined" ) fill = color;

    if ( !this.viewIsSet ) {
      console.warn(`PlanePoints3d: View is not yet set for this object ${this.object.id}.`);
      return;
    }
    const pts = perspective ? this.perspectiveTransform() : this.tPoints;
    const poly = new PIXI.Polygon(pts);
    drawing.drawShape(poly, { color, width, fill, fillAlpha });
  }

  /**
   * Find the 3d point on a 3d line that equals a z coordinate.
   * @param {Point3d} A
   * @param {Point3d} B
   * @param {number} z
   * @returns {object{point:{Point3d}, proportion: {number}}}
   */
  static towardZ(A, B, z) {
    const delta = B.subtract(A);
    const t = (z - A.z) / delta.z;
    return {
      point: A.add(delta.multiplyScalar(t)),
      t
    };
  }

  /**
   * Truncate a segment to be on only one side of the "z" plane, at a certain z value.
   * @param {Point3d} A
   * @param {Point3d} B
   * @param {number} z
   * @param {number} dir    Direction to truncate.
   *   If negative, force segment to be below z. If positive, force segment to be above z.
   * @return {object{ A: {Point3d}, B: {Point3d}}|null}
   */
  static truncate3dSegmentAtZ(A, B, z, dir = -1) {
    let distAz = dir < 0 ? z - A.z : A.z - z;
    let distBz = dir < 0 ? z - B.z : B.z - z;

    if ( distAz.almostEqual(0) ) distAz = 0;
    if ( distBz.almostEqual(0) ) distBz = 0;

    if ( distAz > 0 && distBz > 0 ) {
      // Do nothing
    } else if ( distAz <= 0 && distBz <= 0 ) {
      return null;
    } else if ( distAz < 0 || distBz < 0 ) {
      // Find the point on AB that is even in elevation with z
      // Shorten the segment to somewhere just in front of z
      const {t} = PlanePoints3d.towardZ(A, B, z);

      if ( distAz < 0 ) {
        if ( t.almostEqual(1) || t > 1 ) return null;
        A = A.projectToward(B, t);

        if ( A.z.almostEqual(z) ) A.z = z;

      } else { // Bbehind <= 0
        if ( t.almostEqual(0) || t < 0 ) return null;
        B = A.projectToward(B, t);

        if ( B.z.almostEqual(z) ) B.z = z;
      }
    }
    return { A, B, distAz, distBz };
  }

  /**
   * Convert a 3d point to 2d using a perspective transform by dividing by z.
   * @param {Point3d} pt
   * @param {number} multiplier    Multiplier for the point values.
   *  Used by Area3d to visualize the perspective transform
   * @returns {PIXI.Point}
   */
  static perspectiveTransform(pt, multiplier = 1000) {
    const mult = multiplier / -pt.z;
    return new PIXI.Point(pt.x * mult, pt.y * mult);
  }
}
