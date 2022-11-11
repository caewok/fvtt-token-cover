/* globals
PIXI
*/
"use strict";

import {
  flatMapPoint2d,
  rotatePoint,
  translatePoint
} from "./util.js";


/* Testing
api = game.modules.get('tokenvisibility').api;
drawing = api.drawing

function rotatePoint(point, angle) {
  return {
    x: (point.x * Math.cos(angle)) - (point.y * Math.sin(angle)),
    y: (point.y * Math.cos(angle)) + (point.x * Math.sin(angle))
  };
}

function translatePoint(point, dx, dy) {
  return {
    x: point.x + dx,
    y: point.y + dy
  };
}

[d] = canvas.drawings.placeables
points = d.document.shape.points;
halfWidth = d.document.shape.width * 0.5
halfHeight = d.document.shape.height * 0.5

x = d.document.x + halfWidth
y = d.document.y + halfHeight)

// Recenter around 0, 0
pts = [];
for (i = 0; i < points.length; i += 2 ) {
  pts.push(points[i] - halfWidth, points[i + 1] - halfHeight)
}

rotation = d.document.rotation

poly = new CenteredPolygon({x, y}, pts, { rotation })


poly = CenteredPolygon.fromDrawing(d)
drawing.drawShape(poly)

pts = [...poly.iteratePoints()]
pts.forEach(pt => api.drawing.drawPoint(pt))

bounds = poly.getBounds()
drawing.drawShape(bounds)
*/

/**
 * Follows the approach of polygon Drawing and RegularPolygon class.
 * Polygon has a set of points centered around origin 0, 0.
 * Polygon is treated as closed.
 */
export class CenteredPolygon extends PIXI.Polygon {

  /**
   * @param {Point} origin    Center point of the polygon.
   * @param {number[]} pts  Points of the polygon, where 0,0 is the center
   * @param {object} options Options that affect the polygon shape
   * @param {number} options.rotation  Rotation, in degrees, from a starting point due east
   */
  constructor(origin, pts, { rotation = 0} = {}) {
    super([]);

    this.x = origin.x;
    this.y = origin.y;
    this.rotation = Math.normalizeDegrees(rotation);
    this.radians = Math.toRadians(this.rotation);

    // Construct an array of points
    const ln = pts.length;
    const nFP = ln * 0.5;
    this._fixedPoints = Array(nFP);
    for (let i = 0; i < nFP; i += 1) {
      const j = i * 2;
      this._fixedPoints[i] = { x: pts[j], y: pts[j + 1] };
    }

    // Close the polygon
    const lastY = pts[ln - 1];
    const lastX = pts[ln - 2];
    if ( pts[0] !== lastX || pts[1] !== lastY ) this._fixedPoints.push({ x: lastX, y: lastY });

    // Polygon properties
    this._isClosed = true;
    this._isClockwise = true;
  }

  /**
   * Construct a centered polygon using the values in drawing shape.
   * @param {Drawing} drawing
   * @returns {CenteredPolygon}
   */
  static fromDrawing(drawing) {
    const { x, y, shape, rotation } = drawing.document;
    const { points, width, height } = shape;
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;

    const centeredX = x + halfWidth;
    const centeredY = y + halfHeight;

    // Recenter around 0, 0
    const ln = points.length;
    const pts = Array(ln);
    for (let i = 0; i < points.length; i += 2 ) {
      pts[i] = points[i] - halfWidth;
      pts[i + 1] = points[i + 1] - halfHeight;
    }

    return new this({ x: centeredX, y: centeredY }, pts, { rotation });
  }

  get center() { return { x: this.x, y: this.y }; }

  get points() { return this._points || (this._points = this._generatePoints()); }

  set points(value) { }

  get fixedPoints() { return this._fixedPoints || (this._fixedPoints = this._generateFixedPoints()); }


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
