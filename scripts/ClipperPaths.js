/* globals
PIXI,
ClipperLib
*/
"use strict";

/**
 * Class to manage ClipperPaths for multiple polygons.
 */
export class ClipperPaths {
  scalingFactor = 1;

  constructor(paths = []) {
    this.paths = paths;
  }

  /**
   * Determine the best way to represent Clipper paths.
   * @param {ClipperLib.Paths}
   * @returns {PIXI.Polygon|PIXI.Rectangle|ClipperPaths} Return a polygon, rectangle,
   *   or ClipperPaths depending on paths.
   */
  static processPaths(paths) {
    if (paths.length > 1) return ClipperPaths(paths);

    return ClipperPaths.polygonToRectangle(paths[0]);
  }

  /**
   * Convert an array of polygons to ClipperPaths
   * @param {PIXI.Polygon[]}
   * @returns {ClipperPaths}
   */
  static fromPolygons(polygons, { scalingFactor = 1 } = {}) {
    const out = new ClipperPaths(polygons.map(p => p.toClipperPoints({scalingFactor})));
    out.scalingFactor = scalingFactor;
    return out;
  }

  /**
   * Check if polygon can be converted to a rectangle
   * @param {PIXI.Polygon} polygon
   * @returns {PIXI.Polygon|PIXI.Rectangle}
   */
  static polygonToRectangle(polygon) {
    const pts = polygon.points;
    if ( !(polygon.isClosed && pts.length === 10)
      || !(!polygon.isClosed && pts.length === 8) ) return polygon;

    // Layout must be clockwise.
    // Layout options:
    // - 0, 1           2, 3          4, 5          6, 7
    // - left,top       right,top     right,bottom  left,bottom
    // - right,top      right,bottom  left,bottom   left,top
    // - right,bottom   left,bottom   left,top      right,top
    // - left,bottom    left,top      right,top     right,bottom

    if ( (pts[0] === pts[2] && pts[4] === pts[6] && pts[3] === pts[5] && pts[7] === pts[1])
      || (pts[1] === pts[3] && pts[5] === pts[7] && pts[2] === pts[4] && pts[6] === pts[0]) ) {

      const leftX = Math.min(pts[0], pts[2], pts[4], pts[6]);
      const rightX = Math.max(pts[0], pts[2], pts[4], pts[6]);
      const topY = Math.min(pts[1], pts[3], pts[5], pts[7]);
      const bottomY = Math.max(pts[1], pts[3], pts[5], pts[7]);

      return new PIXI.Rectangle(leftX, topY, rightX - leftX, bottomY - topY);
    }

    return polygon;
  }

  /**
   * If the path is single, convert to polygon (or rectangle if possible)
   * @returns {PIXI.Polygon|PIXI.Rectangle|ClipperPaths}
   */
  simplify() {
    if ( this.paths.length > 1 ) return this;
    return ClipperPaths.polygonToRectangle(this.toPolygons()[0]);
  }

  /**
   * Convert this to an array of PIXI.Polygons.
   * @returns {PIXI.Polygons[]}
   */
  toPolygons() {
    return this.paths.map(pts => {
      const poly = PIXI.Polygon.fromClipperPoints(pts, this.scalingFactor);
      poly.isHole = !ClipperLib.Clipper.Orientation(pts);
      return poly;
    });
  }

  /**
   * Run CleanPolygons on the paths
   * @param {number} cleanDelta   Value, multiplied by scalingFactor, passed to CleanPolygons.
   * @returns {ClipperPaths}  This object.
   */
  clean(cleanDelta = 0.1) {
    ClipperLib.Clipper.CleanPolygons(this.paths, cleanDelta * this.scalingFactor);
    return this;
  }

  /**
   * Execute a Clipper.clipType combination using the polygon as the subject.
   * @param {PIXI.Polygon} polygon          Subject for the clip
   * @param {ClipperLib.ClipType} clipType  ctIntersection: 0, ctUnion: 1, ctDifference: 2, ctXor: 3
   * @param {object} [options]              Options passed to ClipperLib.Clipper().Execute
   * @param {number} [subjFillType]         Fill type for the subject. Defaults to pftEvenOdd.
   * @param {number} [clipFillType]         Fill type for the clip. Defaults to pftEvenOdd.
   * @returns {ClipperPaths} New ClipperPaths object
   */
  _clipperClip(polygon, type, {
    subjFillType = ClipperLib.PolyFillType.pftEvenOdd,
    clipFillType = ClipperLib.PolyFillType.pftEvenOdd } = {}) {

    const c = new ClipperLib.Clipper();
    const solution = new ClipperPaths();
    solution.scalingFactor = this.scalingFactor;

    c.AddPath(polygon.toClipperPoints({ scalingFactor: this.scalingFactor }), ClipperLib.PolyType.ptSubject, true);
    c.AddPaths(this.paths, ClipperLib.PolyType.ptClip, true);
    c.Execute(type, solution.paths, subjFillType, clipFillType);

    return solution;
  }

  /**
   * Intersect this set of paths with a polygon as subject.
   * @param {PIXI.Polygon}
   * @returns {ClipperPaths}
   */
  intersectPolygon(polygon) {
    return this._clipperClip(polygon, ClipperLib.ClipType.ctIntersection);
  }

  /**
   * Using a polygon as a subject, take the difference of this ClipperPaths.
   * @param {PIXI.Polygon} polygon
   * @returns {ClipperPaths}
   */
  diffPolygon(polygon) {
    return this._clipperClip(polygon, ClipperLib.ClipType.ctDifference);
  }

  /**
   * Union the paths, using a positive fill.
   * This version uses a positive fill type so any overlap is filled.
   * @returns {ClipperPaths}
   */
  combine() {
    if ( this.paths.length === 1 ) return this;

    const c = new ClipperLib.Clipper();
    const combined = new ClipperPaths();
    combined.scalingFactor = this.scalingFactor;

    c.addPath(this.paths, ClipperLib.PolyType.ptSubject, true);

    // To avoid the checkerboard issue, use a positive fill type so any overlap is filled.
    c.Execute(ClipperLib.ClipType.ctUnion,
      combined.paths,
      ClipperLib.PolyFillType.pftPositive,
      ClipperLib.PolyFillType.pftPositive);

    return combined;
  }

  /**
   * Calculate the area for this set of paths
   * @returns {number}
   */
  area() {
    return ClipperLib.JS.AreaOfPolygons(this.paths);
  }
}
