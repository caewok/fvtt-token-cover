/* globals
game,
foundry,
PIXI,
objectsEqual,
Token
*/
"use strict";

import { MODULE_ID } from "./const.js";
import { getObjectProperty } from "./util.js";
import { SETTINGS, getSetting } from "./settings.js";
import { Area3d} from "./Area3d.js";
import { CWSweepInfiniteWallsOnly } from "./CWSweepInfiniteWallsOnly.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

import { Shadow } from "./geometry/Shadow.js";
import { ClipperPaths } from "./geometry/ClipperPaths.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { Draw } from "./geometry/Draw.js";

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

  /** @type {VisionSource} */
  visionSource;

  /** @type {Token} */
  target;

  /** @type {boolean} */
  debug = false;

  /** @type {object} */
  config = {};

  /**
   * Scaling factor used with Clipper
   */
  static SCALING_FACTOR = 100;

  /**
   * @param {VisionSource} visionSource
   * @param {Token} target
   */
  constructor(visionSource, target, {
    type = "sight",
    liveTokensBlock = false,
    deadTokensBlock = false,
    deadHalfHeight = false } = {}) {

    this.visionSource = visionSource instanceof Token ? visionSource.vision : visionSource;
    this.target = target;

    // Configuration options
    this.config = {
      type,
      percentAreaForLOS: getSetting(SETTINGS.LOS.PERCENT_AREA),
      tokensBlock: liveTokensBlock || deadTokensBlock,
      liveTokensBlock,
      deadTokensBlock,
      deadHalfHeight
    };

    this.debug = game.modules.get(MODULE_ID).api.debug.area;
  }

  /**
   * Determine whether a visionSource has line-of-sight to a target based on the percent
   * area of the target visible to the source.
   * @param {boolean} centerPointIsVisible
   * @returns {boolean}
   */
  hasLOS(centerPointIsVisible) {
    const percentArea = this.config.percentAreaForLOS;

    // If less than 50% of the token area is required to be viewable, then
    // if the center point is viewable, the token is viewable from that source.
    if ( centerPointIsVisible && percentArea < 0.50 ) {
      if ( this.debug ) Draw.point(this.target.center, {
        alpha: 1,
        radius: 3,
        color: Draw.COLORS.green });

      return true;
    }

    // If more than 50% of the token area is required to be viewable, then
    // the center point must be viewable for the token to be viewable from that source.
    // (necessary but not sufficient)
    if ( !centerPointIsVisible && percentArea >= 0.50 ) {
      if ( this.debug ) Draw.point(this.target.center, {
        alpha: 1,
        radius: 3,
        color: Draw.COLORS.red });
      return false;
    }

    const constrained = ConstrainedTokenBorder.get(this.target, this.config.type).constrainedBorder();

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
   * @param {PIXI.Polygon|PIXI.Rectangle} tokenShape   Token shape constrained by walls.
   */
  _targetBoundsTest(los, tokenShape) {
    if ( los instanceof ClipperPaths ) los.simplify();
    if ( los instanceof ClipperPaths ) return undefined;

    const hasLOS = this._sourceIntersectsPolygonBounds(los, tokenShape);
    this.debug && Draw.drawShape(los, { color: Draw.COLORS.blue }); // eslint-disable-line no-unused-expressions
    this.debug && Draw.drawShape(tokenShape, { color: hasLOS ? Draw.COLORS.green : Draw.COLORS.red }); // eslint-disable-line no-unused-expressions
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
  percentAreaVisible(shadowLOS) {
    shadowLOS ??= this._buildShadowLOS();

    const constrained = ConstrainedTokenBorder.get(this.target, this.config.type).constrainedBorder();

    const targetPercentAreaBottom = shadowLOS.bottom ? this._calculatePercentSeen(shadowLOS.bottom, constrained) : 0;
    const targetPercentAreaTop = shadowLOS.top ? this._calculatePercentSeen(shadowLOS.top, constrained) : 0;

    if ( this.debug && shadowLOS.bottom ) console.log(`${this.visionSource.object.name} sees ${targetPercentAreaBottom * 100}% of ${this.target.name}'s bottom (Area2d).`);
    if ( this.debug && shadowLOS.top ) console.log(`${this.visionSource.object.name} sees ${targetPercentAreaTop * 100}% of ${this.target.name}'s top (Area2d).`);

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

    if ( top && bottom && objectsEqual(top.points, bottom.points) ) return { top };

    return { bottom, top };
  }

  /**
   * Create ClipperPaths that combine tiles with drawings holes.
   * Comparable to Area3d._combineBlockingTiles
   * @param {Set<Tile>} tiles
   * @param {Set<CenteredPolygonBase>} drawings
   * @returns {ClipperPaths}
   */
  _combineTilesWithDrawingHoles(tiles, drawings) {
    if ( !tiles.size ) return undefined;

    tiles.forEach(t => {
      const { x, y, width, height } = t.document;
      const pts = [
        x, y,
        x + width, y,
        x + width, y + width,
        x, y + height
      ];
      t._polygon = new PIXI.Polygon(pts);
    });

    if ( !drawings.size ) {
      tiles = ClipperPaths.fromPolygons(tiles, {scalingFactor: Area2d.SCALING_FACTOR});
      tiles.combine().clean();
      return tiles;
    }

    // Check if any drawings might create a hole in one or more tiles
    const tilesUnholed = [];
    const tilesHoled = [];
    for ( const tile of tiles ) {
      const drawingHoles = [];
      const tileE = tile.document.elevation;

      for ( const drawing of drawings ) {
        const minE = drawing.document.getFlag("levels", "rangeTop");
        const maxE = drawing.document.getFlag("levels", "rangeBottom");
        if ( minE == null && maxE == null ) continue; // Intended to test null, undefined
        else if ( minE == null && tileE !== maxE ) continue;
        else if ( maxE == null && tileE !== minE ) continue;
        else if ( !tileE.between(minE, maxE) ) continue;

        const shape = CONFIG.GeometryLib.utils.centeredPolygonFromDrawing(drawing);
        drawingHoles.push(shape.toPolygon());
      }

      if ( drawingHoles.length ) {
        // Construct a hole at the tile's elevation from the drawing taking the difference.
        const drawingHolesPaths = ClipperPaths.fromPolygons(drawingHoles, {scalingFactor: Area2d.SCALING_FACTOR});
        const tileHoled = drawingHolesPaths.diffPolygon(tile._polygon);
        tilesHoled.push(tileHoled);
      } else tilesUnholed.push(tile);
    }

    if ( tilesUnholed.length ) {
      const unHoledPaths = ClipperPaths.fromPolygons(tilesUnholed, {scalingFactor: Area2d.SCALING_FACTOR});
      unHoledPaths.combine().clean();
      tilesHoled.push(...unHoledPaths);
    }

    // Combine all the tiles, holed and unholed
    tiles = ClipperPaths.combinePaths(tilesHoled);
    tiles.combine().clean();
    return tiles;
  }

  /**
   * Determine the percent area visible of a token shape given a los polygon.
   * @param {PIXI.Polygon} los
   * @param {PIXI.Polygon} tokenShape
   * @returns {number}
   */
  _calculatePercentSeen(los, tokenShape) {
    let visibleTokenShape = this._intersectShapeWithLOS(tokenShape, los);

    if ( !visibleTokenShape ) return 0;

    if ( !(visibleTokenShape instanceof PIXI.Polygon) ) {
      console.warn("_calculatePercentSeen: visibleTokenShape is not a polygon.");
    }

    // If Levels is enabled, consider tiles and drawings; obscure the visibile token shape.
    if ( game.modules.get("levels")?.active ) {
      let tiles = Area3d.filterTilesByVisionTriangle(visibleTokenShape);

      // Limit to tiles between viewer and target.
      const minEZ = Math.min(this.visionSource.elevationZ, this.target.bottomZ);
      const maxEZ = Math.max(this.visionSource.elevationZ, this.target.topZ);
      tiles = tiles.filter(tile => {
        const tileEZ = CONFIG.GeometryLib.utils.gridUnitsToPixels(tile.document.elevation);
        return tileEZ.between(minEZ, maxEZ);
      });

      if ( tiles.size ) {
        const drawings = Area3d.filterDrawingsByVisionTriangle(visibleTokenShape);
        const combinedTiles = this._combineTilesWithDrawingHoles(tiles, drawings);
        visibleTokenShape = visibleTokenShape instanceof PIXI.Polygon
          ? combinedTiles.diffPolygon(visibleTokenShape)
          : combinedTiles.diffPaths(visibleTokenShape);
      }
    }
    const seenArea = visibleTokenShape.scaledArea({scalingFactor: Area2d.SCALING_FACTOR});
    if ( !seenArea || seenArea.almostEqual(0) ) return 0;

    const tokenArea = tokenShape.scaledArea({scalingFactor: Area2d.SCALING_FACTOR});
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
          Draw.shape(poly, { color: Draw.COLORS.blue, width: poly.isHole ? 1 : 2 });
        }
      } else {
        Draw.shape(los, { color: Draw.COLORS.blue, width: 2 });
      }

      if ( visibleTokenShape instanceof ClipperPaths ) {
        const polys = visibleTokenShape.toPolygons();
        for ( const poly of polys ) {
          Draw.shape(poly, { color: hasLOS ? Draw.COLORS.green : Draw.COLORS.red });
        }
      } else {
        Draw.shape(visibleTokenShape, { color: hasLOS ? Draw.COLORS.green : Draw.COLORS.red });
      }
    }

    return percentSeen;
  }

  /**
   * Intersect a shape with the line-of-sight polygon.
   * @param {PIXI.Polygon|PIXI.Rectangle} constrained
   * @param {PIXI.Polygon|null} los
   */
  _intersectShapeWithLOS(constrained, los) {
    // TODO: Use Weiler-Atherton
    //     if ( constrained instanceof PIXI.Rectangle && los instanceof PIXI.Polygon ) {
    //       // Weiler-Atherton is faster for intersecting regular shapes
    //       // Use Clipper for now
    //     }

    if ( constrained instanceof PIXI.Rectangle ) constrained = constrained.toPolygon();
    const out = los.intersectPolygon(constrained);
    if ( out instanceof ClipperPaths ) {
      if ( !out.paths.length ) return null;
      return out.simplify();
    }

    if ( !out.points.length ) return null;
    return out;
  }

  /**
   * Build a version of the visionSource LOS polygon with shadows included.
   * Shadows assume a specific elevation of the surface.
   * @param {number} targetElevation
   */
  shadowLOSForElevation(targetElevation = 0) {
    const visionSource = this.visionSource;
    const origin = new Point3d(visionSource.x, visionSource.y, visionSource.elevationZ);
    const { type, tokensBlock, liveTokensBlock, deadTokensBlock, deadHalfHeight } = this.config;
    const hpAttribute = getSetting(SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE);

    // Find the walls and, optionally, tokens, for the triangle between origin and target
    const filterConfig = {
      type,
      filterWalls: true,
      filterTokens: tokensBlock,
      filterTiles: false,
      viewer: visionSource.object,
      debug: this.debug
    };
    const viewableObjs = Area3d.filterSceneObjectsByVisionTriangle(origin, this.target, filterConfig);

    if ( viewableObjs.tokens.size ) {
      // Filter live or dead tokens, depending on config.
      if ( liveTokensBlock ^ deadTokensBlock ) { // We handled tokensBlock above
        viewableObjs.tokens = viewableObjs.tokens.filter(t => {
          const hp = getObjectProperty(t.actor, hpAttribute);
          if ( typeof hp !== "number" ) return true;

          if ( liveTokensBlock && hp > 0 ) return true;
          if ( deadTokensBlock && hp <= 0 ) return true;
          return false;
        });
      }
    }

    // Note: Wall Height removes walls from LOS calculation if
    // 1. origin is above the top of the wall
    // 2. origin is below the bottom of the wall

    // In limited cases, we may need to re-do the LOS calc.
    // 1. origin is below top of wall and target is above top of wall.
    // 2. origin is above bottom of wall and target is below bottom of wall.
    // --> Both cases: wall may or may not shadow the target.
    // e.g., target next to wall at 0 ft but wall bottom is 10 ft. Viewer looking down
    // may be able to see the target depending on viewer distance.
    // We need an LOS calc that removes all limited walls; use shadows instead.
    // 3. Tokens are potentially blocking -- construct shadows based on those tokens
    let redoLOS = viewableObjs.tokens.size;
    const elevationZ = visionSource.elevationZ;
    redoLOS ||= viewableObjs.walls.some(w => {
      const { topZ, bottomZ } = w;
      return (elevationZ < topZ && targetElevation > topZ)
      || (elevationZ > bottomZ && targetElevation < bottomZ);
    });


    const losConfig = visionSource._getPolygonConfiguration();
    losConfig.type = this.config.type;
    if ( !redoLOS ) return visionSource._createPolygon(losConfig);

    // Rerun the LOS with infinite walls only
    const los = CWSweepInfiniteWallsOnly.create(origin, losConfig);

    const shadows = [];
    for ( const wall of viewableObjs.walls ) {
      const shadow = Shadow.constructFromWall(wall, origin, targetElevation);
      if ( shadow ) {
        shadows.push(shadow);
        if ( this.debug ) shadow.draw();
      }
    }

    // Add token borders as shadows if tokens block
    for ( const token of viewableObjs.tokens ) {
      let halfHeight = false;
      if ( deadHalfHeight ) {
        const hp = getObjectProperty(token.actor, hpAttribute);
        halfHeight = (typeof hp === "number") && (hp <= 0);
      }

      const tokenShadows = Shadow.constructfromToken(token, origin, { surfaceElevation: targetElevation, type, halfHeight });
      if ( tokenShadows && tokenShadows.length ) shadows.push(...tokenShadows);
      if ( this.debug ) tokenShadows.forEach(s => s.draw());
    }

    const combined = Shadow.combinePolygonWithShadows(los, shadows);
    // TODO: Caching visionSource._losShadows.set(targetElevation, combined);
    return combined;
  }
}
