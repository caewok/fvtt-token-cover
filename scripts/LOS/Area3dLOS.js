/* globals
canvas,
CONST,
foundry,
PIXI
Ray,
Token,
VisionSource
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


/* Testing
Draw = CONFIG.GeometryLib.Draw
Point3d = CONFIG.GeometryLib.threeD.Point3d;
api = game.modules.get("tokenvisibility").api;
Area3dLOS = api.Area3dLOS;

let [viewer] = canvas.tokens.controlled;
let [target] = game.user.targets;

calc = new Area3dLOS(viewer, target)
calc.hasLOS()
calc.percentVisible()

*/


import { AlternativeLOS } from "./AlternativeLOS.js";
import { area3dPopoutData } from "./Area3dPopout.js"; // Debugging pop-up

// PlaceablePoints folder
import { DrawingPoints3d } from "./PlaceablesPoints/DrawingPoints3d.js";
import { TokenPoints3d } from "./PlaceablesPoints/TokenPoints3d.js";
import { TilePoints3d } from "./PlaceablesPoints/TilePoints3d.js";
import { WallPoints3d } from "./PlaceablesPoints/WallPoints3d.js";

// Base folder
import { Settings, SETTINGS, DEBUG_GRAPHICS } from "../settings.js";
import { buildTokenPoints } from "./util.js";

// Geometry folder
import { Draw } from "../geometry/Draw.js"; // For debugging
import { ClipperPaths } from "../geometry/ClipperPaths.js";
import { Matrix } from "../geometry/Matrix.js";
import { Point3d } from "../geometry/3d/Point3d.js";


export class Area3dLOS extends AlternativeLOS {

  /** @type {TokenPoints3d} */
  targetPoints;

  /** @type {TokenPoints3d} */
  visibleTargetPoints;

  /** @type {TokenPoints3d} */
  gridPoints;

  /** @type {Point3d} */
  _targetTop;

  /** @type {Point3d} */
  _targetBottom;

  /** @type {Point3d} */
  _targetCenter;

  /** @type {boolean} */
  #debug = false;

  /** @type {Draw} **/
  drawTool = new Draw();

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

  /** @type {Shadow[]} */
  wallShadows = [];

  /** @type {boolean} */
  #viewIsSet = false;

  /** @type {boolean} */
  #blockingObjectsAreSet = false;

  /** @type {boolean} */
  #blockingObjectsPointsAreSet = false;

  /** @type {boolean} */
  #blockingPointsAreSet = false;

  /**
   * Vector representing the up position on the canvas.
   * Used to construct the token camera and view matrices.
   * @type {Point3d}
   */
  static #upVector = new Point3d(0, 0, -1);

  /**
   * Scaling factor used with Clipper
   */
  static SCALING_FACTOR = 100;

  /**
   * @param {PointSource|Token|VisionSource} viewer   Token, viewing from token.topZ.
   * @param {Target} target                           Target; token is looking at the target center.
   */
  constructor(viewer, target, config = {}) {
    if ( viewer instanceof Token ) viewer = viewer.vision;
    if ( viewer instanceof VisionSource ) config.visionSource ??= viewer;
    super(viewer, target, config);
    this.#configure(config);
    this.targetPoints = new TokenPoints3d(target);
    this.visibleTargetPoints = new TokenPoints3d(target, { tokenBorder: this.config.visibleTargetShape });

    // Set debug only if the target is being targeted.
    // Avoids "double-vision" from multiple targets for area3d on scene.
    if ( this.config.debug ) {
      const targets = canvas.tokens.placeables.filter(t => t.isTargeted);
      this.debug = targets.some(t => t === target);
    }

    if ( this.config.largeTarget ) this.gridPoints = this._buildGridShape();
  }

