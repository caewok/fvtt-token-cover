/* globals
PIXI
*/
"use strict";

/* Testing
api = game.modules.get('tokenvisibility').api;
Point3d = api.Point3d
PlanePoints3d = api.PlanePoints3d
drawing = api.drawing

points = [
 new PIXI.Point(0, 0),
 new PIXI.Point(500, 0),
 new PIXI.Point(500, 500),
 new PIXI.Point(0, 500)
]

points = [
 new PIXI.Point(0, 0),
 new PIXI.Point(500, 300),
 new PIXI.Point(500, 700),
 new PIXI.Point(0, 500)
]

// 3d
points = [
  new Point3d(0, 0, -200),
  new Point3d(500, 0, 200),
  new Point3d(500, 500, 200),
  new Point3d(0, 500, -200)
]

points = [
  new Point3d(0, 0, -200),
  new Point3d(500, 0, 100),
  new Point3d(500, 500, 200),
  new Point3d(0, 500, 100)
]

points = [
  new Point3d(0, 0, -200),
  new Point3d(500, 300, 200),
  new Point3d(500, 700, 200),
  new Point3d(0, 500, -200)
]

newPt = new points[0].constructor()
points[0].projectToAxisValue(points[1], 100, "x", newPt)

newPoints = PlanePoints3d.truncatePlanePoints(points, 200, "y")

newPoints = PlanePoints3d.truncatePlanePoints(points, 0, "z")

points.forEach(pt => drawing.drawPoint(pt))
newPoints.forEach(pt => drawing.drawPoint(pt, { color: drawing.COLORS.blue}))
*/

// Base class representing a plane in 3d as a set of points.
// (As opposed to the infinite Plane class.)
// Used for representing walls, tiles, drawings, token sides in 3d.
// Can set a view matrix and transform points accordingly.

import { Matrix } from "./Matrix.js";
import { Point3d } from "./Point3d.js";
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
   * Truncate a set of points representing a plane shape to keep only the points
   * below a given coordinate value. It is assumed that the shape can be closed by
   * getting lastPoint --> firstPoint.
   * @param {PIXI.Point[]|Point3d[]} points   Array of points for a polygon in clockwise order.
   * @param {number} cutoff                   Coordinate value cutoff
   * @param {string} coordinate               "x", "y", or "z"
   * @param {function} cmp                    Comparator. Return true to keep.
   *   Defaults to (coord, cutoff) => coord > cutoff
   * @returns {PIXI.Point[]|Point3d[]} The new set of points.
   */
  static truncatePlanePoints(points, cutoff, coordinate, cmp) {
    cmp ??= (a, b) => a > b;
    coordinate ??= "x";

    const truncatedPoints = [];
    const ln = points.length;

    let A = points[ln - 1];
    let keepA = cmp(A[coordinate], cutoff);

    for ( let i = 0; i < ln; i += 1 ) {
      const B = points[i];
      const keepB = cmp(B[coordinate], cutoff);

      if ( keepA && keepB ) truncatedPoints.push(A);
      else if ( !(keepA || keepB) ) { } // eslint-disable-line no-empty
      else if ( !keepA ) {
        // Find the new point between A and B to add
        const newA = new A.constructor();
        const t = B.projectToAxisValue(A, cutoff, coordinate, newA);
        if ( t !== null ) {// Can t === null this ever happen in this setup?
          truncatedPoints.push(newA);
        }

      } else if ( !keepB ) {
        // Find the new point between A and B to add after A
        const newB = new B.constructor();
        const t = A.projectToAxisValue(B, cutoff, coordinate, newB);
        if ( t !== null ) {// Can t === null this ever happen in this setup?
          truncatedPoints.push(A);
          truncatedPoints.push(newB);
        }
      }

      A = B;
      keepA = keepB;
    }

    return truncatedPoints;
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
