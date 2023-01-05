/* globals
PIXI,
foundry,
ClipperPaths,
CONFIG
*/
"use strict";

import { PlanePoints3d } from "./PlanePoints3d.js";
import { Point3d } from "../geometry/3d/Point3d.js";
import { Draw } from "../geometry/Draw.js";

/**
 * Points oriented horizontally on the canvas.
 * Basically a polygon, but this.points holds Points3d with z values all equal.
 */
export class HorizontalPoints3d extends PlanePoints3d {
  /**
   * Construct horizontal points from a PIXI rectangle
   * @param {PIXI.Rectangle} r    Rectangle to convert to points
   * @param {object} [options]    Options that affect what part of token is used
   * @param {string} [options.elevation]  Elevation to use for the face. Defaults to 0.
   * @param {object} [options.object]     Object to pass to constructor, if not rectangle.
   * @returns {HorizontalPoints3d}
   */
  static fromPIXIRectangle(r, { elevation = 0, object = r } = {}) {
    return new this(object, [
      new Point3d(r.x, r.y, elevation),
      new Point3d(r.x + r.width, r.y, elevation),
      new Point3d(r.x + r.width, r.y + r.height, elevation),
      new Point3d(r.x, r.y + r.height, elevation)
    ]);
  }

  /**
   * Construct horizontal points from top or bottom of token
   * @param {Token} token   Token to use
   * @param {object} [options]    Options that affect what part of token is used
   * @param {string} [options.elevation]      Elevation to use for the face. Defaults to token.topZ.
   * @param {boolean} [options.constrained]   If true, use the constrained border
   */
  static fromToken(token, { elevation = token.topZ, constrained = false } = {}) {
    const border = constrained ? token.constrained : token.bounds;
    if ( border instanceof PIXI.Rectangle ) return this.fromPIXIRectangle(border, { elevation, object: token});
    return new this(token, [...border.iteratePoints({close: false})]);
  }

  /**
   * Convert to a polygon
   * @returns {PIXI.Polygon}
   */
  toPolygon() { return new PIXI.Polygon(this.points); }

  /**
   * Convert to PIXI shape: rectangle if 4 points in line, polygon otherwise.
   * This will drop the elevation dimension.
   * @return {PIXI.Polygon|PIXI.Rectangle}
   */
  toPIXIShape() {
    const points = this.points;

    if ( points.length === 4 ) {
      const A = points[0];
      const B = points[1];
      const C = points[2];
      const D = points[3];
      const minX = Math.min(A.x, B.x, C.x, D.x);
      const minY = Math.min(A.y, B.y, C.y, D.y);
      const maxX = Math.max(A.x, B.x, C.x, D.x);
      const maxY = Math.max(A.y, B.y, C.y, D.y);

      // If any point is not minX/maxX and minY/maxY, we don't have a PIXI.Rectangle.
      if ( (A.x === minX || A.x === maxX) && (A.y === minY || A.y === maxY)
        && (B.x === minX || B.x === maxX) && (B.y === minY || B.y === maxY)
        && (C.x === minX || C.x === maxX) && (C.y === minY || C.y === maxY)
        && (D.x === minX || D.x === maxX) && (D.y === minY || D.y === maxY) ) {
        return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
      }
    }
    return new PIXI.Polygon(points);
  }

  /** @type {number} */
  get z() { return this.points[0].z; }

  /**
   * Are these points within a horizontal 2d triangle?
   * Points on the edge do not count as within.
   * @param {PIXI.Polygon} poly   Polygon to test
   * @param {object} [options]    Options that affect the calculation
   * @param {object[]} [options.edges]            Optional array of edges for the triangle
   * @param {boolean} [options.useBottomPoints]   If true, use bottom points instead of top
   * @returns {boolean}
   */
  isWithin2dConvexPolygon(poly, { edges } = {}) {
    edges ??= [...poly.iterateEdges({ close: true })];
    const thisEdges = this.iterateEdges();

    for ( const thisEdge of thisEdges ) {
      const A = thisEdge.A;
      const B = thisEdge.B;

      let Acontained = true;
      let Bcontained = true;
      let AisEndpoint = false;
      let BisEndpoint = false;
      for ( const edge of edges ) {
        // For a point to be contained in a convex polygon, it must be clockwise to every edge.
        // (orientation of 0 means the point is on the edge.)
        const oA = foundry.utils.orient2dFast(edge.A, edge.B, A);
        const oB = foundry.utils.orient2dFast(edge.A, edge.B, B);

        if ( oA && oB ) {
          // Test for possible intersection. On line doesn't count here.
          // See foundry.utils.lineSegmentIntersects
          const xab = (oA * oB) < 0;
          const oC = foundry.utils.orient2dFast(A, B, edge.A);
          const oD = foundry.utils.orient2dFast(A, B, edge.B);
          const xcd = (oC * oD) < 0;

          // If an intersection is found, we are done.
          if ( xab && xcd ) return true;
        }

        Acontained &&= oA > 0;
        Bcontained &&= oB > 0;

        // Track whether A or b are near equivalent to endpoints of the polygon.
        AisEndpoint ||= edge.A.almostEqual(A);
        BisEndpoint ||= edge.B.almostEqual(B);
      }

      if ( Acontained ^ Bcontained ) {
        if ( !Acontained && BisEndpoint ) continue;
        if ( !Bcontained && AisEndpoint ) continue;
      }

      if ( Acontained || Bcontained ) return true;
    }
    return false;
  }

