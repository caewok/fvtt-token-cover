/* globals
PIXI,
canvas,
foundry,
Token,
CONST,
Ray,
LimitedAnglePolygon,
CONFIG
*/
"use strict";

/* Area 3d
Rotate canvas such that the view is the token looking directly at the target.
(Doom view)
- Y axis becomes the z axis. 0 is the token center.
- X axis is the line perpendicular to the line between token and target centers.

For target, use the constrained target points.

Walls:
- Transform all walls that intersect the boundary between token center and target shape
  in original XY coordinates.
- Construct shadows based on new rotated coordinates.

- Some points of the target and walls may be contained; find the perimeter. Use convex hull

Area:
- Unblocked target area is the denominator.
- Wall shapes block and shadows block. Construct the blocked target shape and calc area.
*/

import { MODULE_ID, FLAGS, MODULES_ACTIVE, DEBUG } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { log, getObjectProperty, buildTokenPoints } from "./util.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

import { Draw } from "./geometry/Draw.js"; // For debugging

import { ClipperPaths } from "./geometry/ClipperPaths.js";
import { Matrix } from "./geometry/Matrix.js";
import { Point3d } from "./geometry/3d/Point3d.js";

import { DrawingPoints3d } from "./PlaceablesPoints/DrawingPoints3d.js";
import { TokenPoints3d } from "./PlaceablesPoints/TokenPoints3d.js";
import { TilePoints3d } from "./PlaceablesPoints/TilePoints3d.js";
import { WallPoints3d } from "./PlaceablesPoints/WallPoints3d.js";

export class Area3d {

  /** @type {VisionSource} */
  viewer;

  /** @type {Point3d} */
  _viewerCenter;

  /** @type {Token} */
  target;

  /** @type {TokenPoints3d} */
  _targetTokenPoints3d;

  /** @type {Point3d} */
  _targetTop;

  /** @type {Point3d} */
  _targetBottom;

  /** @type {Point3d} */
  _targetCenter;

  /** @type object */
  config = {};

  /** @type {boolean} */
  debug = false;

  /**
   * Holds Foundry objects that are within the vision triangle.
   * @typedef BlockingObjects
   * @type {object}
   * @property {Set<Drawing>} drawing
   * @property {Set<Wall>}    terrainWalls
   * @property {Set<Tile>}    tiles
   * @property {Set<Token>}   tokens
   * @property {Set<Wall>}    walls
   */
  _blockingObjects = {
    drawings: new Set(),
    terrainWalls: new Set(),
    tiles: new Set(),
    tokens: new Set(),
    walls: new Set()
  };

  /**
   * Holds arrays of processed blocking points from _blockingObjects.
   * @typedef BlockingPoints
   * @type {object}
   * @type {object}:
   * @property {HorizontalPoints3d[]}   drawings
   * @property {VerticalPoints3d[]}     terrainWalls
   * @property {HorizontalPoints3d[]}   tiles
   * @property {(VerticalPoints3d|HorizontalPoints3d)[]}     tokens
   * @property {VerticalPoints3d[]}     walls
   */
  _blockingPoints = {
    drawings: [],
    terrainWalls: [],
    tiles: [],
    tokens: [],
    walls: []
  };

  /**
   * Debug/temp object that holds the converted Foundry blockingObjects as PlanePoints3d.
   * @typedef {BlockingObjectsPoints}
   * @type {object}:
   * @property {Set<DrawingPoints3d>} drawing
   * @property {Set<WallPoints3d>}    terrainWalls
   * @property {Set<TilePoints3d>}    tiles
   * @property {Set<TokenPoints3d>}   tokens
   * @property {Set<WallPoints3d>}    walls
   */
  _blockingObjectsPoints = {
    drawings: new Set(),
    terrainWalls: new Set(),
    tiles: new Set(),
    tokens: new Set(),
    walls: new Set()
  };

  /**
   * The viewable area between viewer and target.
   * Typically, this is a triangle, but if viewed head-on, it will be a triangle
   * with the portion of the target between viewer and target center added on.
   * @type {PIXI.Polygon}
   */
  _visionPolygon;

  /** @type {Point3d[]} */
  _transformedTarget;

  /** @type {object[]}  An object with A and B. */
  _transformedWalls;

  /** @type {Shadow[]} */
  wallShadows = [];

  /** @type {boolean} */
  _viewIsSet = false;

  /** @type {boolean} */
  _blockingObjectsAreSet = false;

  /** @type {boolean} */
  _blockingObjectsPointsAreSet = false;

  /** @type {boolean} */
  _blockingPointsAreSet = false;

  /**
   * Vector representing the up position on the canvas.
   * Used to construct the token camera and view matrices.
   * @type {Point3d}
   */
  static _upVector = new Point3d(0, 0, -1);

  /**
   * Scaling factor used with Clipper
   */
  static SCALING_FACTOR = 100;

  /**
   * @param {VisionSource|TOKEN} visionSource     Token, viewing from token.topZ.
   * @param {Target} target   Target; token is looking at the target center.
   */
  constructor(viewer, target, config = {}) {

    this.viewer = viewer instanceof Token ? viewer.vision : viewer;
    this.target = target;
    this._targetPoints = new TokenPoints3d(target);

    // Configuration options
    this.#configure(config);

    // Set debug only if the target is being targeted.
    // Avoids "double-vision" from multiple targets for area3d on scene.
    if ( DEBUG.area ) {
      const targets = canvas.tokens.placeables.filter(t => t.isTargeted);
      this.debug = targets.some(t => t === target);
    }
  }

   /**
   * Initialize the configuration for this constructor.
   * @param {object} config   Settings intended to override defaults.
   */
  #configure(config = {}) {
    const deadTokenAlg = getSetting(SETTINGS.COVER.DEAD_TOKENS.ALGORITHM);
    const deadTypes = SETTINGS.COVER.DEAD_TOKENS.TYPES;
    const liveTokenAlg = getSetting(SETTINGS.COVER.LIVE_TOKENS.ALGORITHM);
    const liveTypes = SETTINGS.COVER.LIVE_TOKENS.TYPES;

    config.type ??= "sight";
    config.percentAreaForLOS ??= getSetting(SETTINGS.LOS.PERCENT_AREA);
    config.useShadows: getSetting(SETTINGS.AREA3D_USE_SHADOWS);
    config.wallsBlock ??= true;
    config.tilesBlock ??= MODULES_ACTIVE.LEVELS;
    config.deadTokensBlock ??= deadTokenAlg !== deadTypes.NONE;
    config.deadHalfHeight ??= deadTokenAlg === deadTypes.HALF;
    config.liveTokensBlock ??= liveTokenAlg !== liveTypes.NONE;
    config.liveHalfHeight ??= getSetting(SETTINGS.COVER.LIVE_TOKENS.ATTRIBUTE)
      && liveTokenAlg !== liveTypes.NONE;
    config.liveForceHalfCover ??= liveTokenAlg === liveTypes.HALF;

