/* globals
PIXI
*/
"use strict";

import { CenteredPolygonBase } from "./CenteredPolygonBase.js";

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
leftCorner = { x: d.document.x, y: d.document.y }
width = d.document.shape.width
height = d.document.shape.height
rotation = d.document.rotation

rect = new Rectangle(undefined, width, height, { rotation, leftCorner })
pts = [...rect.iteratePoints()]
pts.forEach(pt => api.drawing.drawPoint(pt))

bounds = rect.getBounds()
drawing.drawShape(bounds)
*/

/**
 * Comparable to RegularPolygon and PIXI.Rectangle class, where
 * the Platonic shape is stored at the origin 0, 0 and translated.
 */
export class CenteredRectangle extends CenteredPolygonBase {

  /**
   * @param {Point} origin   Center point of the rectangle. Can be left undefined if leftCorner is provided.
   * @param {number} width   Length of the sides in the X direction
   * @param {height} height  Length of the sides in the Y direction
   * @param {object} [options]
   * @param {number} [rotation]    Rotation in degrees
   * @param {Point}  [leftCorner]  Alternative specification of rectangle location.
   */
  constructor(origin, width, height, { rotation = 0, leftCorner } = {}) {
    if ( !origin && !leftCorner ) {
      console.warn("Rectangle should have either origin or leftCorner defined.");
      origin = PIXI.Point(0, 0);
    }

    origin ??= new PIXI.Point(leftCorner.x + (width * 0.5), leftCorner.y + (height * 0.5));

    // Could use Square if already imported:
    // if ( width === height ) return new Square(origin, undefined, { rotation, width });

    super(origin, { rotation });

    this.width = width;
    this.height = height;
    this.radius = Math.hypot(width, height) / 2;
  }

  /**
   * Construct a rectangle that follows a rectangular Drawing.
   * @param {Drawing} drawing
   * @returns {Rectangle}
   */
  static fromDrawing(drawing) {
    const { x, y, rotation, shape } = drawing.document;
    const { width, height } = shape;
    const leftCorner = {x, y};

    return new this(undefined, width, height, { rotation, leftCorner });
  }

  /**
   * Construct a rectangle from a PIXI.Rectangle
   * @param {PIXI.Rectangle} rect
   * @returns {CenteredRectangle}
   */
  static fromPIXIRectangle(rect) {
    const { x, y, width, height } = rect;

    return new this(undefined, width, height, { leftCorner: { x, y }});
  }

  /**
   * Calculate area of the rectangle.
   * @type {number}
   */
  get area() { return this.width * this.height; }

  /**
   * Generate the points of the square using the provided configuration.
   * Simpler and more mathematically precise than the default polygon version.
   * @return {Points[]}
   */
  _generateFixedPoints() {
    // Shape before rotation is []
    const { width, height } = this;
    const w1_2 = width * 0.5;
    const h1_2 = height * 0.5;

    return [
      { x: -w1_2, y: -h1_2 },
      { x: w1_2, y: -h1_2 },
      { x: w1_2, y: h1_2 },
      { x: -w1_2, y: h1_2 }
    ];
  }

  /**
   * Generate the points that represent this shape as a polygon in Cartesian space.
   * @return {Points[]}
   */
  _generatePoints() {
    const { x, y, width, height, rotation, fixedPoints: fp } = this;
    const w1_2 = width * 0.5;
    const h1_2 = height * 0.5;

    switch ( rotation ) {
      // Oriented [], where width is in the X direction
      case 0:
      case 180:
        return [
          fp[0].x + x, fp[0].y + y,
          fp[1].x + x, fp[1].y + y,
          fp[2].x + x, fp[2].y + y,
          fp[3].x + x, fp[3].y + y
        ];

      // Oriented [], where width is in the Y direction
      case 90:
      case 270:
        return [
          -h1_2 + x, -w1_2 + y,
          h1_2 + x, -w1_2 + y,
          h1_2 + x, w1_2 + y,
          -h1_2 + x, w1_2 + y
        ];

      // Oriented 45º from [], where width was in the X direction
      case 45:
      case 225:
        return [
          -h1_2 + x, -w1_2 + y, // 1st 90º --> 1st point
          fp[2].x + x, fp[2].y + y, // 3rd 0º --> 2nd point  √
          h1_2 + x, w1_2 + y, // 3rd 90º --> 3rd point
          fp[0].x + x, fp[0].y + y // 1st 0º --> 4th point √
        ];

      // Oriented 45º from [], where width was in the Y direction
      case 135:
      case 315:
        return [
          fp[1].x + x, fp[1].y + y, // 2nd 0º --> 1st point √
          h1_2 + x, -w1_2 + y, // 2nd 90º --> 2nd point
          fp[3].x + x, fp[3].y + y, // 4th 0º --> 3rd point √
          -h1_2 + x, w1_2 + y // 4th 90º --> 4th point
        ];
    }

    // Default alternative
    return super._generatePoints();
  }

  /**
   * Generate the bounding box (in Cartesian coordinates)
   * @returns {PIXI.Rectangle}
   */
  getBounds() {
    // If an edge is on the bounding box, use it as the border
    const { x, y, width, height, rotation } = this;
    const w1_2 = width * 0.5;
    const h1_2 = height * 0.5;

    switch ( rotation ) {
      // Oriented [], where width is in the X direction
      case 0:
      case 180:
        return new PIXI.Rectangle(x - w1_2, y - h1_2, width, height);

      // Oriented [], where width is in the Y direction
      case 90:
      case 270:
        return new PIXI.Rectangle(x - h1_2, y - w1_2, height, width);

      case 45:
      case 135:
      case 225:
      case 315:
        if ( width < height ) return new PIXI.Rectangle(x - h1_2, y - h1_2, height, height);
        else return new PIXI.Rectangle(x - w1_2, y - w1_2, width, width);
    }

    return super.getBounds();
  }
}
