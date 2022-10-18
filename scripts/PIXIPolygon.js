/* globals
PIXI,
ClipperLib,
foundry
*/
"use strict";

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

/**
 * Use Clipper to pad (offset) polygon by delta.
 * @returns {PIXI.Polygon}
 */
function pad(delta, { miterLimit = 2, scalingFactor = 1 } = {}) {
  if ( miterLimit < 2) {
    console.warn("miterLimit for PIXI.Polygon.prototype.offset must be ≥ 2.");
    miterLimit = 2;
  }

  const solution = new ClipperLib.Paths();
  const c = new ClipperLib.ClipperOffset(miterLimit);
  c.AddPath(this.toClipperPoints({scalingFactor}), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  c.Execute(solution, delta);
  return PIXI.Polygon.fromClipperPoints(solution.length ? solution[0] : [], {scalingFactor});
}

/**
 * Convex hull algorithm.
 * Returns a polygon representing the convex hull of the given points.
 * Excludes collinear points.
 * Runs in O(n log n) time
 * @param {PIXI.Point[]} points
 * @returns {PIXI.Polygon}
 */
function convexhull(points) {
  const ln = points.length;
  if ( ln <= 1 ) return points;

  const newPoints = [...points];
  newPoints.sort(convexHullCmpFn);

  // Andrew's monotone chain algorithm.
  const upperHull = [];
  for ( let i = 0; i < ln; i += 1 ) {
    testHullPoint(upperHull, newPoints[i]);
  }
  upperHull.pop();

  const lowerHull = [];
  for ( let i = ln - 1; i >= 0; i -= 1 ) {
    testHullPoint(lowerHull, newPoints[i]);
  }
  lowerHull.pop();

  if ( upperHull.length === 1
    && lowerHull.length === 1
    && upperHull[0].x === lowerHull[0].x
    && upperHull[0].y === lowerHull[0].y ) return new PIXI.Polygon(upperHull);

  return new PIXI.Polygon(upperHull.concat(lowerHull));
}

function convexHullCmpFn(a, b) {
  const dx = a.x - b.x;
  return dx ? dx : a.y - b.y;
}

/**
 * Test the point against existing hull points.
 * @parma {PIXI.Point[]} hull
 * @param {PIXI.Point} point
*/
function testHullPoint(hull, p) {
  while ( hull.length >= 2 ) {
    const q = hull[hull.length - 1];
    const r = hull[hull.length - 2];
    // TO-DO: Isn't this a version of orient2d? Replace?
    if ( (q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x) ) hull.pop();
    else break;
  }
  hull.push(p);
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

  Object.defineProperty(PIXI.Polygon.prototype, "pad", {
    value: pad,
    writable: true,
    configurable: true
  });

  Object.defineProperty(PIXI.Polygon, "convexhull", {
    value: convexhull,
    writable: true,
    configurable: true
  });

}