    config.tokensBlock = config.deadTokensBlock || config.liveTokensBlock;

    // Internal setting.
    // If true, draws the _blockingObjectsPoints.
    // If false, draws the _blockingPoints
    this.config.debugDrawObjects ??f= false;

    this.config = config;
  }


  // NOTE ----- USER-FACING METHODS -----

  /**
   * Determine whether a visionSource has line-of-sight to a target based on the percent
   * area of the target visible to the source.
   */
  hasLOS() {
    const percentArea = this.config.percentAreaForLOS;

    // If center point is visible, then target is likely visible but not always.
    // e.g., walls slightly block the center point. Or walls block all but center.

    const percentVisible = this.percentAreaVisible();
    if ( percentVisible.almostEqual(0) ) return false;
    return (percentVisible > percentArea) || percentVisible.almostEqual(percentArea);
  }

  /**
   * Determine the percentage area of the 3d token visible to the viewer.
   * Measured by projecting the 3d token to a 2d canvas representing the viewer's perspective.
   * @returns {number}
   */
  percentAreaVisible() {
    if ( !this._targetWithinLimitedAngleVision() ) return 0;

    const objs = this.blockingObjects;
    if ( !this.debug
      && !objs.walls.size
      && !objs.tiles.size
      && !objs.tokens.size
      && objs.terrainWalls.size < 2 ) return 1;

    const { obscuredSides, sidePolys } = this._obscureSides();

    const sidesArea = sidePolys.reduce((area, poly) =>
      area += poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}), 0);
    const obscuredSidesArea = obscuredSides.reduce((area, poly) =>
      area += poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}), 0);
    let percentSeen = sidesArea ? obscuredSidesArea / sidesArea : 0;

    if ( this.debug ) {
      const colors = Draw.COLORS;
      this._drawLineOfSight();

      // Draw the detected objects on the canvas
      objs.walls.forEach(w => Draw.segment(w, { color: colors.blue }));
      objs.tiles.forEach(t => Draw.shape(t.bounds, { color: colors.yellow, fillAlpha: 0.5 }));
      objs.terrainWalls.forEach(w => Draw.segment(w, { color: colors.lightgreen }));
      objs.drawings.forEach(d => Draw.shape(d.bounds, { color: colors.gray, fillAlpha: 0.5 }));
      objs.tokens.forEach(t => Draw.shape(t.constrainedTokenBorder, { color: colors.orange, fillAlpha: 0.5 }));

      // Draw the target in 3d, centered on 0,0, and fill in the constrained border on canvas
      this.targetPoints.drawTransformed();
      Draw.shape(this.target.constrainedTokenBorder, { color: colors.red, fillAlpha: 0.5});

      // Draw the detected objects in 3d, centered on 0,0
      const pts = this.config.debugDrawObjects ? this.blockingObjectsPoints : this.blockingPoints;
      pts.walls.forEach(w => w.drawTransformed({ color: colors.blue }));
      pts.tiles.forEach(w => w.drawTransformed({ color: colors.yellow }));
      pts.drawings.forEach(d => d.drawTransformed({ color: colors.gray, fillAlpha: 0.7 }));
      pts.tokens.forEach(t => t.drawTransformed({ color: colors.orange }));
      pts.terrainWalls.forEach(w => w.drawTransformed({ color: colors.lightgreen, fillAlpha: 0.1 }));

      // Calculate the areas of the target faces separately, along with the obscured side areas.
      const target = this.target;
      this.debugSideAreas = {
        top: target.w * target.h,
        ogSide1: target.w * (target.topZ - target.bottomZ),
        ogSide2: target.h * (target.topZ - target.bottomZ),
        sides: [],
        obscuredSides: []
      };
      this.debugSideAreas.sides = sidePolys.map(poly =>
        poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}));
      this.debugSideAreas.obscuredSides = obscuredSides.map(poly =>
        poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}));

      // Report the percent seen that is being returned.
      console.log(`${this.viewer.object.name} sees ${percentSeen * 100}% of ${this.target.name} (Area3d).`);
    }

    // Round the percent seen so that near-zero areas are 0.
    // Because of trimming walls near the vision triangle, a small amount of token area can poke through
    if ( percentSeen < 0.005 ) percentSeen = 0;

    return percentSeen;
  }

  // NOTE ----- GETTERS / SETTERS ----- //

  /**
   * @type {TokenPoints3d}
   */
  get targetPoints() { return this._targetPoints; }

  /** @type {BlockingObjects} */
  get blockingObjects() {
    if ( !this._blockingObjectsAreSet ) this._findBlockingObjects();
    return this._blockingObjects;
  }

  /** @type {BlockingObjectsPoints} */
  get blockingObjectsPoints() {
    if ( !this._blockingObjectsPointsAreSet ) this._constructBlockingObjectsPoints();
    return this._blockingObjectsPoints;
  }

  /** @type {BlockingPoints} */
  get blockingPoints() {
    if ( !this._blockingPointsAreSet ) this._constructBlockingPointsArray();
    return this._blockingPoints;
  }

  /**
   * @type {object}
  /**
   * Get the array of sides, obscured by walls and shadows, if any.
   */
  get obscuredSides() {
    return this._obscuredSides || (this._obscuredSides = this._obscureSides());
  }

  get viewerViewM() {
    if ( !this._viewerViewM ) this.viewerCameraM; // eslint-disable-line no-unused-expressions
    return this._viewerViewM;
  }

  get viewerCameraM() {
    if ( !this._viewerCameraM ) {
      const { M, Minv } = this._calculateViewerCameraMatrix();
      this._viewerCameraM = M;
      this._viewerViewM = Minv;
    }

    return this._viewerCameraM;
  }

  get viewerCenter() {
    return this._viewerCenter
      || (this._viewerCenter = new Point3d(this.viewer.x, this.viewer.y, this.viewer.elevationZ));
  }

  get visionPolygon() {
    return this._visionPolygon || (this._visionPolygon = Area3d.visionPolygon(this.viewerCenter, this.target));
  }

  get targetTop() {
    if ( typeof this._targetTop === "undefined" ) {
      const pts = Point3d.fromToken(this.target);
      this._targetTop = pts.top;
      this._targetBottom = pts.bottom;
    }

    return this._targetTop;
  }

  get targetBottom() {
    if ( typeof this._targetTop === "undefined" ) {
      const pts = Point3d.fromToken(this.target);
      this._targetTop = pts.top;
      this._targetBottom = pts.bottom;
    }

    return this._targetBottom;
  }

  get targetCenter() {
    return this._targetCenter || (this._targetCenter = Point3d.fromTokenCenter(this.target));
  }

  /** @type {PIXI.Polygon} */
  get visionPolygon() {
    return this._visionPolygon || (this._visionPolygon = Area3d.visionPolygon(this.viewerCenter, this.target))
  }

  // NOTE ----- STATIC METHODS ----- //

  /**
   * Split a wall that intersects a token shape
   * Consider 3d aspects of wall, and return a array of wall points representing
   * portions of the wall not intersecting the 3d token cube
   * @param {Wall} wall             Wall to split
   * @param {Token} target          Token to test for intersecting walls
   * @param {object} [options]      Options that affect which walls are returned
   * @param {boolean} [options.keepTop]     Keep the portion of the wall directly above the token.
   * @param {boolean} [optinos.keepBottom]  Keep the portion of the wall directly below the token.
   * @returns {object} Object with WallPoints3d|null for top, bottom, left, right, middle
   */