  /**
   * Does the wall potentially block the viewer from the target
   * @param {Point3d} viewerLoc   Coordinates of viewer
   * @param {Token} target        Target token
   * @param {object} targetPts    Optional Point3d.fromToken() result for the target
   * @returns {boolean}
   */
  potentiallyBlocksToken(viewerLoc, target, targetPts) {
    const z = this.z;
    targetPts ??= Point3d.fromToken(target);
    viewerLoc.z ??= 0;

    // Check the z dimension: must be between viewer and target
    if ( viewerLoc.z < z && targetPts.top.z < z ) return false;
    if ( viewerLoc.z > z && targetPts.bottom.z > z ) return false;

    // Test each edge to see if it lies between viewer and target
    const edgesIter = this.iterateEdges();
    let viewerCW = true;
    let targetCW = true;
    for ( const edge of edgesIter ) {
      const oABviewer = foundry.utils.orient2dFast(edge.A, edge.B, viewerLoc);
      const oABtarget = foundry.utils.orient2dFast(edge.A, edge.B, target.center);

      // If viewer and target on opposite sides, then it potentially blocks
      if ( (oABviewer * oABtarget) < 0 ) return true;

      viewerCW &&= oABviewer < 0;
      targetCW &&= oABtarget < 0;
    }

    // If viewer or target is always clockwise, then it potentially blocks
    if ( viewerCW || targetCW ) return true;
    return false;
  }

  /**
   * Split the horizontal points if they intersect a token shape.
   * @param {Token} target          Token to test for intersecting walls
   * @returns {}
   */
  splitAtTokenIntersections(target) {
    const splits = {
      inside: null,
      outside: [],
      full: null
    };

    if ( target.topZ < this.z
      || target.bottomZ > this.z ) {
      splits.full = this;
      return splits;
    }

    // Use intersect to get portions of this plane that are inside the target
    const thisShape = this.toPIXIShape();
    const targetShape = target.constrained;

    // We can shortcut the calculation if both are PIXI.Rectangles
    let intersect;
    let diff;
    if ( thisShape instanceof PIXI.Rectangle && targetShape instanceof PIXI.Rectangle ) {
      intersect = thisShape.intersection(targetShape);
      if ( !intersect.width || !intersect.height ) {
        splits.outside = [this];
        return splits;
      }
      diff = thisShape.difference(targetShape).thisDiff;

    } else {
      intersect = thisShape.intersectPolygon(targetShape);
      const paths = ClipperPaths.fromPolygons([thisShape.toPolygon()]);
      const diffPaths = paths.diffPolygon(targetShape.toPolygon());
      diff = diffPaths.toPolygons();
    }

    splits.inside = intersect.toPolygon();
    splits.outside = [...diff];
    return splits;
  }

  /**
   * Helper method to test for splits and return only those needed for the particular
   * visibility setup.
   * @param {Token} target                    Token to test for intersecting walls
   * @param {PIXI.Polygon} viewableTriangle   Polygon triangle to test
   * @param {object} [options]                Options that affect the test.
   * @param {object[]} [options.edges]        Array of edges for the triangle, {A: Point, B: Point}.
    * @param {Point3d} [options.viewerLoc]    Coordinates of viewer
   * @param {}
   */
  _getVisibleSplits(target, viewableTriangle, { triEdges, viewerLoc } = {}) {
    triEdges ??= [...viewableTriangle.iterateEdges()];

    // If the shape intersects the target token, break shape into parts.
    const splits = this.splitAtTokenIntersections(target);
    if ( splits.full ) return splits.full;

    // Drop any outside splits that are not within the 2d triangle
    splits.outside = splits.outside.filter(pts => pts.isWithin2dConvexPolygon(viewableTriangle, triEdges));

    // If the inside split is blocking, keep it
    const out = [];
    if ( splits.inside && viewerLoc
      && splits.inside.potentiallyBlocksToken(viewerLoc, target) ) out.push(splits.inside);

    if ( splits.outside.length ) out.push(...splits.outside);

    return out;
  }

  /**
   * Draw the shape on the 2d canvas
   */
  draw(drawingOptions = {}) {
    const convert = CONFIG.GeometryLib.utils.pixelsToGridUnits;
    Draw.shape(this.toPolygon());
    this.points.forEach(pt => Draw.point(pt, drawingOptions));
    Draw.labelPoint(this.A, `${convert(this.A.z)}`);
    Draw.labelPoint(this.B, `${convert(this.B.z)}`);
    Draw.labelPoint(this.C, `${convert(this.C.z)}`);
    Draw.labelPoint(this.D, `${convert(this.D.z)}`);
  }
}
