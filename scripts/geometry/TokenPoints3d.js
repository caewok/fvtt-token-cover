/* globals
PIXI
*/
"use strict";

import { PlanePoints3d } from "./PlanePoints3d.js";
import { Point3d } from "./Point3d.js";
import { ConstrainedTokenBorder } from "../ConstrainedTokenBorder.js";
import * as drawing from "../drawing.js";

class TokenSidePoints3d extends PlanePoints3d {
  /** @type {object} */
  static SIDE_TYPES = {
    TOP: 1,
    BOTTOM: 2,
    SIDE: 3
  };

  /** @type {SIDE_TYPES} */
  type;

  constructor(object, points, type) {
    super(object, points);
    this.type = type; // Tracking and debugging
  }
}

export class TokenPoints3d {
  /** @type {Token} */
  token;

  /** @type {object} */
  config = {
    type: "sight", /** @type {string} */
    halfHeight: false /** @type {boolean} */
  };

  /* @type {boolean} */
  viewIsSet = false;

  /* @type {PIXI.Polygon} */
  borderPolygon;

  /** @type {TokenSidePoints3d} */
  bottomSide;

  /** @type {TokenSidePoints3d} */
  topSide;

  /** @type {TokenSidePoints3d[]} */
  faces = [];

  /** @type {Point3d} */
  viewingPoint = undefined;

  /**
   * @param {Token} token
   * @param {object} [options]
   * @param {string} [options.type]         Wall restriction type, for constructing the
   *                                        constrained token shape
   * @param {boolean} [options.halfHeight]  Whether half the height of the token should be used.
   */
  constructor(token, { type = "sight", halfHeight = false } = {}) {
    this.token = token;
    this.config.type = type;
    this.config.halfHeight = halfHeight;

    this._setTokenBorder();
    this._setTopBottomPoints();
  }

  /**
   * Determine the polygon representation of the token border.
   */
  _setTokenBorder() {
    const constrainedTokenBorder = ConstrainedTokenBorder.get(this.token, this.config.type).constrainedBorder();
    this.borderPolygon = constrainedTokenBorder instanceof PIXI.Rectangle
      ? constrainedTokenBorder.toPolygon() : constrainedTokenBorder;
  }

  /**
   * Create the 3d top and bottom points for this token.
   */
  _setTopBottomPoints() {
    const points = [...this.borderPolygon.iteratePoints()];
    const { topZ, bottomZ } = this;

    const nPts = points.length;
    const topPoints = Array(nPts);
    const bottomPoints = Array(nPts);
    for ( let i = 0; i < nPts; i += 1 ) {
      const pt = points[i];
      topPoints[i] = new Point3d(pt.x, pt.y, topZ);
      bottomPoints[i] = new Point3d(pt.x, pt.y, bottomZ);
    }

    const types = TokenSidePoints3d.SIDE_TYPES;
    this.topSide = new TokenSidePoints3d(this.token, topPoints, types.TOP);
    this.bottomSide = new TokenSidePoints3d(this.token, bottomPoints, types.BOTTOM);
  }

  /** @type {number} */
  get bottomZ() {
    return this.token.bottomZ;
  }

  /** @type {number} */
  get topZ() {
    const { topZ, bottomZ } = this.token;
    return topZ === this.bottomZ ? (topZ + 2)
      : this.config.halfHeight ? topZ - ((topZ - bottomZ) * 0.5)
        : topZ;
  }

  /**
   * Set the point from which this token is being viewed and construct the viewable faces.
   * Determines how many faces are visible.
   * @param {Point3d} viewingPoint
   */
  setViewingPoint(viewingPoint) {
    this.viewingPoint = viewingPoint;
    this.faces = this._viewableFaces(viewingPoint);
  }

  /**
   * Set the view matrix used to transform the faces and transform the faces.
   * @param {Matrix} M
   */
  setViewMatrix(M) {
    this.faces.forEach(f => f.setViewMatrix(M));
    this.viewIsSet = true;
  }

  /**
   * Get the top, bottom and sides viewable from a given 3d position in space.
   * @param {Point3d} viewingPoint
   * @returns {object}  Object with properties:
   *   {Points3d|undefined} top
   *   {Points3d|undefined} bottom
   *   {Points3d[]} sides
   */
  _viewableFaces(viewingPoint) {
    const sides = this._viewableSides(viewingPoint);

    if ( viewingPoint.z > this.topZ ) sides.push(this.topSide);
    else if ( viewingPoint.z < this.bottomZ ) sides.push(this.bottomSide);

    return sides;
  }

  /*
   * Transform the faces to a 2d perspective.
   * @returns {PIXI.Point[][]}
   */
  perspectiveTransform() {
    return this.faces.map(side => side.perspectiveTransform())
  }

  /**
   * Determine which edges of the token polygon are viewable in a 2d sense.
   * Viewable if the line between center and edge points is not blocked.
   * For now, this returns the points.
   * TODO: Depending on token shape, it may be faster to return indices and only keep the unique points.
   * @param {Point3d} viewingPoint
   * @returns {Point3d[][]} Array of sides, each containing 4 points.
   */
  _viewableSides(viewingPoint) {
    const { topSide, bottomSide, borderPolygon, token } = this;
    const topPoints = topSide.points;
    const bottomPoints = bottomSide.points;

    const keys = borderPolygon.viewablePoints(viewingPoint, { returnKeys: true });
    const nSides = keys.length - 1;
    const sides = Array(nSides);
    for ( let i = 0; i < nSides; i += 1 ) {
      const t0 = topPoints[keys[i]];
      const t1 = topPoints[keys[i+1]];
      const b0 = bottomPoints[keys[i]];
      const b1 = bottomPoints[keys[i+1]];
      sides[i] = [t0, b0, b1, t1];
    }

    const sideType = TokenSidePoints3d.SIDE_TYPES.SIDE;
    return sides.map(s => new TokenSidePoints3d(token, s, sideType));
  }

  /**
   * Draw the constrained token shape and the points on the 2d canvas.
   */
  draw(drawingOptions = {}) {
    drawing.drawShape(this.tokenPolygon, drawingOptions);
    if ( this.viewingPoint ) drawing.drawSegment(
      { A: this.viewingPoint, B: this.token.center },
      { color: drawing.COLORS.blue, alpha: 0.5 });
    this.topSide.draw(drawingOptions);
  }

  /**
   * Draw the transformed faces.
   * @param {object} [options]
   * @param {boolean} [perspective]   Draw using 2d perspective.
   */
  drawTransformed({perspective = true, color = drawing.COLORS.red, width = 1, fill = null, fillAlpha = 0.2 } = {}) {
    if ( !this.viewIsSet ) {
      console.warn(`TokenPoints3d: View is not yet set for Token ${this.token.name}.`);
      return;
    }

    this.faces.forEach(f => f.draw({ perspective, color, width, fill, fillAlpha }));
  }
}