//   static splitWallAtTokenIntersections(wall, target) {
//     // For speed, we can rely on the rectangular token border.
//     // Will be slightly off when using hexagons, so revert to constrained token there.
//     const splitWallPoints = {
//       top: null,
//       middle: null,
//       bottom: null,
//       sideA: null,
//       sideB: null,
//       full: null
//     };
//
//     const isHex = canvas.scene.grid.type > 1;
//     const targetBorder = isHex ? ConstrainedTokenBorder.get(target).constrainedBorder() : target.bounds;
//     if ( !targetBorder.lineSegmentIntersects(wall.A, wall.B, { inside: true }) ) {
//       splitWallPoints.full = new WallPoints3d(wall);
//       return splitWallPoints;
//     }
//
//     // First, split top and bottom.
//     const wallPoints = Point3d.fromWall(wall, { finite: true });
//     const pTop = duplicate(wallPoints);
//     const pBottom = duplicate(pTop);
//     const pMiddle = duplicate(pTop);
//     pTop.A.bottom.z = target.topZ;
//     pTop.B.bottom.z = target.topZ;
//     pBottom.A.top.z = target.bottomZ;
//     pBottom.B.top.z = target.bottomZ;
//
//     pMiddle.A.top.z = target.topZ;
//     pMiddle.A.bottom.z = target.bottomZ;
//     pMiddle.B.top.z = target.topZ;
//     pMiddle.B.bottom.z = target.bottomZ;
//
//     // Test whether A and B are inside the token border
//     const Acontained = targetBorder.contains(wall.A.x, wall.A.y);
//     const Bcontained = targetBorder.contains(wall.B.x, wall.B.y);
//
//     // Find where the wall intersects the token border, if at all
//     const ixs = !Acontained || !Bcontained ? targetBorder.segmentIntersections(wall.A, wall.B) : null;
//
//     if ( !Acontained ) {
//       // A endpoint is outside token. Cut wall at the A --> ix point.
//       const pA = duplicate(wallPoints);
//
//       pA.B.top.x = ixs[0].x;
//       pA.B.top.y = ixs[0].y;
//       pA.B.bottom.x = ixs[0].x;
//       pA.B.bottom.y = ixs[0].y;
//
//       pTop.A.top.x = ixs[0].x;
//       pTop.A.top.y = ixs[0].y;
//       pTop.A.bottom.x = ixs[0].x;
//       pTop.A.bottom.y = ixs[0].y;
//
//       pBottom.A.top.x = ixs[0].x;
//       pBottom.A.top.y = ixs[0].y;
//       pBottom.A.bottom.x = ixs[0].x;
//       pBottom.A.bottom.y = ixs[0].y;
//
//       pMiddle.A.top.x = ixs[0].x;
//       pMiddle.A.top.y = ixs[0].y;
//       pMiddle.A.bottom.x = ixs[0].x;
//       pMiddle.A.bottom.y = ixs[0].y;
//
//       if ( PIXI.Point.distanceSquaredBetween(pA.A.top, pA.B.top) > (0 + 1e-08)
//         && pA.A.top.z > (pA.A.bottom.z + 1e-08) ) {
//
//         splitWallPoints.sideA = WallPoints3d.fromWallPoints(pA, wall);
//       }
//
//     } // Otherwise ignore pA
//
//     if ( !Bcontained ) {
//       // B endpoint outside token. Cut wall at the B --> ix point
//       const pB = duplicate(wallPoints);
//
//       const i = ixs.length - 1;
//       pB.A.top.x = ixs[i].x;
//       pB.A.top.y = ixs[i].y;
//       pB.A.bottom.x = ixs[i].x;
//       pB.A.bottom.y = ixs[i].y;
//
//       pTop.B.top.x = ixs[i].x;
//       pTop.B.top.y = ixs[i].y;
//       pTop.B.bottom.x = ixs[i].x;
//       pTop.B.bottom.y = ixs[i].y;
//
//       pBottom.B.top.x = ixs[i].x;
//       pBottom.B.top.y = ixs[i].y;
//       pBottom.B.bottom.x = ixs[i].x;
//       pBottom.B.bottom.y = ixs[i].y;
//
//       pMiddle.B.top.x = ixs[i].x;
//       pMiddle.B.top.y = ixs[i].y;
//       pMiddle.B.bottom.x = ixs[i].x;
//       pMiddle.B.bottom.y = ixs[i].y;
//
//       if ( PIXI.Point.distanceSquaredBetween(pB.A.bottom, pB.B.bottom) > (0 + 1e-08)
//         && pB.A.top.z > (pB.A.bottom.z + 1e-08) ) {
//         splitWallPoints.sideB = WallPoints3d.fromWallPoints(pB, wall);
//       }
//
//     } // Otherwise ignore pB
//
//     if ( pTop.A.top.z > (pTop.A.bottom.z + 1e-08) ) {
//       splitWallPoints.top = WallPoints3d.fromWallPoints(pTop, wall);
//     }
//
//     if ( pBottom.A.top.z > (pBottom.A.bottom.z + 1e-08) ) {
//       splitWallPoints.bottom = WallPoints3d.fromWallPoints(pBottom, wall);
//     }
//
//     if ( pMiddle.A.top.z > (pMiddle.A.bottom.z + 1e-08) ) {
//       splitWallPoints.middle = WallPoints3d.fromWallPoints(pMiddle, wall);
//     }
//
//     return splitWallPoints;
//   }

  /**
   * Vision Polygon for the view point --> target.
   * From the given token location, get the edge-most viewable points of the target.
   * Construct a triangle between the two target points and the token center.
   * If viewing head-on (only two key points), the portion of the target between
   * viewer and target center (typically, a rectangle) is added on to the triangle.
   * @param {PIXI.Point|Point3d} viewingPoint
   * @param {Token} target
   * @returns {PIXI.Polygon} Triangle between view point and target. Will be clockwise.
   */
  static visionPolygon(viewingPoint, target) {
    const border = target.constrainedTokenBorder;
    const keyPoints = border.viewablePoints(viewingPoint, { outermostOnly: false });
    if ( !keyPoints ) {
      log(`visionPolygon: key points are null.`);
      return border.toPolygon();
    }

    let out;
    switch ( keyPoints.length ) {
      case 0:
      case 1:
        log(`visionPolygon: only ${keyPoints.length} key points found.`);
        out = border.toPolygon();
        break;
      case 2: {
        const k0 = keyPoints[0];
        const k1 = keyPoints[1];
        const center = target.center;

        // Build a rectangle between center and key points.
        // Intersect against the border
        const X = Math.minMax(k0.x, k1.x, center.x);
        const Y = Math.minMax(k0.y, k1.y, center.y);
        const rect = new PIXI.Rectangle(X.min, Y.min, X.max - X.min, Y.max - Y.min);
        const intersect = border instanceof PIXI.Rectangle ? rect : rect.intersectPolygon(border);

        // Union the triangle with this border
        const triangle = new PIXI.Polygon([viewingPoint, k0, k1]);
        // TODO: WA should be able to union two shapes that share a single edge.
        out = intersect.intersectPolygon(triangle , { clipType: ClipperLib.ClipType.ctUnion, disableWA: true });
        break;
      }
      default:
        out = new PIXI.Polygon([viewingPoint, keyPoints[0], keyPoints[keyPoints.length - 1]]);
    }

    if ( !out.isClockwise ) out.reverseOrientation();
    return out;
  }

  /**
   * Filter relevant objects in the scene using the vision triangle.
   * For the z dimension, keeps objects that are between the lowest target point,
   * highest target point, and the viewing point.
   * @param {Point3d} viewingPoint    The 3d location of the "viewer" (vision/light source)
   * @param {Token} target            The token being "viewed".
   * @param {object} [options]        Options that affect what is filtered.
   * @param {string} [options.type]           Wall restriction type: sight, light, move, sound. Used to filter walls.
   * @param {boolean} [options.filterWalls]   If true, find and filter walls
   * @param {boolean} [options.filterTokens]  If true, find and filter tokens
   * @param {boolean} [options.filterTiles]   If true, find and filter tiles
   * @param {Token} [options.viewer]          Viewer token to exclude from filtered token results
   * @return {object} Object with walls, tokens, tiles, drawings as distinct sets or undefined.
   */
  static filterSceneObjectsByVisionPolygon(viewingPoint, target, {
    visionPolygon,
    type = "sight",
    filterWalls = true,
    filterTokens = true,
    filterTiles = true,
    debug = false,
    viewer } = {}) {

    visionPolygon ??= Area3d.visionPolygon(viewingPoint, target);
    if ( debug ) Draw.shape(visionPolygon,
      { color: Draw.COLORS.blue, fillAlpha: 0.2, fill: Draw.COLORS.blue });

    const maxE = Math.max(viewingPoint.z ?? 0, target.topZ);
    const minE = Math.min(viewingPoint.z ?? 0, target.bottomZ);

    const out = { walls: new Set(), tokens: new Set(), tiles: new Set(), drawings: new Set() };
    if ( filterWalls ) {
      out.walls = Area3d.filterWallsByVisionPolygon(viewingPoint, visionPolygon, { type });

      // Filter walls that are definitely too low or too high
      out.walls = out.walls.filter(w => {
        return w.topZ > minE && w.bottomZ < maxE;
      });

      if ( debug ) out.walls.forEach(w => Draw.segment(w, { color: Draw.COLORS.gray, alpha: 0.2 }));

 //      // For walls that intersect the target token, remove the portion within the token cube.
//       // Filter the resulting points by the vision triangle
//       // As a result, all walls must be stored as WallPoints3d
//       // We can check the token constrained border against each wall b/c walls all vertical.
//       const constrainedTokenBorder = ConstrainedTokenBorder.get(target).constrainedBorder();
//       out.wallPoints3d = [];
//       const splitWallPoints = [];
//
//       // If we are looking down on the target, keep the top walls only.
//       // If we are looking up at the target, keep bottom walls only.
//       let keepBottom = true;
//       let keepTop = true;
//       if ( viewingPoint.z > target.topZ ) keepBottom = false;
//       if ( viewingPoint.z < target.bottomZ ) keepTop = false;
//
//       for ( const wall of out.walls ) {
//         const splitWalls = Area3d.splitWallAtTokenIntersections(wall, target);
//         if ( splitWalls.full ) {
//           splitWallPoints.push(splitWalls.full);
//           continue;
//         }
//
//         if ( keepBottom && splitWalls.bottom) splitWallPoints.push(splitWalls.bottom);
//         if ( keepTop && splitWalls.top ) splitWallPoints.push(splitWalls.top);
//
//         // Keep sides and middle if they potentially block viewer --> token center.
//         [splitWalls.sideA, splitWalls.sideB, splitWalls.middle].forEach(pts => {
//           if ( !pts ) return;
//           const oViewer = foundry.utils.orient2dFast(pts.topA, pts.topB, viewingPoint);
//           const oTarget = foundry.utils.orient2dFast(pts.topA, pts.topB, target.center);
//           if ( oViewer * oTarget < 0 ) splitWallPoints.push(pts);
//         })
//       }
//
//       // Test the new wall portions against the vision triangle; several are likely behind and can be dropped.
//       const edges = [...visionPolygon.iterateEdges()];
//       const filteredWallPoints = splitWallPoints.filter(w => {
//         const { topA, topB } = w;
//         if ( visionPolygon.contains(topA.x, topA.y) || visionPolygon.contains(topB.x, topB.y) ) return true;
//         return edges.some(e => foundry.utils.lineSegmentIntersects(topA, topB, e.A, e.B));
//       });
//
//       out.wallPoints3d.push(...filteredWallPoints);
//
//       if ( debug ) out.wallPoints3d.forEach(pts => pts.draw({ color: Draw.COLORS.gray }));
    }

    if ( filterTokens ) {
      out.tokens = Area3d.filterTokensByVisionPolygon(visionPolygon, { viewer, target });

      // Filter tokens that are definitely too low or too high
      out.tokens = out.tokens.filter(t => {
        return t.topZ > minE && t.bottomZ < maxE;
      });

      if ( debug ) out.tokens.forEach(t => Draw.shape(t.bounds, { color: Draw.COLORS.gray }));
    }

    if ( filterTiles ) {
      out.tiles = Area3d.filterTilesByVisionPolygon(visionPolygon);

      // For Levels, "noCollision" is the "Allow Sight" config option. Drop those tiles.
      if ( MODULES_ACTIVE.LEVELS && type === "sight" ) {
        out.tiles = out.tiles.filter(t => {
          return !t.document?.flags?.levels?.noCollision;
        });
      }

      // Filter tiles that are definitely too low or too high
      out.tiles = out.tiles.filter(t => {
        const tZ = CONFIG.GeometryLib.utils.gridUnitsToPixels(t.document.elevation);
        return tZ < maxE && tZ > minE;
      });

      // Check drawings if there are tiles
      if ( out.tiles.size ) out.drawings = Area3d.filterDrawingsByVisionPolygon(visionPolygon);

      if ( debug ) {
        out.tiles.forEach(t => Draw.shape(t.bounds, { color: Draw.COLORS.gray }));
        out.drawings.forEach(d => Draw.shape(d.bounds, { color: Draw.COLORS.gray }));
      }
    }

    return out;
  }

  /**
   * Filter drawings in the scene if they are flagged as holes.
   * @param {PIXI.Polygon} visionPolygon
   */
  static filterDrawingsByVisionPolygon(visionPolygon) {
    let drawings = canvas.drawings.quadtree.getObjects(visionPolygon.getBounds());

    // Filter by holes
    drawings = drawings.filter(d => d.document.getFlag(MODULE_ID, FLAGS.DRAWING.IS_HOLE)
      && ( d.document.shape.type === CONST.DRAWING_TYPES.POLYGON
      || d.document.shape.type === CONST.DRAWING_TYPES.ELLIPSE
      || d.document.shape.type === CONST.DRAWING_TYPES.RECTANGLE));

    if ( !drawings.size ) return drawings;

    // Filter by the precise triangle cone
    // Also convert to CenteredPolygon b/c it handles bounds better
    const edges = [...visionPolygon.iterateEdges()];
    drawings = drawings.filter(d => {
      const shape = CONFIG.GeometryLib.utils.centeredPolygonFromDrawing(d);
      const center = shape.center;
      if ( visionPolygon.contains(center.x, center.y) ) return true;
      const dBounds = shape.getBounds();
      return edges.some(e => dBounds.lineSegmentIntersects(e.A, e.B, { inside: true }));
    });
    return drawings;
  }

  /**
   * Filter tokens in the scene by a triangle representing the view from viewingPoint to
   * token (or other two points). Only considers 2d top-down view.
   * @param {PIXI.Polygon} visionPolygon
   * @param {object} [options]
   * @param {string|undefined} viewerId   Id of viewer token to exclude
   * @param {string|undefined} targetId   Id of target token to exclude
   * @return {Set<Token>}
   */
  static filterTokensByVisionPolygon(visionPolygon, { viewer, target } = {}) {
    let tokens = canvas.tokens.quadtree.getObjects(visionPolygon.getBounds());

    // Filter out the viewer and target token
    tokens.delete(viewer);
    tokens.delete(target);

    if ( !tokens.size ) return tokens;

    // Filter by the precise triangle cone
    // For speed and simplicity, consider only token rectangular bounds
    const edges = [...visionPolygon.iterateEdges()];
    tokens = tokens.filter(t => {
      const tCenter = t.center;
      if ( visionPolygon.contains(tCenter.x, tCenter.y) ) return true;
      const tBounds = t.bounds;
      return edges.some(e => tBounds.lineSegmentIntersects(e.A, e.B, { inside: true }));
    });
    return tokens;
  }

  /**
   * Filter tiles in the scene by a triangle representing the view from viewingPoint to
   * token (or other two points). Only considers 2d top-down view.
   * @param {PIXI.Polygon} visionPolygon
   * @return {Set<Tile>}
   */
  static filterTilesByVisionPolygon(visionPolygon) {
    let tiles = canvas.tiles.quadtree.getObjects(visionPolygon.getBounds());
    if ( !tiles.size ) return tiles;

    // Filter by the precise triangle shape
    const edges = [...visionPolygon.iterateEdges()];
    tiles = tiles.filter(t => {
      const tBounds = t.bounds;
      const tCenter = tBounds.center;
      if ( visionPolygon.contains(tCenter.x, tCenter.y) ) return true;
      return edges.some(e => tBounds.lineSegmentIntersects(e.A, e.B, { inside: true }));
    });
    return tiles;
  }


  /**
   * Filter walls in the scene by a triangle representing the view from viewingPoint to some
   * token (or other two points). Only considers 2d top-down view.
   * @param {Point3d} viewingPoint
   * @param {PIXI.Polygon} visionPolygon
   * @param {object} [options]
   * @param {string} [type]     Wall restriction type: sight, light, move, sound
   * @return {Set<Wall>}
   */
  static filterWallsByVisionPolygon(viewingPoint, visionPolygon, { type = "sight" } = {}) {
    let walls = canvas.walls.quadtree.getObjects(visionPolygon.getBounds());
    walls = walls.filter(w => Area3d._testWallInclusion(w, viewingPoint, { type }));

    if ( !walls.size ) return walls;

    // Filter by the precise triangle cone.
    const edges = [...visionPolygon.iterateEdges()];
    walls = walls.filter(w => {
      if ( visionPolygon.contains(w.A.x, w.A.y) || visionPolygon.contains(w.B.x, w.B.y) ) return true;
      return edges.some(e => foundry.utils.lineSegmentIntersects(w.A, w.B, e.A, e.B));
    });
    return walls;
  }

  /**
   * Test whether a wall should be included as potentially blocking from point of view of
   * token.
   * Comparable to ClockwiseSweep.prototype._testWallInclusion but less thorough.
   */
  static _testWallInclusion(wall, viewingPoint, { type = "sight" } = {}) {
    // Ignore walls that are not blocking for the type
    if (!wall.document[type] || wall.isOpen ) return false;

    // Ignore one-directional walls facing away
    const side = wall.orientPoint(viewingPoint);
    return !wall.document.dir || (side !== wall.document.dir);
  }

  /**
   * Test whether walls block the source with regard to LOS.
   * @param {PIXI.Polygon|PIXI.Rectangle} constrained   Token shape
   * @param {Point} origin                              Viewpoint to test for whether constrained can be seen
   * @param {hasLOS: {Boolean}, hasFOV: {Boolean}}
   * @return {Boolean} Returns false if the source definitely cannot provide LOS; true otherwise.
   */
