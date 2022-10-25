/* globals
game,
foundry,
PIXI,
canvas
*/
"use strict";

import { MODULE_ID } from "./const.js";
import { SETTINGS, getSetting } from "./settings.js";
import { log } from "./util.js";
import { Shadow } from "./Shadow.js";
import { ClipperPaths } from "./ClipperPaths.js";
import * as drawing from "./drawing.js";


/* Area 2d
1. Center point shortcut:
  -- Center is visible, then at least 50% of the token must be visible
  -- Because we are constraining the top/bottom token shape, so center always there.
2. Constrain the target shape by any overlapping walls.
3. Construct LOS polygon with shadows.
  -- Looking down: from elevation of target top
  -- Looking up: from elevation of target bottom
  -- In between: use both; take the best one.
4. PercentArea 0 shortcut: Try testing for a breach of the LOS boundary.
5. Intersect the LOS against the constrained target shape. Measure area.
6. Calculate intersected area / constrained target shape area.

*/

export class Area2d {
  /**
   * @param {VisionSource} visionSource
   * @param {Token} target
   */
  constructor(visionSource, target) {
    this.visionSource = visionSource;
    this.target = target;
    this.debug = game.modules.get(MODULE_ID).api.debug;

    this.percentAreaForLOS = getSetting(SETTINGS.LOS.PERCENT_AREA);
  }

  /**
   * Determine whether a visionSource has line-of-sight to a target based on the percent
   * area of the target visible to the source.
   * @param {boolean} centerPointIsVisible
   * @returns {boolean}
   */
  hasLOS(centerPointIsVisible) {
    const percentArea = this.percentAreaForLOS;

    // If less than 50% of the token area is required to be viewable, then
    // if the center point is viewable, the token is viewable from that source.
    if ( centerPointIsVisible && percentArea < 0.50 ) return true;

    // If more than 50% of the token area is required to be viewable, then
    // the center point must be viewable for the token to be viewable from that source.
    // (necessary but not sufficient)
    if ( !centerPointIsVisible && percentArea >= 0.50 ) return false;

    const constrained = this.target.constrainedTokenShape;
    const shadowLOS = this._buildShadowLOS();

    if ( percentArea === 0 ) {
      // If percentArea equals zero, it might be possible to skip intersectConstrainedShapeWithLOS
      // and instead just measure if a token boundary has been breached.

      const bottomTest = shadowLOS.bottom ? this._targetBoundsTest(shadowLOS.bottom, constrained) : undefined;
      if ( bottomTest ) return true;

      const topTest = shadowLOS.top ? this._targetBoundsTest(shadowLOS.top, constrained) : undefined;
      if ( topTest ) return true;

      if ( typeof bottomTest !== "undefined" || typeof topTest !== "undefined" ) return false;
    }

    const percentVisible = this.percentAreaVisible(shadowLOS);
    if ( percentVisible.almostEqual(0) ) return false;

    return (percentVisible > percentArea) || percentVisible.almostEqual(percentArea);
  }

  /**
   * For polygon shapes, measure if a token boundary has been breached by line-of-sight.
   * @param {PIXI.Polygon|ClipperPaths} los                       Viewer line-of-sight
   * @param {PIXI.Polygon|PIXI.Rectangle} constrainedTokenShape   Token shape constrained by walls.
   */
  _targetBoundsTest(los, tokenShape) {
    if ( los instanceof ClipperPaths ) los.simplify();
    if ( los instanceof ClipperPaths ) return undefined;

    const hasLOS = this._sourceIntersectsPolygonBounds(los, tokenShape);
    this.debug && drawing.drawShape(los, { color: drawing.COLORS.blue }); // eslint-disable-line no-unused-expressions
    this.debug && drawing.drawShape(tokenShape, { color: hasLOS ? drawing.COLORS.green : drawing.COLORS.red }); // eslint-disable-line no-unused-expressions
    return hasLOS;
  }

  /**
   * Does the source intersect the bounding box?
   * @param {PIXI.Polygon} source
   * @param {PIXI.Rectangle} bbox
   * @return {boolean} True if the bbox intersects the source.
   */
  _sourceIntersectsBounds(source, bbox) {
    for ( const si of source.iterateEdges() ) {
      if ( bbox.lineSegmentIntersects(si.A, si.B,
        { intersectFn: foundry.utils.lineSegmentIntersects }) ) return true;
    }
    return false;
  }

  /**
   * Stricter intersection test between polygon and a constrained token bounds.
   * 1. Overlapping edges are not considered intersecting.
   * 2. endpoints that overlap the other segment are not considered intersecting.
   * 3. bounds rectangle used to skip edges
   *
   * (1) and (2) are to avoid situations in which the boundary polygon and the source polygon
   * are separated by a wall.
   */
  _sourceIntersectsPolygonBounds(source, bounds) {
    if ( bounds instanceof PIXI.Rectangle ) return this._sourceIntersectsBounds(source, bounds);
    const bbox = bounds.bounds;

    // TO-DO: should inside be true or false?
    const edges = [...source.iterateEdges()].filter(e => bbox.lineSegmentIntersects(e.A, e.B, { inside: true }));
    return bounds.linesCross(edges);
  }

