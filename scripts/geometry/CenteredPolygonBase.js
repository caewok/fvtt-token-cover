/* globals
PIXI
*/
"use strict";

import {
  flatMapPoint2d,
  rotatePoint,
  translatePoint
} from "../util.js";

// Imports for fromDrawing
import { CenteredPolygon } from "./CenteredPolygon.js";
import { CenteredRectangle } from "./CenteredRectangle.js";
import { Ellipse } from "./Ellipse.js";

/**
 * Base class to be extended by others.
 * Follows the approach of Drawing and RegularPolygon class.
 * Polygon has a set of points centered around origin 0, 0.
 * Polygon is treated as closed.
 */
export class CenteredPolygonBase extends PIXI.Polygon {
  /** @type {number} */
  x = 0;

  /** @type {number} */
  y = 0;

  // TODO: Make rotation and radians getters, so they can be modified.
  /** @type {number} */
  rotation = 0;

  /** @type {number} */
  radians = 0;

  /** @type {Point[]} */
  _fixedPoints;

  /** @type {number[]} */
  _points;

  /** @type {boolean} */
  _isClosed = true;

  /** @type {boolean} */
  _isClockwise = true;

  /**
   * @param {Point} origin    Center point of the polygon.
   * @param {object} [options] Options that affect the polygon shape
   * @param {number} [options.rotation]  Rotation, in degrees, from a starting point due east
   */
  constructor(origin, { rotation = 0 }) {
    super([]);

    this.x = origin.x;
    this.y = origin.y;
    this.rotation = Math.normalizeDegrees(rotation);
    this.radians = Math.toRadians(this.rotation);
  }

  /**
   * Construct a centered polygon using the values in drawing shape.
   * @param {Drawing} drawing
   * @returns {CenteredPolygonBase}
   */
  static fromDrawing(drawing) {
    switch ( drawing.document.shape ) {
      case CONST.DRAWING_TYPES.RECTANGLE:
        return CenteredRectangle.fromDrawing(drawing);
      case CONST.DRAWING_TYPES.ELLIPSE:
        return Ellipse.fromDrawing(drawing);
      case CONST.DRAWING_TYPES.POLYGON:
        return CenteredPolygon.fromDrawing(drawing);
      case default:
        console.error("fromDrawing shape type not supported");
    }
  }

  get center() { return { x: this.x, y: this.y }; }

  get points() { return this._points || (this._points = this._generatePoints()); }

  set points(value) { }

  get fixedPoints() { return this._fixedPoints || (this._fixedPoints = this._generateFixedPoints()); }

  /**
   * Shift this polygon to a new position.
   * @param {number} dx   Change in x position
   * @param {number} dy   Change in y position
   * @returns {CenteredPolygonBase}    This polygon
   */
  translate(dx, dy) {
    this.x = this.x + dx;
    this.y = this.y + dy;
    this._points = undefined;
    return this;
  }

  /**
   * Placeholder for child classes.
   * @return {Points[]}
   */
  _generateFixedPoints() {
    return this._fixedPoints;
  }

  /**
   * Generate the points that represent this shape as a polygon in Cartesian space.
   * @return {Points[]}
   */
  _generatePoints() {
    return flatMapPoint2d(this.fixedPoints, pt => this.toCartesianCoords(pt));
  }

  /**
   * Generate the bounding box (in Cartesian coordinates)
   * @returns {PIXI.Rectangle}
   */
  getBounds() {
    // Find the min and max x,y points
    const pts = this.points;
    const ln = pts.length;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for ( let i = 0; i < ln; i += 2 ) {
      const x = pts[i];
      const y = pts[i + 1];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * Shift from cartesian coordinates to the shape space.
   * @param {Point} a
   * @returns {Point}
   */
  fromCartesianCoords(a) { return rotatePoint(translatePoint(a, -this.x, -this.y), -this.radians); }

  /**
   * Shift to cartesian coordinates from the shape space.
   * @param {Point} a
   * @returns {Point}
   */
  toCartesianCoords(a) { return translatePoint(rotatePoint(a, this.radians), this.x, this.y); }
}
