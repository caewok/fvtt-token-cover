import { orient2dPixel } from "./util.js";

/**
 * Iterate over the polygon's {x, y} points in order.
 * If the polygon is closed and close is false,
 * the last two points (which should equal the first two points) will be dropped.
 * Otherwise, all points will be returned regardless of the close value.
 * @returns {x, y} PIXI.Point
 */
function* iteratePoints({close = true} = {}) {
  const dropped = (!this.isClosed || close) ? 0 : 2;
  const ln = this.points.length - dropped;
  for (let i = 0; i < ln; i += 2) {
    yield new PIXI.Point(this.points[i], this.points[i + 1]);
  }
}

/**
 * Iterate over the polygon's edges in order.
 * If the polygon is closed and close is false,
 * the last two points (which should equal the first two points) will be dropped and thus
 * the final edge closing the polygon will be ignored.
 * Otherwise, all edges, including the closing edge, will be returned regardless of the
 * close value.
 * @returns Return an object { A: {x, y}, B: {x, y}} for each edge
 * Edges link, such that edge0.B === edge.1.A.
 */
function* iterateEdges({close = true} = {}) {
  // Very similar to iteratePoints
  const dropped = (!this.isClosed || close) ? 0 : 2;
  const ln = this.points.length;
  const iter = ln - dropped;
  for (let i = 0; i < iter; i += 2) {
    const j = (i + 2) % ln;

    yield {
      A: new PIXI.Point(this.points[i], this.points[i + 1]),
      B: new PIXI.Point(this.points[j], this.points[j + 1])
    };
  }
}

/**
 * Area of polygon
 * @returns {number}
 */
function area() {
  const path = this.toClipperPoints();
  return Math.abs(ClipperLib.Clipper.Area(path));
}

/**
 * Test if a line or lines crosses the closed polygon shape.
 * Determine by moving clockwise around the polygon.
 * At each edge, determine if the turn to the next edge would be more clockwise than the line.
 * @param {object[]} lines    Array of lines, with A and B PIXI.Points.
 * @returns {boolean}
 */
function linesCross(lines) {
  const fu = foundry.utils;
  if ( !this.isClockwise ) this.reverseOrientation();

  const edges = this.iterateEdges();
  let currEdge = edges.next().value;
  for ( const nextEdge of edges ) {
    const { A: currA, B: currB } = currEdge;
    const { A: nextA, B: nextB } = nextEdge;

    for ( const line of lines ) {
      const { A: lnA, B: lnB } = line;

      if ( !fu.lineSegmentIntersects(currA, currB, lnA, lnB) ) continue;
      const ix = fu.lineLineIntersection(currA, currB, lnA, lnB);
      if ( currA.almostEqual(ix) ) continue;

      if ( currB.almostEqual(line.A) ) {
        if ( fu.orient2dFast(currA, currB, lnB) < 0
          && fu.orient2dFast(nextA, nextB, lnB) < 0 ) return true;
        continue;
      }

      if ( currEdge.B.almostEqual(line.B) ) {
        if ( fu.orient2dFast(currA, currB, lnA) < 0
          && fu.orient2dFast(nextA, nextB, lnA) < 0 ) return true;
        continue;
      }

      if ( fu.orient2dFast(currA, currB, lnA) < 0 ) {
        if ( fu.orient2dFast(nextA, nextB, lnA) < 0 ) return true;
        continue;
      }

      if ( fu.orient2dFast(currA, currB, lnB) < 0 ) {
        if ( fu.orient2dFast(nextA, nextB, lnB) < 0 ) return true;
        continue;
      }
    }

    currEdge = nextEdge;
  }

  return false;
}

/**
 * Test whether the polygon is oriented clockwise.
 * @returns {boolean}
 */
function isClockwise() {
  if ( typeof this._isClockwise === "undefined") {
    const path = this.toClipperPoints();
    this._isClockwise = ClipperLib.Clipper.Orientation(path);
  }
  return this._isClockwise;
}

function reverseOrientation() {
  const reversed_pts = [];
  const pts = this.points;
  const ln = pts.length - 2;
  for (let i = ln; i >= 0; i -= 2) {
    reversed_pts.push(pts[i], pts[i + 1]);
  }
  this.points = reversed_pts;
  if ( typeof this._isClockwise !== "undefined" ) this._isClockwise = !this._isClockwise;
  return this;
}


// ----------------  ADD METHODS TO THE PIXI.POLYGON PROTOTYPE --------------------------
export function registerPIXIPolygonMethods() {

  /**
   * Determine if a polygon is oriented clockwise, meaning tracing the polygon
   * moves in a clockwise direction.
   * This getter relies on a cached property, _isClockwise.
   * If you know the polygon orientation in advance, you should set this._isClockwise to avoid
   * this calculation.
   * This will close the polygon.
   * @type {boolean}
   */
  if ( !Object.hasOwn(PIXI.Polygon.prototype, "isClockwise") ) {

    Object.defineProperty(PIXI.Polygon.prototype, "isClockwise", {
      get: isClockwise,
      enumerable: false
    });

  }

  /**
   * Reverse the order of the polygon points.
   * @returns {PIXI.Polygon}
   */
  Object.defineProperty(PIXI.Polygon.prototype, "reverseOrientation", {
    value: reverseOrientation,
    writable: true,
    configurable: true
  });

  Object.defineProperty(PIXI.Polygon.prototype, "iteratePoints", {
    value: iteratePoints,
    writable: true,
    configurable: true
  });

  Object.defineProperty(PIXI.Polygon.prototype, "iterateEdges", {
    value: iterateEdges,
    writable: true,
    configurable: true
  });

  Object.defineProperty(PIXI.Polygon.prototype, "area", {
    value: area,
    writable: true,
    configurable: true
  });

  Object.defineProperty(PIXI.Polygon.prototype, "linesCross", {
    value: linesCross,
    writable: true,
    configurable: true
  });

}