//   static filterWallsForVisionCone(walls, constrained, origin, type = "sight") {
//     const keyPoints = (constrained instanceof PIXI.Polygon)
//       ? Area3d.polygonKeyPointsForOrigin(constrained, origin)
//       : Area3d.bboxKeyCornersForOrigin(constrained, origin);
//     if ( !keyPoints || !keyPoints.length ) return walls;
//
//     const visionPoly = new PIXI.Polygon([origin, ...keyPoints]);
//
//     walls = walls.filter(wall =>
//       !wall.document[type]
//       || wall.isOpen
//       || visionPoly.contains(wall.A.x, wall.A.y)
//       || visionPoly.contains(wall.B.x, wall.B.y)
//       || visionPoly.linesCross([wall]));
//
//     // Avoid walls that are underground if origin is above ground, or vice-versa
//     if ( origin.z >= 0 ) walls = walls.filter(w => w.topZ >= 0);
//     else walls = walls.filter(w => w.bottomZ <= 0);
//
//     // Avoid walls for which a tile separates the observer from the wall.
//     const rect = new PIXI.Rectangle(origin.x - 1, origin.y - 1, 2, 2);
//     const tiles = canvas.tiles.quadtree.getObjects(rect);
//     walls = walls.filter(w => !Area3d.isWallBetweenTile(origin, w, tiles));
//
//     return walls;
//   }


  /**
   * Also in Elevated Vision clockwise_sweep.js
   * From point of view of a source (light or vision observer), is the wall underneath the tile?
   * Only source elevation and position, not perspective, taken into account.
   * So if source is above tile and wall is below tile, that counts.
   * @param {PointSource} observer
   * @param {Wall} wall
   * @param {Tile[]} tiles    Set of tiles; will default to all tiles under the observer
   * @returns {boolean}
   */
