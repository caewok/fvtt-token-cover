/* globals
PIXI,
canvas,
game,
foundry,
Token,
CONST
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

import { MODULE_ID, FLAGS } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { zValue, log, getObjectProperty, centeredPolygonFromDrawing } from "./util.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

import * as drawing from "./drawing.js"; // For debugging

import { ClipperPaths } from "./geometry/ClipperPaths.js";
import { Matrix } from "./geometry/Matrix.js";
import { Point3d } from "./geometry/Point3d.js";

import { DrawingPoints3d } from "./geometry/DrawingPoints3d.js";
import { TokenPoints3d } from "./geometry/TokenPoints3d.js";
import { TilePoints3d } from "./geometry/TilePoints3d.js";
import { WallPoints3d } from "./geometry/WallPoints3d.js";

export class Area3d {

  /** @type {VisionSource} */
  viewer;

  /** @type {Point3d} */
  _viewerCenter;

  /** @type {Token} */
  target;

  /** @type {TokenPoints3d} */
  targetPoints;

  /** @type object */
  config = {};

  /** @type {boolean} */
  debug = false;

  /** @type {object}:
   *  drawings: Set<DrawingPoints3d>
   *  terrainWalls: Set<WallPoints3d>
   *  tiles: Set<TilePoints3d>
   *  tokens: Set<TokenPoints3d>}
   *  walls: Set<WallPoints3d>
   */
  _blockingObjects = {
    drawings: new Set(),
    terrainWalls: new Set(),
    tiles: new Set(),
    tokens: new Set(),
    walls: new Set()
  };

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

  /**
   * Vector representing the up position on the canvas.
   * Used to construct the token camera and view matrices.
   * @type {Point3d}
   */
  static _upVector = new Point3d(0, 0, -1);

  /**
   * @param {VisionSource|TOKEN} visionSource     Token, viewing from token.topZ.
   * @param {Target} target   Target; token is looking at the target center.
   */
  constructor(viewer, target, {
    type = "sight",
    wallsBlock = true,
    tilesBlock = false,
    liveTokensBlock = false,
    deadTokensBlock = false,
    deadHalfHeight = false } = {}) {

    this.viewer = viewer instanceof Token ? viewer.vision : viewer;
    this.target = target;

    // Configuration options
    this.config = {
      type,
      wallsBlock,
      tilesBlock,
      tokensBlock: liveTokensBlock || deadTokensBlock,
      percentAreaForLOS: getSetting(SETTINGS.LOS.PERCENT_AREA),
      _useShadows: getSetting(SETTINGS.AREA3D_USE_SHADOWS),
      liveTokensBlock,
      deadTokensBlock,
      deadHalfHeight
    };

    // Set debug only if the target is being targeted.
    // Avoids "double-vision" from multiple targets for area3d on scene.
    if ( game.modules.get(MODULE_ID).api.debug.area ) {
      const targets = canvas.tokens.placeables.filter(t => t.isTargeted);
      this.debug = targets.some(t => t === target);
    }

    this.targetPoints = new TokenPoints3d(target);
  }

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
   * Get the blocking objects
   * @type {object{walls: Set<WallPoints3d>|undefined, tiles: Set<WallPoints3d>, tokens: Set<TokenPoints3d>}}
   */
  get blockingObjects() {
    if ( !this._blockingObjectsAreSet ) this._findBlockingObjects();
    return this._blockingObjects;
  }

  /**
   * Calculate the view matrix for the given token and target.
   * Also sets the view matrix for the target, walls, tiles, and other tokens as applicable.
   */
  calculateViewMatrix() {
    this._calculateViewerCameraMatrix();

    const tp = this.targetPoints;
    tp.setViewingPoint(this.viewerCenter);
    tp.setViewMatrix(this.viewerViewM);

    const objs = this.blockingObjects;
    objs.walls.forEach(w => w.setViewMatrix(this.viewerViewM));
    objs.tiles.forEach(t => t.setViewMatrix(this.viewerViewM));
    objs.drawings.forEach(d => d.setViewMatrix(this.viewerViewM));
    objs.tokens.forEach(t => {
      t.setViewingPoint(this.viewerCenter);
      t.setViewMatrix(this.viewerViewM);
    });

    // Set the terrain wall view matrix and combine if necessary
    objs.terrainWalls.forEach(w => w.setViewMatrix(this.viewerViewM));
    this.blockingObjects.combinedTerrainWalls = undefined;
    if ( this.blockingObjects.terrainWalls.size > 1 ) {
      const tws = this.blockingObjects.terrainWalls(w => w.perspectiveTransform());
      this.blockingObjects.combinedTerrainWalls = WallPoints3d.combineTerrainWalls(tws);
    }

    this._viewIsSet = true;
  }

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

  get targetCenter() {
    return this._targetCenter || (this._targetCenter = Area3d.tokenCenter(this.target));
  }

  /**
   * Center of a token in 3d.
   * For height, uses the average between token bottom and top.
   * @param {Token} token
   * @returns {Point3d}
   */
  static tokenCenter(token) {
    const { center, bottomZ, topZ } = token;
    const e = bottomZ + ((topZ - bottomZ) * 0.5);
    return new Point3d(center.x, center.y, e);
  }

  /**
   * Construct the transformation matrix to rotate the view around the center of the token.
   */
  _calculateViewerCameraMatrix() {
    const cameraPosition = this.viewerCenter;
    const targetPosition = this.targetCenter;
    return Matrix.lookAt(cameraPosition, targetPosition, Area3d._upVector);
  }

  /**
   * Combine provided walls using Clipper.
   * @returns {ClipperPaths|undefined}
   */
  _combineBlockingWalls() {
    let walls = this.blockingObjects.walls;

    if ( !walls.size ) return undefined;

    walls = walls.map(w => new PIXI.Polygon(w.perspectiveTransform()));
    walls = ClipperPaths.fromPolygons(walls);
    walls.combine().clean();

    return walls;
  }

  /**
   * Combine all the blocking tiles using Clipper.
   * If drawings with holes exist, construct relevant tiles with holes accordingly.
   * @returns {ClipperPaths|undefined}
   */
  _combineBlockingTiles() {
    const objs = this.blockingObjects;

    if ( !objs.tiles.size ) return undefined;

    let tiles = objs.tiles.map(w => new PIXI.Polygon(w.perspectiveTransform()));

    if ( !objs.drawings.size ) {
      tiles = ClipperPaths.fromPolygons(tiles);
      tiles.combine().clean();
      return tiles;
    }

    // Check if any drawings might create a hole in one or more tiles
    const tilesUnholed = [];
    const tilesHoled = [];
    for ( const tile of objs.tiles ) {
      const drawingHoles = [];
      const tileE = tile.wall.document.elevation;

      for ( const drawing of objs.drawings ) {
        const minE = drawing.drawing.document.getFlag("levels", "rangeTop");
        const maxE = drawing.drawing.document.getFlag("levels", "rangeBottom");
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
        const drawingHolesPaths = ClipperPaths.fromPolygons(drawingHoles);
        const tileHoled = drawingHolesPaths.diffPolygon(new PIXI.Polygon(tile.perspectiveTransform()));
        tilesHoled.push(tileHoled);
      } else tilesUnholed.push(tile);
    }

    if ( tilesUnholed.length ) {
      const unHoledPaths = ClipperPaths.fromPolygons(tilesUnholed);
      unHoledPaths.combine().clean();
      tilesHoled.push(...unHoledPaths);
    }

    // Combine all the tiles, holed and unholed
    tiles = ClipperPaths.combinePaths(tilesHoled);
    tiles.combine().clean();
    return tiles;
  }

  _obscureSides() {
    if ( !this._viewIsSet ) this.calculateViewMatrix();

    const walls = this._combineBlockingWalls();
    const tiles = this._combineBlockingTiles();
    const terrainWalls = WallPoints3d.combineTerrainWalls([...this.blockingObjects.terrainWalls]);

    // Combine the walls and tiles to a single set of polygon paths
    let blockingPaths = [];
    if ( walls ) blockingPaths.push(walls);
    if ( tiles ) blockingPaths.push(tiles);
    if ( terrainWalls ) blockingPaths.push(terrainWalls);
    const blockingObject = ClipperPaths.combinePaths(blockingPaths);

    // For each side, union the blocking wall with any shadows and then take diff against the side
    const tTarget = this.targetPoints.perspectiveTransform();
    const sidePolys = tTarget.map(side => new PIXI.Polygon(side));
    const obscuredSides = blockingObject
      ? sidePolys.map(side => blockingObject.diffPolygon(side))
      : sidePolys;

    return { obscuredSides, sidePolys };
  }

  /**
   * Determine the percentage area of the 3d token visible to the viewer.
   * Measured by projecting the 3d token to a 2d canvas representing the viewer's perspective.
   * @returns {number}
   */
  percentAreaVisible() {
    const objs = this.blockingObjects;

    if ( !this.debug
      && !objs.walls.size
      && !objs.tiles.size
      && !objs.tokens.size
      && objs.terrainWalls.size < 2 ) return 1;

    const { obscuredSides, sidePolys } = this._obscureSides();

    if ( this.debug ) {
      const colors = drawing.COLORS;
      this._drawLineOfSight();
      this.targetPoints.drawTransformed();
      objs.walls.forEach(w => w.drawTransformed({color: colors.blue}));
      objs.tiles.forEach(w => w.drawTransformed({color: colors.yellow}));
      objs.drawings.forEach(d => d.drawTransformed());
      objs.tokens.forEach(t => t.drawTransformed({color: colors.orange}));
      objs.terrainWalls.forEach(w =>
        w.drawTransformed({ color: colors.lightgreen, fillAlpha: 0.1 }));

      if ( objs.combinedTerrainWalls ) objs.combinedTerrainWalls.draw({color: drawing.COLORS.green, fillAlpha: 0.3});

      const target = this.target;
      this.debugSideAreas = {
        top: target.w * target.h,
        ogSide1: target.w * (target.topZ - target.bottomZ),
        ogSide2: target.h * (target.topZ - target.bottomZ),
        sides: [],
        obscuredSides: []
      };
    }

    const sidesArea = sidePolys.reduce((area, poly) => area += poly.area(), 0);
    const obscuredSidesArea = obscuredSides.reduce((area, poly) => area += poly.area(), 0);
    const percentSeen = sidesArea ? obscuredSidesArea / sidesArea : 0;

    if ( this.debug ) {
      this.debugSideAreas.sides = sidePolys.map(poly => poly.area());
      this.debugSideAreas.obscuredSides = obscuredSides.map(poly => poly.area());
      console.log(`${this.viewer.object.name} sees ${percentSeen * 100}% of ${this.target.name} (Area3d).`);
    }

    return percentSeen;
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
   * Find relevant walls—--those intersecting the boundary between token center and target.
   */
  _findBlockingObjects() {
    const {
      type,
      wallsBlock,
      tokensBlock,
      tilesBlock,
      liveTokensBlock,
      deadTokensBlock,
      deadHalfHeight } = this.config;

    // Clear any prior objects from the respective sets
    const { drawings, terrainWalls, tiles, tokens, walls } = this._blockingObjects;
    drawings.clear();
    terrainWalls.clear();
    tiles.clear();
    tokens.clear();
    walls.clear();

    const objsFound = Area3d.filterSceneObjectsByVisionTriangle(this.viewerCenter, this.target, {
      type,
      filterWalls: wallsBlock,
      filterTokens: tokensBlock,
      filterTiles: tilesBlock,
      viewer: this.viewer.object });

    objsFound.tiles.forEach(t => tiles.add(new TilePoints3d(t)));

    if ( objsFound.tiles.size
      && objsFound.drawings.size ) objsFound.drawings.forEach(d => drawings.add(new DrawingPoints3d(d)));

    if ( objsFound.tokens.size ) {
      // Filter live or dead tokens, depending on config.
      if ( liveTokensBlock ^ deadTokensBlock ) { // We handled tokensBlock above
        const hpAttribute = getSetting(SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE);
        objsFound.tokens = objsFound.tokens.filter(t => {
          const hp = getObjectProperty(t.actor, hpAttribute);
          if ( typeof hp !== "number" ) return true;

          if ( liveTokensBlock && hp > 0 ) return true;
          if ( deadTokensBlock && hp <= 0 ) return true;
          return false;
        });
      }

      // Construct the TokenPoints3d for each token, using half-height for dead if required
      if ( deadHalfHeight ) {
        const hpAttribute = getSetting(SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE);
        objsFound.tokens.forEach(t => {
          const hp = getObjectProperty(t.actor, hpAttribute);
          const halfHeight = (typeof hp === "number") && (hp <= 0);
          tokens.add(new TokenPoints3d(t, { type, halfHeight }));
        });
      } else objsFound.tokens.forEach(t => tokens.add(new TokenPoints3d(t, { type })));
    }

    // Separate the terrain walls and convert all walls to Points3d
    objsFound.walls.forEach(w => {
      const s = w.document[type] === CONST.WALL_SENSE_TYPES.LIMITED ? terrainWalls : walls;
      s.add(new WallPoints3d(w));
    });

    this._blockingObjectsAreSet = true;
  }

  /**
   * For debugging.
   * Draw the line of sight from token to target.
   */
  _drawLineOfSight() {
    drawing.drawSegment({A: this.viewerCenter, B: this.targetCenter});
  }

  /**
   * Vision Triangle for the view point --> target.
   * From the given token location, get the edge-most viewable points of the target.
   * Construct a triangle between the two target points and the token center.
   * @param {PIXI.Point|Point3d} viewingPoint
   * @param {Token} target
   * @param {object} [options]
   * @param {string} [type]     Wall restriction type: sight, light, move, sound
   * @returns {PIXI.Polygon} Triangle between view point and target
   */
  static visionTriangle(viewingPoint, target, { type = "sight"} = {}) {
    const constrainedTokenBorder = ConstrainedTokenBorder.get(target, type).constrainedBorder();
    const keyPoints = constrainedTokenBorder.viewablePoints(viewingPoint, { outermostOnly: true });

    if ( !keyPoints || !keyPoints.length ) {
      log("visionTriangle: no key points found.");
      return constrainedTokenBorder.toPolygon();
    }

    return new PIXI.Polygon([viewingPoint, ...keyPoints]);
  }

  /**
   * Filter relevant objects in the scene using the vision triangle.
   * For the z dimension, keeps objects that are between the lowest target point,
   * highest target point, and the viewing point.
   * @param {Point3d} viewingPoint
   * @param {Token} target
   * @param {object} [options]
   * @param {string} [type]    Wall restriction type: sight, light, move, sound
   * @param {boolean} [filterWalls]   If true, find and filter walls
   * @param {boolean} [filterTokens]  If true, find and filter tokens
   * @param {boolean} [filterTiles]   If true, find and filter tiles
   * @param {string} [viewerId]       Viewer token to exclude from results
   * @return {object} Object with walls, tokens, tiles as three distinct sets or undefined.
   */
  static filterSceneObjectsByVisionTriangle(viewingPoint, target, {
    type = "sight",
    filterWalls = true,
    filterTokens = true,
    filterTiles = true,
    viewer } = {}) {

    const visionTriangle = Area3d.visionTriangle(viewingPoint, target, { type });

    const maxE = Math.max(viewingPoint.z ?? 0, target.topZ);
    const minE = Math.min(viewingPoint.z ?? 0, target.bottomZ);

    const out = { walls: new Set(), tokens: new Set(), tiles: new Set(), drawings: new Set() };
    if ( filterWalls ) {
      out.walls = Area3d.filterWallsByVisionTriangle(viewingPoint, visionTriangle, { type });

      // Filter walls that are definitely too low or too high
      out.walls = out.walls.filter(w => {
        return w.topZ > minE && w.bottomZ < maxE;
      });
    }

    if ( filterTokens ) {
      out.tokens = Area3d.filterTokensByVisionTriangle(visionTriangle, { viewer, target });

      // Filter tokens that are definitely too low or too high
      out.tokens = out.tokens.filter(t => {
        return t.topZ > minE && t.bottomZ < maxE;
      });
    }

    if ( filterTiles ) {
      out.tiles = Area3d.filterTilesByVisionTriangle(visionTriangle);

      // For Levels, "noCollision" is the "Allow Sight" config option. Drop those tiles.
      if ( game.modules.get("levels")?.active && type === "sight" ) {
        out.tiles = out.tiles.filter(t => {
          return !t.document?.flags?.levels?.noCollision;
        });
      }

      // Filter tiles that are definitely too low or too high
      out.tiles = out.tiles.filter(t => {
        const tZ = zValue(t.document.elevation);
        return tZ < maxE && tZ > minE;
      });

      // Check drawings if there are tiles
      if ( out.tiles.size ) out.drawings = Area3d.filterDrawingsByVisionTriangle(visionTriangle);
    }

    return out;
  }

  /**
   * Filter drawings in the scene if they are flagged as holes.
   * @param {PIXI.Polygon} visionTriangle
   */
  static filterDrawingsByVisionTriangle(visionTriangle) {
    let drawings = canvas.drawings.quadtree.getObjects(visionTriangle.getBounds());

    // Filter by holes
    drawings = drawings.filter(d => d.document.getFlag(MODULE_ID, FLAGS.DRAWING.IS_HOLE)
      && ( d.document.shape.type === CONST.DRAWING_TYPES.POLYGON
      || d.document.shape.type === CONST.DRAWING_TYPES.ELLIPSE
      || d.document.shape.type === CONST.DRAWING_TYPES.RECTANGLE));

    if ( !drawings.size ) return drawings;

    // Filter by the precise triangle cone
    // Also convert to CenteredPolygon b/c it handles bounds better
    const edges = [...visionTriangle.iterateEdges()];
    drawings = drawings.filter(d => {
      const dBounds = centeredPolygonFromDrawing(d).getBounds();
      return edges.some(e => dBounds.lineSegmentIntersects(e.A, e.B, { inside: true }));
    });
    return drawings;
  }

  /**
   * Filter tokens in the scene by a triangle representing the view from viewingPoint to
   * token (or other two points). Only considers 2d top-down view.
   * @param {PIXI.Polygon} visionTriangle
   * @param {object} [options]
   * @param {string|undefined} viewerId   Id of viewer token to exclude
   * @param {string|undefined} targetId   Id of target token to exclude
   * @return {Set<Token>}
   */
  static filterTokensByVisionTriangle(visionTriangle, { viewer, target } = {}) {
    let tokens = canvas.tokens.quadtree.getObjects(visionTriangle.getBounds());

    // Filter out the viewer and target token
    tokens.delete(viewer);
    tokens.delete(target);

    if ( !tokens.size ) return tokens;

    // Filter by the precise triangle cone
    // For speed and simplicity, consider only token rectangular bounds
    const edges = [...visionTriangle.iterateEdges()];
    tokens = tokens.filter(t => {
      const tBounds = t.bounds;
      return edges.some(e => tBounds.lineSegmentIntersects(e.A, e.B, { inside: true }));
    });
    return tokens;
  }

  /**
   * Filter tiles in the scene by a triangle representing the view from viewingPoint to
   * token (or other two points). Only considers 2d top-down view.
   * @param {PIXI.Polygon} visionTriangle
   * @return {Set<Tile>}
   */
  static filterTilesByVisionTriangle(visionTriangle) {
    let tiles = canvas.tiles.quadtree.getObjects(visionTriangle.getBounds());
    if ( !tiles.size ) return tiles;

    // Filter by the precise triangle cone
    const edges = [...visionTriangle.iterateEdges()];
    tiles = tiles.filter(t => {
      const tBounds = t.bounds;
      return edges.some(e => tBounds.lineSegmentIntersects(e.A, e.B, { inside: true }));
    });
    return tiles;
  }


  /**
   * Filter walls in the scene by a triangle representing the view from viewingPoint to some
   * token (or other two points). Only considers 2d top-down view.
   * @param {Point3d} viewingPoint
   * @param {PIXI.Polygon} visionTriangle
   * @param {object} [options]
   * @param {string} [type]     Wall restriction type: sight, light, move, sound
   * @return {Set<Wall>}
   */
  static filterWallsByVisionTriangle(viewingPoint, visionTriangle, { type = "sight" } = {}) {
    let walls = canvas.walls.quadtree.getObjects(visionTriangle.getBounds());
    walls = walls.filter(w => Area3d._testWallInclusion(w, viewingPoint, { type }));

    if ( !walls.size ) return walls;

    // Filter by the precise triangle cone.
    const edges = [...visionTriangle.iterateEdges()];
    walls = walls.filter(w => {
      if ( visionTriangle.contains(w.A.x, w.A.y) || visionTriangle.contains(w.B.x, w.B.y) ) return true;
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
  static filterWallsForVisionCone(walls, constrained, origin, type = "sight") {
    const keyPoints = (constrained instanceof PIXI.Polygon)
      ? Area3d.polygonKeyPointsForOrigin(constrained, origin)
      : Area3d.bboxKeyCornersForOrigin(constrained, origin);
    if ( !keyPoints || !keyPoints.length ) return walls;

    const visionPoly = new PIXI.Polygon([origin, ...keyPoints]);

    walls = walls.filter(wall =>
      !wall.document[type]
      || wall.isOpen
      || visionPoly.contains(wall.A.x, wall.A.y)
      || visionPoly.contains(wall.B.x, wall.B.y)
      || visionPoly.linesCross([wall]));

    // Avoid walls that are underground if origin is above ground, or vice-versa
    if ( origin.z >= 0 ) walls = walls.filter(w => w.topZ >= 0);
    else walls = walls.filter(w => w.bottomZ <= 0);

    // Avoid walls for which a tile separates the observer from the wall.
    const rect = new PIXI.Rectangle(origin.x - 1, origin.y - 1, 2, 2);
    const tiles = canvas.tiles.quadtree.getObjects(rect);
    walls = walls.filter(w => !Area3d.isWallBetweenTile(origin, w, tiles));

    return walls;
  }


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
  static isWallBetweenTile(origin, wall, tiles) {
    if ( !tiles ) {
      const rect = new PIXI.Rectangle(origin.x - 1, origin.y - 1, 2, 2);
      tiles = canvas.tiles.quadtree.getObjects(rect);
    }

    for ( const tile of tiles ) {
      if ( !tile.bounds.contains(origin.x, origin.y) ) continue;

      const tileE = tile.document.flags?.levels.rangeBottom ?? tile.document.elevation;
      const tileZ = zValue(tileE);
      if ( (origin.z > tileZ && wall.topZ < tileZ)
        || (origin.z < tileZ && wall.bottomZ > tileZ) ) return true;
    }
    return false;
  }
}