  #configure(config = {}) {
    if ( !config.visionSource ) { console.error("Area3dLOS requires a visionSource."); }
    const cfg = this.config;
    cfg.visionSource = config.visionSource ?? canvas.tokens.controlled[0] ?? [...canvas.tokens.placeables][0];
  }

  get debug() { return this.#debug; }

  set debug(value) {
    this.#debug = Boolean(value);

    // Turn on popout for the debug
    if ( this.#debug ) {
      if ( !area3dPopoutData.shown ) area3dPopoutData.app.render(true);
      this.drawTool = new Draw(area3dPopoutData.app.graphics);
      this.drawTool.clearDrawings();
    }
  }

  /**
   * Build generic grid shape
   * @returns {TokenPoints3d}
   */
  _buildGridShape() {
    const size = canvas.scene.dimensions.size;
    let tokenBorder = canvas.grid.isHex
      ? new PIXI.Polygon(canvas.grid.grid.getBorderPolygon(1, 1, 0))
      : new PIXI.Rectangle(0, 0, size, size);
    const { x, y } = this.target.center;
    tokenBorder = tokenBorder.translate(x - (size * 0.5), y - (size * 0.5));

    // Transform to TokenPoints3d and calculate viewable area.
    // Really only an estimate b/c the view will shift depending on where on the large token
    // we are looking.
    return new TokenPoints3d(this.target, { tokenBorder });
  }

  /**
   * Area of a basic grid square to use for the area estimate when dealing with large tokens.
   * @returns {number}
   */
  _gridSquareArea() {
    const tGrid = this.gridPoints.perspectiveTransform();
    const sidePolys = tGrid.map(side => new PIXI.Polygon(side));
    return sidePolys.reduce((area, poly) =>
      area += poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}), 0);
  }

  // NOTE ----- USER-FACING METHODS -----

  /**
   * Determine whether a visionSource has line-of-sight to a target based on the percent
   * area of the target visible to the source.
   * @param {number} [thresholdArea]    Area required to have LOS between 0 and 1
   *   0% means any line-of-sight counts.
   *   100% means the entire token must be visible.
   * @returns {boolean}
   */
  hasLOS(thresholdArea) {
    thresholdArea ??= Settings.get(SETTINGS.LOS.TARGET.PERCENT);

    // If center point is visible, then target is likely visible but not always.
    // e.g., walls slightly block the center point. Or walls block all but center.

    const percentVisible = this.percentVisible();
    const hasLOS = !percentVisible.almostEqual(0)
      && ((percentVisible > thresholdArea)
        || percentVisible.almostEqual(thresholdArea));

    if ( this.config.debug ) {
      // Fill in the constrained border on canvas
      const draw = new Draw(DEBUG_GRAPHICS.LOS);
      const color = hasLOS ? Draw.COLORS.green : Draw.COLORS.red;
      const visibleShape = this.config.visibleTargetShape;
      draw.shape(this.target.constrainedTokenBorder, { color, fill: color, fillAlpha: 0.5});
      if ( visibleShape ) draw.shape(visibleShape, { color: Draw.COLORS.yellow });
    }
    return hasLOS;
  }

  /**
   * Determine the percentage area of the 3d token visible to the viewer.
   * Measured by projecting the 3d token to a 2d canvas representing the viewer's perspective.
   * @returns {number}
   */
  percentVisible() {
    const objs = this.blockingObjects;
    if ( !this.debug
      && !objs.walls.size
      && !objs.tiles.size
      && !objs.tokens.size
      && objs.terrainWalls.size < 2 ) return 1;

    const { obscuredSides, sidePolys } = this._obscureSides();
    const obscuredSidesArea = obscuredSides.reduce((area, poly) =>
      area += poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}), 0);
    let sidesArea = sidePolys.reduce((area, poly) =>
      area += poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}), 0);

    if ( this.config.largeTarget ) sidesArea = Math.min(this._gridSquareArea(), sidesArea);

    // Round the percent seen so that near-zero areas are 0.
    // Because of trimming walls near the vision triangle, a small amount of token area can poke through
    let percentSeen = sidesArea ? obscuredSidesArea / sidesArea : 0;
    if ( percentSeen < 0.005 ) percentSeen = 0;

    if ( this.debug ) this.#drawDebugShapes(objs, obscuredSides, sidePolys);
    if ( this.config.debug ) console.debug(`Area3dLOS|${this.target.name} is ${Math.round(percentSeen * 100)}% visible from ${this.config.visionSource?.object?.name}`);
    return percentSeen;
  }

  #drawDebugShapes(objs, obscuredSides, sidePolys) {
    const colors = Draw.COLORS;
    const draw = new Draw(DEBUG_GRAPHICS.LOS); // Draw on the canvas.
    const drawTool = this.drawTool; // Draw in the pop-up box.
    this._drawLineOfSight();

    // Draw the detected objects on the canvas
    objs.walls.forEach(w => draw.segment(w, { color: colors.blue }));
    objs.tiles.forEach(t => draw.shape(t.bounds, { color: colors.yellow, fillAlpha: 0.5 }));
    objs.terrainWalls.forEach(w => draw.segment(w, { color: colors.lightgreen }));
    objs.drawings.forEach(d => draw.shape(d.bounds, { color: colors.gray, fillAlpha: 0.5 }));
    objs.tokens.forEach(t => draw.shape(t.constrainedTokenBorder, { color: colors.orange, fillAlpha: 0.5 }));

    // Draw the target in 3d, centered on 0,0
    this.visibleTargetPoints.drawTransformed({ color: colors.black, drawTool });
    if ( this.gridPoints ) this.gridPoints.drawTransformed({ color: colors.lightred, drawTool });

    // Draw the detected objects in 3d, centered on 0,0
    const pts = this.config.debugDrawObjects ? this.blockingObjectsPoints : this.blockingPoints;
    pts.walls.forEach(w => w.drawTransformed({ color: colors.blue, drawTool }));
    pts.tiles.forEach(w => w.drawTransformed({ color: colors.yellow, drawTool }));
    pts.drawings.forEach(d => d.drawTransformed({ color: colors.gray, fillAlpha: 0.7, drawTool }));
    pts.tokens.forEach(t => t.drawTransformed({ color: colors.orange, drawTool }));
    pts.terrainWalls.forEach(w => w.drawTransformed({ color: colors.lightgreen, fillAlpha: 0.1, drawTool }));

    // Calculate the areas of the target faces separately, along with the obscured side areas.
    const target = this.target;
    const { topZ, bottomZ } = target;
    const height = topZ - bottomZ;
    this.debugSideAreas = {
      top: target.w * target.h,
      ogSide1: target.w * height,
      ogSide2: target.h * height,
      sides: [],
      obscuredSides: []
    };
    this.debugSideAreas.sides = sidePolys.map(poly =>
      poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}));
    this.debugSideAreas.obscuredSides = obscuredSides.map(poly =>
      poly.scaledArea({scalingFactor: Area3d.SCALING_FACTOR}));
  }

  // NOTE ----- GETTERS / SETTERS ----- //

  /** @type {BlockingObjects} */
  get blockingObjects() {
    if ( !this.#blockingObjectsAreSet ) this._findBlockingObjects();
    return this._blockingObjects;
  }

  /** @type {BlockingObjectsPoints} */
  get blockingObjectsPoints() {
    if ( !this.#blockingObjectsPointsAreSet ) this._constructBlockingObjectsPoints();
    return this._blockingObjectsPoints;
  }

  /** @type {BlockingPoints} */
  get blockingPoints() {
    if ( !this.#blockingPointsAreSet ) this._constructBlockingPointsArray();
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
    return this._visionPolygon || (this._visionPolygon = Area3d.visionPolygon(this.viewerPoint, this.target));
  }

  // NOTE ----- PRIMARY METHODS ----- //

  /**
   * Calculate the view matrix for the given token and target.
   * Also sets the view matrix for the target, walls, tiles, and other tokens as applicable.
   */
  calculateViewMatrix() {
    this._calculateViewerCameraMatrix();

    // Set the matrix to look at the target from the viewer.
    const { visibleTargetPoints, targetPoints, gridPoints, viewerPoint, viewerViewM } = this;
    targetPoints.setViewingPoint(viewerPoint);
    targetPoints.setViewMatrix(viewerViewM);
    visibleTargetPoints.setViewingPoint(viewerPoint);
    visibleTargetPoints.setViewMatrix(viewerViewM);
    if ( gridPoints ) {
      gridPoints.setViewingPoint(viewerPoint);
      gridPoints.setViewMatrix(viewerViewM);
    }

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

    this.#viewIsSet = true;
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
    if ( !this.#viewIsSet ) this.calculateViewMatrix();
    const blockingPoints = this.blockingPoints;

    // Combine terrain walls
    const combinedTerrainWalls = blockingPoints.terrainWalls.length > 1
      ? WallPoints3d.combineTerrainWalls(blockingPoints.terrainWalls, this.viewerPoint, {
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
    const tVisibleTarget = this.visibleTargetPoints.perspectiveTransform();
    const visibleSidePolys = tVisibleTarget.map(side => new PIXI.Polygon(side));
    const obscuredSides = blockingObject
      ? visibleSidePolys.map(side => blockingObject.diffPolygon(side))
      : visibleSidePolys;

    // Calculate the non-obscured sides.
    const tTarget = this.targetPoints.perspectiveTransform();
    const sidePolys = tTarget.map(side => new PIXI.Polygon(side));

    return { obscuredSides, sidePolys };
  }

  // NOTE ----- GETTER/SETTER HELPER METHODS ----- //

  /**
   * Construct the transformation matrix to rotate the view around the center of the token.
   */
  _calculateViewerCameraMatrix() {
    const cameraPosition = this.viewerPoint;
    const targetPosition = this.targetCenter;
    return Matrix.lookAt(cameraPosition, targetPosition, this.constructor.#upVector);
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
      liveTokensBlock,
      deadTokensBlock,
      tilesBlock,
      visionSource } = this.config;

    // Clear any prior objects from the respective sets
    const { terrainWalls, walls } = this._blockingObjects;
    terrainWalls.clear();
    walls.clear();

    const filterConfig = {
      type,
      filterWalls: wallsBlock,
      filterTokens: liveTokensBlock || deadTokensBlock,
      filterTiles: tilesBlock,
      debug: this.debug,
      viewer: visionSource.object
    };
    const objsFound = this.constructor.filterSceneObjectsByVisionPolygon(this.viewerPoint, this.target, filterConfig);

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

    this.#blockingObjectsAreSet = true;
    this.#blockingObjectsPointsAreSet = false;
    this.#blockingPointsAreSet = false;
    this.#viewIsSet = false;
  }

  /**
   * Convert blocking objects into PlanePoints.
   * These will eventually be used by _obscureSides to project 2d perspective objects
   * that may block the target sides.
   */
  _constructBlockingObjectsPoints() {
    const blockingObjs = this.blockingObjects;

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
    blockingObjs.walls.forEach(w => {
      // Sometimes w can be WallPoints3d. See issue #48.
      if ( w instanceof WallPoints3d ) walls.add(w);
      else walls.add(new WallPoints3d(w));
    });

    // Add Terrain Walls
    blockingObjs.terrainWalls.forEach(w => terrainWalls.add(new WallPoints3d(w)));

    this.#blockingObjectsPointsAreSet = true;
    this.#blockingPointsAreSet = false;
    this.#viewIsSet = false;
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
    const viewerLoc = this.viewerPoint;

    if ( this.config.debug ) {
      const draw = new Draw(DEBUG_GRAPHICS.LOS);
      draw.shape(visionPolygon, { fill: Draw.COLORS.lightblue, fillAlpha: 0.2 });
    }

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

    this.#blockingPointsAreSet = true;
    this.#viewIsSet = false;
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
    const paths = ClipperPaths.fromPolygons(transformed, { scalingFactor: this.constructor.SCALING_FACTOR });
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
    const paths = ClipperPaths.fromPolygons(transformed, { scalingFactor: this.constructor.SCALING_FACTOR });
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
      tiles = ClipperPaths.fromPolygons(tiles, {scalingFactor: this.constructor.SCALING_FACTOR});
      tiles.combine().clean();
      return tiles;
    }

    // Check if any drawings might create a hole in one or more tiles
    const tilesUnholed = [];
    const tilesHoled = [];
    const scalingFactor = this.constructor.SCALING_FACTOR;
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
        const drawingHolesPaths = ClipperPaths.fromPolygons(drawingHoles, { scalingFactor });
        const tileHoled = drawingHolesPaths.diffPolygon(tilePoly);
        tilesHoled.push(tileHoled);
      } else tilesUnholed.push(tilePoly);
    }

    if ( tilesUnholed.length ) {
      const unHoledPaths = ClipperPaths.fromPolygons(tilesUnholed, { scalingFactor });
      unHoledPaths.combine().clean();
      tilesHoled.push(unHoledPaths);
    }

    // Combine all the tiles, holed and unholed
    const tiles = ClipperPaths.combinePaths(tilesHoled);
    tiles.combine().clean();
    return tiles;
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
    if ( !foundry.utils.orient2dFast(this.viewerPoint, wall.A, wall.B)
      && !foundry.utils.orient2dFast(this.targetCenter, wall.A, wall.B) ) return false;

    // Ignore one-directional walls facing away from the origin
    const side = wall.orientPoint(this.viewerPoint);
    return !wall.document.dir || (side !== wall.document.dir);
  }

  /**
   * Construct walls based on limited angle rays
   * Start 1 pixel behind the origin
   * @returns {null|WallPoints3d[2]}
   */
  _constructLimitedAngleWallPoints3d() {
    const angle = this.config.visionSource.data.angle;
    if ( angle === 360 ) return null;

    const { x, y, rotation } = this.config.visionSource.data;
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
    const draw = new Draw(DEBUG_GRAPHICS.LOS);
    draw.segment({A: this.viewerPoint, B: this.targetCenter});
  }
}

/** For backwards compatibility */
export const Area3d = Area3dLOS;