  /**
   * Determine a percent area visible for the target based on the target bottom area,
   * target top area, or both. Varies based on relative position of visionSource to target.
   * @param {object{top: {PIXI.Polygon|undefined}, bottom: {PIXI.Polygon|undefined}}} shadowLOS
   * @returns {number}
   */
  percentAreaVisible(shadowLOS = this._buildShadowLOS) {
    const constrained = this.target.constrainedTokenShape;

    const targetPercentAreaBottom = shadowLOS.bottom ? this._calculatePercentSeen(shadowLOS.bottom, constrained) : 0;
    const targetPercentAreaTop = shadowLOS.top ? this._calculatePercentSeen(shadowLOS.top, constrained) : 0;
    return Math.max(targetPercentAreaBottom, targetPercentAreaTop);
  }

  /**
   * Depending on location of visionSource versus target, build one or two
   * line-of-sight polygons with shadows set to the top or bottom elevations for the target.
   * Viewer looking up: bottom of target
   * Viewer looking down: top of target
   * Viewer looking head-on: both. (Yes, slightly unrealistic.)
   * Target has no defined height: return top.
   * @returns {object{top: {PIXI.Polygon|undefined}, bottom: {PIXI.Polygon|undefined}}}
   */
  _buildShadowLOS() {
    const visionSource = this.visionSource;
    const target = this.target;

    // Test top and bottom of target shape.
    let bottom;
    let top;
    const inBetween = visionSource.elevationZ <= target.topZ && visionSource.elevationZ >= target.bottomZ;

    // If target has no height, return one shadowed LOS polygon based on target elevation.
    if ( !(target.topZ - target.bottomZ) ) return {
      top: this.shadowLOSForElevation(target.topZ)
    };

    if ( inBetween || visionSource.elevationZ < target.bottomZ ) {
      // Looking up at bottom
      bottom = this.shadowLOSForElevation(target.bottomZ);
    }

    if ( inBetween || visionSource.elevationZ > target.topZ ) {
      // Looking down at top
      top = this.shadowLOSForElevation(target.topZ);
    }

    return { bottom, top };
  }

  /**
   * Determine the percent area visible of a token shape given a los polygon.
   * @param {PIXI.Polygon} los
   * @param {PIXI.Polygon} tokenShape
   * @returns {number}
   */
  _calculatePercentSeen(los, tokenShape) {
    let visibleTokenShape = this._intersectShapeWithLOS(tokenShape, los);
    const seenArea = visibleTokenShape.area();
    if ( !seenArea || seenArea.almostEqual(0) ) return 0;

    const tokenArea = tokenShape.area();
    if ( !tokenArea || tokenArea.almostEqual(0) ) return 0;

    const percentSeen = seenArea / tokenArea;

    if ( this.debug ) {
      // Figure out if this percentage would result in a visible token
      const percentArea = getSetting(SETTINGS.LOS.PERCENT_AREA);
      const hasLOS = (percentSeen > percentArea) || percentSeen.almostEqual(percentArea);
      if ( los instanceof ClipperPaths ) los = los.simplify();
      if ( visibleTokenShape instanceof ClipperPaths ) visibleTokenShape = visibleTokenShape.simplify();

      if ( los instanceof ClipperPaths ) {
        const polys = los.toPolygons();
        for ( const poly of polys ) {
          drawing.drawShape(poly, { color: drawing.COLORS.blue, width: poly.isHole ? 1 : 2 });
        }
      } else {
        drawing.drawShape(los, { color: drawing.COLORS.blue, width: 2 });
      }

      if ( visibleTokenShape instanceof ClipperPaths ) {
        const polys = visibleTokenShape.toPolygons();
        for ( const poly of polys ) {
          drawing.drawShape(poly, { color: hasLOS ? drawing.COLORS.green : drawing.COLORS.red });
        }
      } else {
        drawing.drawShape(visibleTokenShape, { color: hasLOS ? drawing.COLORS.green : drawing.COLORS.red });
      }
    }

    return percentSeen;

  }

  /**
   * Intersect a shape with the line-of-sight polygon.
   * @param {PIXI.Polygon|PIXI.Rectangle} constrained
   * @param {PIXI.Polygon} los
   */
  _intersectShapeWithLOS(constrained, los) {
//     if ( constrained instanceof PIXI.Rectangle && los instanceof PIXI.Polygon ) {
//       // Weiler-Atherton is faster for intersecting regular shapes
//       // Use Clipper for now
//     }

    if ( constrained instanceof PIXI.Rectangle ) constrained = constrained.toPolygon();
    return los.intersectPolygon(constrained);
  }

  /**
   * Build a version of the visionSource LOS polygon with shadows included.
   * Shadows assume a specific elevation of the surface.
   * @param {number} targetElevation
   */
  shadowLOSForElevation(targetElevation = 0) {
    const visionSource = this.visionSource;
    const los = visionSource.los;
    const bounds = los.bounds;
    const collisionTest = (o, rect) => isFinite(o.t.topZ) || isFinite(o.t.bottomZ);  // eslint-disable-line no-unused-vars
    const walls = canvas.walls.quadtree.getObjects(bounds, { collisionTest });

    if ( !walls.size) {
      log("No limited walls; no shadows.");
  //     visionSource._losShadows.set(targetElevation, null);
      return los;
    }

    const origin = new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ);
    const shadows = [];
    for ( const wall of walls ) {
      const shadow = Shadow.constructFromWall(wall, origin, targetElevation);
      if ( shadow ) shadows.push(shadow);
    }

    const combined = Shadow.combinePolygonWithShadows(los, shadows);
  //   visionSource._losShadows.set(targetElevation, combined);
    return combined;
  }
}
