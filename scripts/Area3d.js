/* globals
PIXI,
canvas,
game,
foundry,
Token,
Tile,
ClipperLib,
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

import { MODULE_ID } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { Shadow, truncateWallAtElevation } from "./Shadow.js";
import { Matrix } from "./Matrix.js";
import { Point3d } from "./Point3d.js";
import { Plane } from "./Plane.js";
import { elementsByIndex, zValue, log, getObjectProperty } from "./util.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import { ClipperPaths } from "./ClipperPaths.js";
import * as drawing from "./drawing.js"; // For debugging

export class Area3d {

  /** @type {VisionSource} */
  viewer = undefined;

  /** @type {Point3d} */
  _viewerCenter = undefined;

  /** @type {Token} */
  target = undefined;

  /** @type object */
  config = {};

  /** @type {string} */
  type = "sight";

  /** @type {boolean} */
  debug = false;

  /** @type {object}:
   *   walls: Set<WallPoints3d>|undefined,
   *   tiles: Set<WallPoints3d>|undefined,
   *  tokens: Set<TokenPoints3d>|undefined}
   *  terrainWalls: Set<WallPoints3d>|undefined
   */
  _blockingObjects = undefined;

  /** @type {Point3d[]} */
  _transformedTarget = undefined;

  /** @type {object[]}  An object with A and B. */
  _transformedWalls = undefined;

  /** @type {Shadow[]} */
  wallShadows = [];

  /** @type {boolean} */
  viewIsSet = false;

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
    return this._blockingObjects ?? (this._blockingObjects = this._findBlockingObjects());
  }

  /**
   * Get the shadows for each wall and side.
   * @type {Shadow[nSides][nShadows]}
   */
  get transformedShadows() {
    return this._transformedShadows || (this._transformedShadows = this._projectShadowsForWalls());
  }

  get perspectiveShadows() {
    const tShadowArr = this.transformedShadows; // Shadow[nSides][nShadows]
    const out = [];
    for ( const shadows of tShadowArr ) {
      if ( !shadows.length ) out.push([]);
      else out.push(shadows.map(shadow =>
        new Shadow(shadow._points3d.map(pt => Area3d.perspectiveTransform(pt)))));
    }

    return out;
  }

  static perspectiveTransform(pt) {
    const mult = 1000 / -pt.z;
    return new PIXI.Point(pt.x * mult, pt.y * mult);
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
    objs.tokens.forEach(t => {
      t.setViewingPoint(this.viewerCenter);
      t.setViewMatrix(this.viewerViewM);
    });

    this.viewIsSet = true;
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
   * Determine the inner angle between two segments.
   * Usually the two segments should share an endpoint.
   * @param {PIXI.Point} a    Endpoint of AB segment
   * @param {PIXI.Point} b    Endpoint of AB segment
   * @param {PIXI.Point} c    Endpoint of CD segment
   * @param {PIXI.Point} d    Endpoint of CD segment
   * @returns {number}
   */
  static angleBetweenSegments(a, b, c, d) {
    // Dot product of the two vectors
    // Divide by magnitude of the first
    // Divide by magnitude of the second
    const V1 = b.subtract(a);
    const V2 = d.subtract(c);
    const mag = (V1.magnitude() * V2.magnitude());
    if ( !mag ) return 0;

    return Math.acos(V1.dot(V2) / (V1.magnitude() * V2.magnitude()));
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
   * Construct wall shadows in the transformed coordinates.
   * Shadows for where walls block vision of the token due to angle of token view --> wall edge.
   * Each edge is considered a separate "wall".
   * - Treat the wall as 2d, with each edge a line that can block vision.
   */
  _projectShadowsForWalls() {
    // TODO: Fix
    console.error("_projectShadowsForWalls not implemented.");
    return;

    if ( !this.viewIsSet ) this.calculateViewMatrix();

    const origin = new Point3d(0, 0, 0);
    const tTarget = this.targetPoints.tFaces;
    const tWalls = this.blockingObjects.walls.map(w => w.tPoints);

    const sides = tTarget.sides;
    const shadowsArr = [];
    for ( const side of sides ) {
      const shadows = [];
      shadowsArr.push(shadows);
      const sidePoints = elementsByIndex(tTarget.points, side);
      const sidePlane = Plane.fromPoints(sidePoints[0], sidePoints[1], sidePoints[2]);

      for ( const wall of tWalls ) {
        const ln = wall.length;
        // For each wall edge, construct shadow
        let A = wall[ln - 1];
        for ( let i = 0; i < ln; i += 1 ) {
          const B = wall[i];
          const shadow = Shadow.complexSurfaceOriginAbove(A, B, origin, sidePlane);
          if ( shadow ) shadows.push(shadow);
          A = B;
        }
      }
    }
    return shadowsArr;
  }

  _obscureSides() {
    if ( !this.viewIsSet ) this.calculateViewMatrix();

    const tTarget = this.targetPoints.perspectiveTransform();
    const walls = this.blockingObjects.walls.map(w => w.perspectiveTransform());

    if ( this.blockingObjects.terrainWalls.size > 1 && !this.blockingObjects.combinedTerrainWalls) {
      console.log("_obscureSides: need to handle terrain walls!");

      const tws = this.blockingObjects.terrainWalls.map(w => {
        if ( !w.viewIsSet ) w.setViewMatrix(this.viewerViewM);
        return w.perspectiveTransform();
      });
      this.blockingObjects.combinedTerrainWalls = WallPoints3d.combineTerrainWalls(tws);
    }

    const combinedTerrainWalls = this.blockingObjects.combinedTerrainWalls;
    const shadowsArr = this.config._useShadows ? this.perspectiveShadows : undefined;
    const wallPolys = walls.map(w => new PIXI.Polygon(w));

    // For each side, union the blocking wall with any shadows and then take diff against the side
    const nSides = tTarget.length;
    const obscuredSides = [];
    this.sidePolys = [];
    for ( let i = 0; i < nSides; i += 1 ) {
      const side = tTarget[i];
      const sidePoly = new PIXI.Polygon(side);
      this.sidePolys.push(sidePoly);

      const blockingPolygons = [...wallPolys];
      if ( this.config._useShadows ) blockingPolygons.push(...shadowsArr[i]);

      let obscuredSide = Shadow.combinePolygonWithShadows(sidePoly, blockingPolygons);

      if ( combinedTerrainWalls ) {
        // Same underlying code used in Shadow.combinePolygonWithShadows
        // TODO: Clean this up; don't translate back from Clipper to Polygon.
        const c = new ClipperLib.Clipper();
        const solution = new ClipperPaths();
        const type = ClipperLib.ClipType.ctDifference;
        const subjFillType = ClipperLib.PolyFillType.pftEvenOdd;
        const clipFillType = ClipperLib.PolyFillType.pftEvenOdd;
        solution.scalingFactor = 1;
        if ( obscuredSide instanceof PIXI.Polygon ) obscuredSide = obscuredSide.toClipperPoints({ scalingFactor: 1 });

        c.AddPath(obscuredSide, ClipperLib.PolyType.ptSubject, true);
        c.AddPaths(combinedTerrainWalls, ClipperLib.PolyType.ptClip, true);
        c.Execute(type, solution.paths, subjFillType, clipFillType);
        solution.clean();

        obscuredSide = solution;
      }

      obscuredSides.push(obscuredSide);
    }

    return obscuredSides;
  }

  /**
   * Determine the percentage area of the 3d token visible to the viewer.
   * Measured by projecting the 3d token to a 2d canvas representing the viewer's perspective.
   * @returns {number}
   */
  percentAreaVisible() {
    if ( !this.debug
      && !this.blockingObjects.walls.size
      && !this.blockingObjects.tiles.size
      && !this.blockingObjects.tokens.size
      && this.blockingObjects.terrainWalls.size < 2 ) return 1;

    const obscuredSides = this.obscuredSides;
    if ( this.debug ) {
      this._drawLineOfSight();
      this.targetPoints.drawTransformed();
      this.blockingObjects.walls.forEach(w => w.drawTransformed());
      this.blockingObjects.tiles.forEach(w => w.drawTransformed({color: drawing.COLORS.yellow}));
      this.blockingObjects.tokens.forEach(t => t.drawTransformed({color: drawing.COLORS.orange}));
      this.blockingObjects.terrainWalls.forEach(w =>
        w.drawTransformed({ color: drawing.COLORS.lightgreen, fillAlpha: 0.1 }));

      if ( this.blockingObjects.combinedTerrainWalls )
        this.blockingObjects.combinedTerrainWalls.draw({color: drawing.COLORS.green, fillAlpha: 0.3});

      if (this.config._useShadows ) this._drawTransformedShadows();

      const target = this.target;
      this.debugSideAreas = {
        top: target.w * target.h,
        ogSide1: target.w * (target.topZ - target.bottomZ),
        ogSide2: target.h * (target.topZ - target.bottomZ),
        sides: [],
        obscuredSides: []
      };
    }

    let sidesArea = 0;
    let obscuredSidesArea = 0;
    const nSides = obscuredSides.length;
    for ( let i = 0; i < nSides; i += 1 ) {
      const sideArea = this.sidePolys[i].area();
      const obscuredSideArea = obscuredSides[i].area();

      sidesArea += sideArea;
      obscuredSidesArea += obscuredSideArea;
      if ( this.debug ) {
        this.debugSideAreas.sides.push(sideArea);
        this.debugSideAreas.obscuredSides.push(obscuredSideArea);
      }
    }

    const out = sidesArea ? obscuredSidesArea / sidesArea : 0;
    if ( this.debug ) console.log(`${this.viewer.object.name} sees ${out * 100}% of ${this.target.name} (Area3d).`);

    return out;
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

    const out = Area3d.filterSceneObjectsByVisionTriangle(this.viewerCenter, this.target, {
      type,
      filterWalls: wallsBlock,
      filterTokens: tokensBlock,
      filterTiles: tilesBlock,
      viewer: this.viewer.object });

    if ( out.tiles.size ) out.tiles = out.tiles.map(t => new WallPoints3d(t));

    if ( out.tokens.size ) {
      // Check for dead tokens and either set to half height or omit, dependent on settings.
      const hpAttribute = getSetting(SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE);

      // Filter live or dead tokens, depending on config.
      if ( liveTokensBlock ^ deadTokensBlock ) { // We handled tokensBlock above
        out.tokens = out.tokens.filter(t => {
          const hp = getObjectProperty(t.actor, hpAttribute);
          if ( typeof hp !== "number" ) return true;

          if ( liveTokensBlock && hp > 0 ) return true;
          if ( deadTokensBlock && hp <= 0 ) return true;
          return false;
        });
      }

      // Construct the TokenPoints3d for each token, using half-height if required
      if ( deadHalfHeight ) {
        out.tokens = out.tokens.map(t => {
          const hp = getObjectProperty(t.actor, hpAttribute);
          const halfHeight = (typeof hp === "number") && (hp <= 0);
          return new TokenPoints3d(t, this.config.type, halfHeight);
        });
      } else {
        out.tokens = out.tokens.map(t => new TokenPoints3d(t, this.config.type));
      }
    }

    // Separate the terrain walls
    out.terrainWalls = new Set();
    if ( out.walls.size ) {
      out.walls = out.walls.map(w => new WallPoints3d(w));
      out.walls.forEach(w => {
        if ( w.wall.document[this.config.type] === CONST.WALL_SENSE_TYPES.LIMITED ) {
          out.terrainWalls.add(w);
          out.walls.delete(w);
        }
      });
    }

    return out;
  }

  /**
   * For debugging.
   * Draw the line of sight from token to target.
   */
  _drawLineOfSight() {
    drawing.drawSegment({A: this.viewerCenter, B: this.targetCenter});
  }

  /**
   * For debugging.
   */
  _drawTransformedShadows(perspective = true) {
    const shadowsArr = perspective ? this.perspectiveShadows : this.transformedShadows;
    const nSides = shadowsArr.length;
    for ( let i = 0; i < nSides; i += 1 ) {
      this._drawTransformedShadowsForSide(i, perspective);
    }
  }

  _drawTransformedShadowsForSide(side = 0, perspective = true) {
    const shadowsArr = perspective ? this.perspectiveShadows : this.transformedShadows;
    shadowsArr[side].forEach(s => s.draw());
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
    const keyPoints = (constrainedTokenBorder instanceof PIXI.Polygon)
      ? Area3d.polygonKeyPointsForOrigin(constrainedTokenBorder, viewingPoint)
      : Area3d.bboxKeyCornersForOrigin(constrainedTokenBorder, viewingPoint);
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

    const out = { walls: new Set(), tokens: new Set(), tiles: new Set() };
    if ( filterWalls ) {
      out.walls = Area3d.filterWallsByVisionTriangle(viewingPoint, visionTriangle, { type });

      // Filter walls that are definitely too low or too high
      out.walls = out.walls.filter(w => {
        return w.topZ > minE && w.bottomZ < maxE;
      });
    }

    if ( filterTokens ) {
      out.tokens = Area3d.filterTokensByVisionTriangle(viewingPoint, visionTriangle, { viewer, target });

      // Filter tokens that are definitely too low or too high
      out.tokens = out.tokens.filter(t => {
        return t.topZ > minE && t.bottomZ < maxE;
      });
    }

    if ( filterTiles ) {
      out.tiles = Area3d.filterTilesByVisionTriangle(viewingPoint, visionTriangle);

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
    }

    return out;
  }

  /**
   * Filter tokens in the scene by a triangle representing the view from viewingPoint to
   * token (or other two points). Only considers 2d top-down view.
   * @param {Point3d} viewingPoint
   * @param {PIXI.Polygon} visionTriangle
   * @param {object} [options]
   * @param {string|undefined} viewerId   Id of viewer token to exclude
   * @param {string|undefined} targetId   Id of target token to exclude
   * @return {Set<Token>}
   */
  static filterTokensByVisionTriangle(viewingPoint, visionTriangle, { viewer, target } = {}) {
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
   * @param {Point3d} viewingPoint
   * @param {PIXI.Polygon} visionTriangle
   * @return {Set<Tile>}
   */
  static filterTilesByVisionTriangle(viewingPoint, visionTriangle) {
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

  /**
   * Returns the two points of the polygon that are on the edge of the viewable perimeter
   * as seen from an origin.
   * @param {PIXI.Polygon} poly
   * @param {Point} origin
   * @return {Point[]|null} Returns null if origin is inside the polygon
   */
  static polygonKeyPointsForOrigin(poly, origin, { returnKeys = false } = {}) {
    // Key point is a line from origin to the point that does not intersect the polygon
    // the outermost key points are the most ccw and cw of the key points.

    // Possible paths:
    // 1. n   n   n   key key key
    // 2. key key key n   n   n
    // 3. key key n   n   key  <-- last key(s) should be shifted to beginning of array
    // 4. n   n   key key key n

    const pts = [...poly.iteratePoints({ close: false })];
    const nPts = pts.length;
    const startKeys = [];
    const endKeys = [];

    let foundNonKeyFirst = false;
    let foundNonKeyAfter = false;
    let foundKey = false;
    for ( let i = 0; i < nPts; i += 1 ) {
      let isKey = true;
      const pt = pts[i];


      for ( const edge of poly.iterateEdges() ) {
        if ( (edge.A.x === pt.x && edge.A.y === pt.y)
          || (edge.B.x === pt.x && edge.B.y === pt.y) ) continue;

        if ( foundry.utils.lineSegmentIntersects(origin, pt, edge.A, edge.B) ) {
          isKey = false;
          break;
        }
      }

      if ( isKey ) {
        foundKey = true;
        !foundNonKeyAfter && startKeys.push(i); // eslint-disable-line no-unused-expressions
        foundNonKeyAfter && endKeys.push(i); // eslint-disable-line no-unused-expressions
      } else { // !isKey
        foundNonKeyFirst ||= !foundKey;
        foundNonKeyAfter ||= foundKey;
        if ( foundNonKeyFirst && foundKey ) break; // Finished the key sequence
      }
    }

    // Keep the keys CW, same order as pts

    const keys = [...endKeys, ...startKeys];
    return returnKeys ? keys : [pts[keys[0]], pts[keys[keys.length - 1]]];
  }

  /**
   * Returns the two corners of the bounding box that are on the edge of the viewable
   * perimeter of the bounding box, as seen from an origin.
   * @param {PIXI.Rectangle} bbox
   * @param {Point} origin
   * @return {Point[]|null} Returns null if origin is inside the bounding box.
   */
  static bboxKeyCornersForOrigin(bbox, origin) {
    const zones = PIXI.Rectangle.CS_ZONES;
    switch ( bbox._getZone(origin) ) {
      case zones.INSIDE: return null;
      case zones.TOPLEFT: return [{ x: bbox.left, y: bbox.bottom }, { x: bbox.right, y: bbox.top }];
      case zones.TOPRIGHT: return [{ x: bbox.left, y: bbox.top }, { x: bbox.right, y: bbox.bottom }];
      case zones.BOTTOMLEFT: return [{ x: bbox.right, y: bbox.bottom }, { x: bbox.left, y: bbox.top }];
      case zones.BOTTOMRIGHT: return [{ x: bbox.right, y: bbox.top }, { x: bbox.left, y: bbox.bottom }];

      case zones.RIGHT: return [{ x: bbox.right, y: bbox.top }, { x: bbox.right, y: bbox.bottom }];
      case zones.LEFT: return [{ x: bbox.left, y: bbox.bottom }, { x: bbox.left, y: bbox.top }];
      case zones.TOP: return [{ x: bbox.left, y: bbox.top }, { x: bbox.right, y: bbox.top }];
      case zones.BOTTOM: return [{ x: bbox.right, y: bbox.bottom }, { x: bbox.left, y: bbox.bottom }];
    }

    return undefined; // Should not happen
  }

}

/**
 * Represent a token as a set of 3d points, representing its corners.
 * If the token has no height, give it a minimal height.
 */
export class TokenPoints3d {

  /** @type {Token} */
  token = undefined;

  /** @type {string} */
  type = "sight";

  /** @type {Point3d[]} */
  bottomPoints = [];

  /** @type {Point3d[]} */
  topPoints = [];

  /** @type {PIXI.Polygon} */
  tokenPolygon = new PIXI.Polygon();

  /** @type {Point3d[][]} */
  faces = [];

  /** @type {Point3d[][]} */
  tFaces = [];

  /** @type {Matrix} */
  M = undefined;

  /** @type {boolean} */
  viewIsSet = false;

  /** @type {Point3d} */
  viewingPoint = undefined;

  /**
   * @param {Token} token
   * @param {string} type     Wall restriction type, for constructing the constrained token shape.
   */
  constructor(token, type = "sight", halfHeight = false) {
    this.token = token;
    this.type = type;
    this.halfHeight = halfHeight;

    const constrainedTokenBorder = ConstrainedTokenBorder.get(this.token, this.type).constrainedBorder();
    this.tokenPolygon = constrainedTokenBorder instanceof PIXI.Rectangle
      ? constrainedTokenBorder.toPolygon() : constrainedTokenBorder;

    // Determine the top and bottom points
    this._setTopBottomPoints();
  }

  /**
   * Create the 3d top and bottom points for this token.
   */
  _setTopBottomPoints() {
    const points = this._points2d();
    const { topZ, bottomZ } = this;

    const nPts = points.length;
    this.topPoints = Array(nPts);
    this.bottomPoints = Array(nPts);
    for ( let i = 0; i < nPts; i += 1 ) {
      const pt = points[i];
      this.topPoints[i] = new Point3d(pt.x, pt.y, topZ);
      this.bottomPoints[i] = new Point3d(pt.x, pt.y, bottomZ);
    }
  }

  /** @type {number} */
  get bottomZ() {
    return this.token.bottomZ;
  }

  /** @type {number} */
  get topZ() {
    const { topZ, bottomZ } = this.token;
    return topZ === this.bottomZ ? (topZ + 2)
      : this.halfHeight ? topZ - ((topZ - bottomZ) * 0.5)
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
    this.M = M;
    this.tFaces = this._transform(M);
    this.viewIsSet = true;
  }

  /**
   * Helper to get the points of the token border.
   */
  _points2d() {
    return [...this.tokenPolygon.iteratePoints()];
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

    if ( viewingPoint.z > this.topZ ) sides.push(this.topPoints);
    else if ( viewingPoint.z < this.bottomZ ) sides.push(this.bottomPoints);

    return sides;
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
    const { topPoints, bottomPoints, tokenPolygon } = this;
    const keys = Area3d.polygonKeyPointsForOrigin(tokenPolygon, viewingPoint, { returnKeys: true });

    const nSides = keys.length - 1;
    const sides = Array(nSides);
    for ( let i = 0; i < nSides; i += 1 ) {
      const t0 = topPoints[keys[i]];
      const t1 = topPoints[keys[i+1]];
      const b0 = bottomPoints[keys[i]];
      const b1 = bottomPoints[keys[i+1]];
      sides[i] = [t0, b0, b1, t1];
    }
    return sides;
  }

  /**
   * Transform the faces using a transformation matrix.
   * @param {Matrix} M
   */
  _transform(M) {
    return this.faces.map(face => face.map(pt => Matrix.fromPoint3d(pt).multiply(M).toPoint3d()));
  }

  /**
   * Transform the wall to a 2d perspective.
   * @returns {Point2d[]}
   */
  perspectiveTransform() {
    return this.tFaces.map(face => face.map(pt => Area3d.perspectiveTransform(pt)));
  }

  /**
   * Draw the constrained token shape and the points on the 2d canvas.
   */
  draw() {
    drawing.drawShape(this.tokenPolygon, { color: drawing.COLORS.red });
    if ( this.viewingPoint ) drawing.drawSegment(
      { A: this.viewingPoint, B: this.token.center },
      { color: drawing.COLORS.blue, alpha: 0.5 });
    this.topPoints.forEach(pt => drawing.drawPoint(pt));
  }

  /**
   * Draw the transformed faces.
   * @param {object} [options]
   * @param {boolean} [perspective]   Draw using 2d perspective.
   */
  drawTransformed({perspective = true, color = drawing.COLORS.red} = {}) {
    if ( !this.viewIsSet ) {
      console.warn(`TokenPoints3d: View is not yet set for Token ${this.token.name}.`);
      return;
    }

    const t = perspective ? this.perspectiveTransform() : this.tFaces;
    t.forEach(side => side.forEach(pt => drawing.drawPoint(pt, { color })));
    t.forEach(side => this._drawSide(side, { color}));
  }

  /**
   * Draw a side.
   */
  _drawSide(side, { color = drawing.COLORS.blue } = {}) {
    const ln = side.length;
    for ( let i = 1; i < ln; i += 1 ) {
      drawing.drawSegment({A: side[i - 1], B: side[i]}, { color });
    }
    drawing.drawSegment({A: side[ln - 1], B: side[0]}, { color });
  }

  /**
   * Transform the faces using a provided function.
   * @param {function} transformFn
   * @returns {Point3d[][]}
   */
//   static transformFaces(faces, transformFn) {
//     // Use for loop with preset arrays for speed. Map would be simpler.
//     const nFaces = faces.length;
//     const tFaces = Array(nFaces);
//     for ( let i = 0; i < nFaces; i += 1 ) {
//       const face = faces[i];
//       const nPts = face.length;
//       const tFace = Array(nPts);
//       tFaces[i] = tFace;
//       for ( let j = 0; j < nPts; j += 1 ) {
//         tFace[j] = transformFn(face[j]);
//       }
//     }
//     return tFaces;
//   }
}


/**
 * Represent a wall or tile as a set of 4 3d points
 * To avoid numeric difficulties, set the top and bottom elevations to max radius and
 * negative max radius, respectively, of the scene if the respective elevation is infinite.
 */
export class WallPoints3d {

  /**
   * Wall: TopA, TopB, bottomB, bottomA
   * Tile: xy, xy + width, xy + width + height, xy + height
   * @type {Point3d}
   */
  points = Array(4);

  /**
   * Points when a transform is set
   * @type {Point3d}
   */
  tPoints = Array(4);

  /** @type {Wall|Tile} */
  wall;

  /** @type {boolean} */
  isTile = false;

  /** @type {boolean} */
  viewIsSet = false;

  /**
   * @param {Wall|Tile}
   */
  constructor(wall) {
    this.wall = wall;

    if ( wall instanceof Tile ) {
      const { x, y, width, height, elevation } = wall.document;
      const eZ = zValue(elevation); // There is a wall.document.z value but not sure from where -- Levels?
      this.isTile = true;


      this.points[0] = new Point3d(x, y, eZ);
      this.points[1] = new Point3d(x + width, y, eZ);
      this.points[2] = new Point3d(x + width, y + height, eZ);
      this.points[3] = new Point3d(x, y + height, eZ);

    } else {
      const { A, B, topZ, bottomZ } = wall;
      const maxR = canvas.dimensions.maxR;

      const top = isFinite(topZ) ? topZ : maxR;
      const bottom = isFinite(bottomZ) ? bottomZ : -maxR;

      this.points[0] = new Point3d(A.x, A.y, top);
      this.points[1] = new Point3d(B.x, B.y, top);
      this.points[2] = new Point3d(B.x, B.y, bottom);
      this.points[3] = new Point3d(A.x, A.y, bottom);

    }
  }

  /**
   * Set the view matrix used to transform the wall and transform the wall points.
   * @param {Matrix} M
   */
  setViewMatrix(M) {
    this.M = M;
    this._transform(M);
    this._truncateTransform();
    this.viewIsSet = true;
  }

  /**
   * Transform the point using a transformation matrix.
   * @param {Matrix} M
   */
  _transform(M) {
    for ( let i = 0; i < 4; i += 1 ) {
      this.tPoints[i] = Matrix.fromPoint3d(this.points[i]).multiply(M).toPoint3d();
    }
  }

  /**
   * Truncate the transformed walls to keep only the below z = 0 portion
   */
  _truncateTransform(rep = 0) {
    if ( rep > 1 ) return;

    let needsRep = false;
    const targetE = -1;
    let A = this.tPoints[3];
    for ( let i = 0; i < 4; i += 1 ) {
      const B = this.tPoints[i];
      const Aabove = A.z > targetE;
      const Babove = B.z > targetE;
      if ( Aabove && Babove ) needsRep = true; // Cannot redo the A--B line until others points are complete.
      if ( !(Aabove ^ Babove) ) continue;

      const res = truncateWallAtElevation(A, B, targetE, -1, 0);
      if ( res ) {
        A.copyFrom(res.A);
        B.copyFrom(res.B);
      }
      A = B;
    }
    rep += 1;
    needsRep && this._truncateTransform(rep); // eslint-disable-line no-unused-expressions
  }

  /**
   * Transform the wall to a 2d perspective.
   * @returns {Point2d[]}
   */
  perspectiveTransform() {
    return this.tPoints.map(pt => Area3d.perspectiveTransform(pt));
  }

  /**
   * Draw the wall or tile shape and points on the 2d canvas.
   */
  draw(options = {}) {
    this.points.forEach(pt => drawing.drawPoint(pt, options));

    for ( let i = 1; i < 4; i += 1 ) {
      drawing.drawSegment({ A: this.points[i - 1], B: this.points[i] }, options);
    }
    drawing.drawSegment({ A: this.points[3], B: this.points[0] }, options);
  }

  /**
   * Draw the transformed shape.
   */
  drawTransformed({perspective = true, color = drawing.COLORS.blue, fillAlpha = 0.2 } = {}) {
    if ( !this.viewIsSet ) {
      console.warn(`WallPoints3d: View is not yet set for ${this.isTile ? "tile" : "wall"} ${this.wall.id}.`);
      return;
    }
    const pts = perspective ? this.perspectiveTransform() : this.tPoints;
    const poly = new PIXI.Polygon(pts);
    drawing.drawShape(poly, { color, fill: color, fillAlpha });
  }

  /**
   * Given an array of terrain walls, trim the polygons by combining.
   * Should be 2d perspective transform walls.
   * @param {PIXI.Point[][]} walls2d
   * @returns {ClipperPaths}
   */
  static combineTerrainWalls(walls2d) {
    // TODO: Handle walls that are actually lines?

    // Terrain walls can be represented as the union of the intersection of every two pairs
    // For each wall, union the intersection of it with every other wall.
    // Then union the set of resulting walls.
    const nWalls = walls2d.length;
    if ( nWalls < 2 ) return null;

    walls2d = [...walls2d.map(w => new PIXI.Polygon(w))];

    const combined = new ClipperPaths();
    const ln = nWalls - 1;
    for ( let i = 0; i < ln; i += 1 ) {
      const cp = ClipperPaths.fromPolygons([walls2d[i]]);
      const ixs = new ClipperPaths();

      for ( let j = i + 1; j < nWalls; j += 1 ) {
        ixs.paths.push(cp.intersectPolygon(walls2d[j]).paths[0]);
      }

      ixs.paths.push(cp.paths[0]);
      combined.paths.push(...(ixs.combine().paths));
    }

    const finalPath = combined.combine();
    finalPath.clean();

    return finalPath;
  }
}