//   static isWallBetweenTile(origin, wall, tiles) {
//     if ( !tiles ) {
//       const rect = new PIXI.Rectangle(origin.x - 1, origin.y - 1, 2, 2);
//       tiles = canvas.tiles.quadtree.getObjects(rect);
//     }
//
//     for ( const tile of tiles ) {
//       if ( !tile.bounds.contains(origin.x, origin.y) ) continue;
//
//       const tileE = tile.document.flags?.levels.rangeBottom ?? tile.document.elevation;
//       const tileZ = CONFIG.GeometryLib.utils.gridUnitsToPixels(tileE);
//       if ( (origin.z > tileZ && wall.topZ < tileZ)
//         || (origin.z < tileZ && wall.bottomZ > tileZ) ) return true;
//     }
//     return false;
//   }

  // NOTE ----- PRIMARY METHODS ----- //

  /**
   * Calculate the view matrix for the given token and target.
   * Also sets the view matrix for the target, walls, tiles, and other tokens as applicable.
   */
  calculateViewMatrix() {
    this._calculateViewerCameraMatrix();

    // Set the matrix to look at the target from the viewer.
    const { targetPoints, viewerCenter, viewerViewM } = this;
    targetPoints.setViewingPoint(viewerCenter);
    targetPoints.setViewMatrix(viewerViewM);

    // Set the matrix to look at blocking point objects from the viewer.
    const blockingPoints = this.blockingPoints;
    blockingPoints.drawings.forEach(pts => pts.setViewMatrix(viewerViewM));
    blockingPoints.tiles.forEach(pts => pts.setViewMatrix(viewerViewM));
    blockingPoints.tokens.forEach(pts => pts.setViewMatrix(viewerViewM));
    blockingPoints.walls.forEach(pts => pts.setViewMatrix(viewerViewM));
    blockingPoints.terrainWalls.forEach(pts => pts.setViewMatrix(viewerViewM));

    // Set the matrix for drawing other debug objects
    if ( this.debug ) {
      const blockingObjectsPoints = this.blockingObjectsPoints;
      blockingObjectsPoints.drawings.forEach(pts => pts.setViewMatrix(viewerViewM));
      blockingObjectsPoints.tiles.forEach(pts => pts.setViewMatrix(viewerViewM));
      blockingObjectsPoints.tokens.forEach(pts => pts.setViewMatrix(viewerViewM));
      blockingObjectsPoints.walls.forEach(pts => pts.setViewMatrix(viewerViewM));
      blockingObjectsPoints.terrainWalls.forEach(pts => pts.setViewMatrix(viewerViewM));
    }

    this._viewIsSet = true;
  }

  /**
   * Construct 2d perspective projection of each blocking points object.
   * Combine them into a single array of blocking polygons.
   * For each visible side of the target, build the 2d perspective polygon for that side.
   * Take the difference between that side and the blocking polygons to determine the
   * visible portion of that side.
   * @returns {object} { obscuredSides: PIXI.Polygon[], sidePolys: PIXI.Polygon[]}
   *   sidePolys: The sides of the target, in 2d perspective.
   *   obscuredSides: The unobscured portions of the sidePolys
   */
  _obscureSides() {
    if ( !this._viewIsSet ) this.calculateViewMatrix();
    const blockingPoints = this.blockingPoints;

    // Combine terrain walls
    const combinedTerrainWalls = blockingPoints.terrainWalls.length > 1
      ? WallPoints3d.combineTerrainWalls(blockingPoints.terrainWalls, this.viewerCenter, {
        scalingFactor: Area3d.SCALING_FACTOR
      }) : undefined;

    // Combine blocking tiles with drawings as holes
    const tiles = this._combineBlockingTiles();

    // Combine other objects
    const walls = this._combineBlockingWalls();
    const tokens = this._combineBlockingTokens();

    // Combine to a single set of polygon paths
    let blockingPaths = [];
    if ( tiles ) blockingPaths.push(tiles);
    if ( walls ) blockingPaths.push(walls);
    if ( tokens ) blockingPaths.push(tokens);
    if ( combinedTerrainWalls ) blockingPaths.push(combinedTerrainWalls);
    const blockingObject = ClipperPaths.combinePaths(blockingPaths);

    // For each side, union the blocking wall with any shadows and then take diff against the side
    const tTarget = this.targetPoints.perspectiveTransform();
    const sidePolys = tTarget.map(side => new PIXI.Polygon(side));
    const obscuredSides = blockingObject
      ? sidePolys.map(side => blockingObject.diffPolygon(side))
      : sidePolys;

    return { obscuredSides, sidePolys };
  }

  // NOTE ----- GETTER/SETTER HELPER METHODS ----- //

  /**
   * Construct the transformation matrix to rotate the view around the center of the token.
   */
  _calculateViewerCameraMatrix() {
    const cameraPosition = this.viewerCenter;
    const targetPosition = this.targetCenter;
    return Matrix.lookAt(cameraPosition, targetPosition, Area3d._upVector);
  }

  /**
   * Find objects that are within the vision triangle between viewer and target.
   * Sets this._blockingObjects for drawings, tiles, tokens, walls, and terrainWalls.
   * Sets _blockingObjectsAreSet and resets _blockingPointsAreSet and _viewIsSet.
   */
  _findBlockingObjects() {
    const {
      type,
      wallsBlock,
      tokensBlock,
      tilesBlock } = this.config;

    // Clear any prior objects from the respective sets
    const { terrainWalls, walls } = this._blockingObjects;
    terrainWalls.clear();
    walls.clear();

    const objsFound = Area3d.filterSceneObjectsByVisionPolygon(this.viewerCenter, this.target, {
      type,
      filterWalls: wallsBlock,
      filterTokens: tokensBlock,
      filterTiles: tilesBlock,
      debug: this.debug,
      viewer: this.viewer.object });

    this._blockingObjects.drawings = objsFound.drawings;
    this._blockingObjects.tokens = objsFound.tokens;
    this._blockingObjects.tiles = objsFound.tiles;

    // Separate the terrain walls.
    objsFound.walls.forEach(w => {
      const s = w.document[type] === CONST.WALL_SENSE_TYPES.LIMITED ? terrainWalls : walls;
      s.add(w);
    });

    // Add walls for limited angle sight, if necessary.
    const limitedAngleWalls = this._constructLimitedAngleWallPoints3d();
    if ( limitedAngleWalls ) {
      walls.add(limitedAngleWalls[0]);
      walls.add(limitedAngleWalls[1]);
    }

    this._blockingObjectsAreSet = true;
    this._blockingObjectsPointsAreSet = false;
    this._blockingPointsAreSet = false;
    this._viewIsSet = false;
  }

  /**
   * Convert blocking objects into PlanePoints.
   * These will eventually be used by _obscureSides to project 2d perspective objects
   * that may block the target sides.
   */
  _constructBlockingObjectsPoints() {
    const blockingObjs = this.blockingObjects;
    const {
      type,
      liveTokensBlock,
      deadTokensBlock,
      deadHalfHeight } = this.config;

    // Clear any prior objects from the respective sets
    const { drawings, terrainWalls, tiles, tokens, walls } = this._blockingObjectsPoints;
    drawings.clear();
    terrainWalls.clear();
    tiles.clear();
    tokens.clear();
    walls.clear();

    // Add Tiles
    blockingObjs.tiles.forEach(t => tiles.add(new TilePoints3d(t)));

    // Add Drawings
    if ( blockingObjs.tiles.size
      && blockingObjs.drawings.size ) blockingObjs.drawings.forEach(d => drawings.add(new DrawingPoints3d(d)));

    // Add Tokens
    const tokenPoints = buildTokenPoints(blockingObjs.tokens, this.config);
    tokenPoints.forEach(pts => tokens.add(pts));

    // Add Walls
    blockingObjs.walls.forEach(w => walls.add(new WallPoints3d(w)));

    // Add Terrain Walls
    blockingObjs.terrainWalls.forEach(w => terrainWalls.add(new WallPoints3d(w)));

    this._blockingObjectsPointsAreSet = true;
    this._blockingPointsAreSet = false;
    this._viewIsSet = false;
  }

  /**
   * Construct the PlanePoints3d array.
   * Split various PlanePoints3d objects as needed for the given perspective.
   */
  _constructBlockingPointsArray() {
    const blockingObjectsPoints = this.blockingObjectsPoints;
    const { drawings, terrainWalls, tiles, tokens, walls } = this._blockingPoints;
    const { visionPolygon, target } = this;
    const edges = [...visionPolygon.iterateEdges()];
    const blockingPoints = this._blockingPoints;
    const viewerLoc = this.viewerCenter;

    if ( this.debug ) Draw.shape(visionPolygon, { fill: Draw.COLORS.lightblue, fillAlpha: 0.2 });

    // Clear the existing arrays.
    tiles.length = 0;
    drawings.length = 0;
    tokens.length = 0;
    walls.length = 0;
    terrainWalls.length = 0;

    // Vertical points
    blockingObjectsPoints.walls.forEach(pts => {
      const res = pts._getVisibleSplits(target, visionPolygon, { edges, viewerLoc });
      if ( res.length ) blockingPoints.walls.push(...res);
    });

    blockingObjectsPoints.terrainWalls.forEach(pts => {
      const res = pts._getVisibleSplits(target, visionPolygon, { edges, viewerLoc });
      if ( res.length ) blockingPoints.terrainWalls.push(...res);
    });

    // Horizontal points
    blockingObjectsPoints.tiles.forEach(pts => {
      const res = pts._getVisibleSplits(target, visionPolygon, { edges, viewerLoc });
      if ( res.length ) blockingPoints.tiles.push(...res);
    });

    blockingObjectsPoints.drawings.forEach(pts => {
      const res = pts._getVisibleSplits(target, visionPolygon, { edges, viewerLoc });
      if ( res.length ) blockingPoints.drawings.push(...res);
    });

    // Tokens have both horizontal and vertical.
    blockingObjectsPoints.tokens.forEach(token => {
      const topBottom = token._viewableTopBottom(viewerLoc);
      if ( topBottom ) {
        const res = topBottom._getVisibleSplits(target, visionPolygon, { edges, viewerLoc });
        if ( res.length ) blockingPoints.tokens.push(...res);
      }

      const sides = token._viewableSides(viewerLoc);
      sides.forEach(pts => {
        const res = pts._getVisibleSplits(target, visionPolygon, { edges, viewerLoc });
        if ( res.length ) blockingPoints.tokens.push(...res);
      });
    });

    this._blockingPointsAreSet = true;
    this._viewIsSet = false;
  }

  // NOTE ----- OTHER HELPER METHODS ----- //

  /**
   * Combine provided walls using Clipper.
   * @returns {ClipperPaths|undefined}
   */
  _combineBlockingWalls() {
    let walls = this.blockingPoints.walls;
    if ( !walls.length ) return undefined;

    const transformed = walls.map(w => new PIXI.Polygon(w.perspectiveTransform()));
    const paths = ClipperPaths.fromPolygons(transformed, { scalingFactor: Area3d.SCALING_FACTOR });
    const combined = paths.combine();
    combined.clean();
    return combined;
  }

  /**
   * Combine all the blocking tokens using Clipper
   * @returns {ClipperPaths|undefined}
   */
  _combineBlockingTokens() {
    const tokens = this.blockingPoints.tokens;
    if ( !tokens.length ) return undefined;

    const transformed = tokens.map(t => new PIXI.Polygon(t.perspectiveTransform()));
    const paths = ClipperPaths.fromPolygons(transformed, { scalingFactor: Area3d.SCALING_FACTOR });
    const combined = paths.combine();
    combined.clean();
    return combined;
  }

  /**
   * Combine all the blocking tiles using Clipper.
   * If drawings with holes exist, construct relevant tiles with holes accordingly.
   * @returns {ClipperPaths|undefined}
   */
  _combineBlockingTiles() {
    const blockingPoints = this.blockingPoints;

    if ( !blockingPoints.tiles.length ) return undefined;

    if ( !blockingPoints.drawings.length ) {
      let tiles = blockingPoints.tiles.map(w => new PIXI.Polygon(w.perspectiveTransform()));
      tiles = ClipperPaths.fromPolygons(tiles, {scalingFactor: Area3d.SCALING_FACTOR});
      tiles.combine().clean();
      return tiles;
    }

    // Check if any drawings might create a hole in one or more tiles
    const tilesUnholed = [];
    const tilesHoled = [];
    for ( const tile of blockingPoints.tiles ) {
      const drawingHoles = [];
      const tileE = tile.object.document.elevation;
      const tilePoly = new PIXI.Polygon(tile.perspectiveTransform());

      for ( const drawing of blockingPoints.drawings ) {
        const minE = drawing.object.document.getFlag("levels", "rangeTop");
        const maxE = drawing.object.document.getFlag("levels", "rangeBottom");
        if ( minE == null && maxE == null ) continue; // Intended to test null, undefined
        else if ( minE == null && tileE !== maxE ) continue;
        else if ( maxE == null && tileE !== minE ) continue;
        else if ( !tileE.between(minE, maxE) ) continue;

        // We know the tile is within the drawing elevation range.
        drawing.elevation = tileE; // Temporarily change the drawing elevation to match tile.
        drawingHoles.push(new PIXI.Polygon(drawing.perspectiveTransform()));
      }

      if ( drawingHoles.length ) {
        // Construct a hole at the tile's elevation from the drawing taking the difference.
        const drawingHolesPaths = ClipperPaths.fromPolygons(drawingHoles, {scalingFactor: Area3d.SCALING_FACTOR});
        const tileHoled = drawingHolesPaths.diffPolygon(tilePoly);
        tilesHoled.push(tileHoled);
      } else tilesUnholed.push(tilePoly);
    }

    if ( tilesUnholed.length ) {
      const unHoledPaths = ClipperPaths.fromPolygons(tilesUnholed, {scalingFactor: Area3d.SCALING_FACTOR});
      unHoledPaths.combine().clean();
      tilesHoled.push(unHoledPaths);
    }

    // Combine all the tiles, holed and unholed
    const tiles = ClipperPaths.combinePaths(tilesHoled);
    tiles.combine().clean();
    return tiles;
  }

  /**
   * Test if any part of the target is within the limited angle vision of the token.
   * @returns {boolean}
   */
  _targetWithinLimitedAngleVision() {
    const angle = this.viewer.data.angle;
    if ( angle === 360 ) return true;

    // Does the target intersect the two rays from viewer center?
    // Does the target fall between the two rays?
    const { x, y, rotation } = this.viewer.data;

    // The angle of the left (counter-clockwise) edge of the emitted cone in radians.
    // See LimitedAnglePolygon
    const aMin = Math.normalizeRadians(Math.toRadians(rotation + 90 - (angle / 2)));

    // The angle of the right (clockwise) edge of the emitted cone in radians.
    const aMax = aMin + Math.toRadians(angle);

    const constrainedTokenBorder = ConstrainedTokenBorder.get(this.target).constrainedBorder();

    // For each edge:
    // If it intersects a ray, target is within.
    // If an endpoint is within the limited angle, target is within
    const rMin = Ray.fromAngle(x, y, aMin, canvas.dimensions.maxR);
    const rMax = Ray.fromAngle(x, y, aMax, canvas.dimensions.maxR);

    // Probably worth checking the target center first
    const center = this.target.center;
    if ( LimitedAnglePolygon.pointBetweenRays(center, rMin, rMax, angle) ) return true;
    if ( LimitedAnglePolygon.pointBetweenRays(center, rMin, rMax, angle) ) return true;

    // TODO: Would it be more performant to assign an angle to each target point?
    // Or maybe just check orientation of ray to each point?
    const edges = constrainedTokenBorder.toPolygon().iterateEdges();
    for ( const edge of edges ) {
      if ( foundry.utils.lineSegmentIntersects(rMin.A, rMin.B, edge.A, edge.B) ) return true;
      if ( foundry.utils.lineSegmentIntersects(rMax.A, rMax.B, edge.A, edge.B) ) return true;
      if ( LimitedAnglePolygon.pointBetweenRays(edge.A, rMin, rMax, angle) ) return true;
      if ( LimitedAnglePolygon.pointBetweenRays(edge.B, rMin, rMax, angle) ) return true;
    }

    return false;
  }

  /**
   * Test whether a wall should be included as potentially blocking from point of view of
   * token.
   * Comparable to ClockwiseSweep.prototype._testWallInclusion
   */
  _testWallInclusion(wall, bounds) {
    // First test for inclusion in our overall bounding box
    if ( !bounds.lineSegmentIntersects(wall.A, wall.B, { inside: true }) ) return false;

    // Ignore walls that do not block sight
    if ( !wall.document.sight || wall.isOpen ) return false;

    // Ignore walls that are in line with the viewer and target
    if ( !foundry.utils.orient2dFast(this.viewerCenter, wall.A, wall.B)
      && !foundry.utils.orient2dFast(this.targetCenter, wall.A, wall.B) ) return false;

    // Ignore one-directional walls facing away from the origin
    const side = wall.orientPoint(this.viewerCenter);
    return !wall.document.dir || (side !== wall.document.dir);
  }

  /**
   * Construct walls based on limited angle rays
   * Start 1 pixel behind the origin
   * @returns {null|WallPoints3d[2]}
   */
  _constructLimitedAngleWallPoints3d() {
    const angle = this.viewer.data.angle;
    if ( angle === 360 ) return null;

    const { x, y, rotation } = this.viewer.data;
    const aMin = Math.normalizeRadians(Math.toRadians(rotation + 90 - (angle / 2)));
    const aMax = aMin + Math.toRadians(angle);

    // 0 faces south; 270 faces east
    const aMed = (aMax + aMin) * 0.5;
    const rMed = Ray.fromAngle(x, y, aMed, -1);
    const rMin = Ray.fromAngle(rMed.B.x, rMed.B.y, aMin, canvas.dimensions.maxR);
    const rMax = Ray.fromAngle(rMed.B.x, rMed.B.y, aMax, canvas.dimensions.maxR);

    // Use the ray as the wall
    rMin.topZ = canvas.dimensions.maxR;
    rMin.bottomZ = -canvas.dimensions.maxR;
    rMax.topZ = canvas.dimensions.maxR;
    rMax.bottomZ = -canvas.dimensions.maxR;
    return [new WallPoints3d(rMin), new WallPoints3d(rMax)];
  }

  /**
   * For debugging.
   * Draw the line of sight from token to target.
   */
  _drawLineOfSight() {
    Draw.segment({A: this.viewerCenter, B: this.targetCenter});
  }
}
