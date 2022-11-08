/* globals
PIXI,
canvas,
game,
foundry,
Token
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
import { elementsByIndex, segmentBlocks, zValue } from "./util.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import * as drawing from "./drawing.js"; // For debugging

export class Area3d {

  /** @type {VisionSource} */
  viewer = undefined;

  /** @type {Token} */
  target = undefined;

  /** @type {string} */
  type = "sight";

  /** @type {PIXI.Rectangle} */
  _boundsXY = null;

  /** @type {Wall[]} */
  _blockingWalls = null;

  /** @type {Point3d[]} */
  _transformedTarget = undefined;

  /** @type {object[]}  An object with A and B. */
  _transformedWalls = undefined;

  /** @type {Shadow[]} */
  wallShadows = [];

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
  constructor(viewer, target, type = "sight") {
    this.viewer = viewer instanceof Token ? viewer.vision : viewer;
    this.target = target;
    this.percentAreaForLOS = getSetting(SETTINGS.LOS.PERCENT_AREA);
    this._useShadows = getSetting(SETTINGS.AREA3D_USE_SHADOWS);
    this.debug = game.modules.get(MODULE_ID).api.debug.area;
    this.type = type;

    this.targetPoints = new TokenPoints3d(target);


  }

  /**
   * Determine whether a visionSource has line-of-sight to a target based on the percent
   * area of the target visible to the source.
   */
  hasLOS() {
    const percentArea = this.percentAreaForLOS;

    // If center point is visible, then target is likely visible but not always.
    // e.g., walls slightly block the center point. Or walls block all but center.

    const percentVisible = this.percentAreaVisible();
    if ( percentVisible.almostEqual(0) ) return false;
    return (percentVisible > percentArea) || percentVisible.almostEqual(percentArea);
  }

  /**
   * Find the bounds rectangle encompassing the token center and the target shape.
   * XY (original) coordinates
   * @type {PIXI.Rectangle}
   */
  get boundsXY() {
    return this._boundsXY || (this._boundsXY = this._calculateBoundsXY());
  }

  /**
   * Get the blocking walls
   * @type {<Set>{Point3d[]}
   */
  get blockingWalls() {
    return this._blockingWalls || (this._blockingWalls = this._findBlockingWalls());
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
    const mult = 1 / (-pt.z * 1000);
    return new PIXI.Point(pt.x * mult, pt.y * mult);
  }

  /**
   * Get the array of sides, obscured by walls and shadows, if any.
   */
  get obscuredSides() {
    return this._obscuredSides || (this._obscuredSides = this._obscureSides());
  }

  /**
   * Get the transformed target points
   * @type {Point3d[]}
   */
  get transformedTarget() {
    return this._transformedTarget || (this._transformedTarget = this._transformTarget());
  }

  /**
   * Perspective divide the target points.
   * See https://www.scratchapixel.com/lessons/3d-basic-rendering/computing-pixel-coordinates-of-3d-point/mathematics-computing-2d-coordinates-of-3d-points
   * Then scale by 1000, primarily for debug drawing.
   * @type {Point3d[]}
   */
  get perspectiveTarget() {
    const tTarget = this.transformedTarget;
    return {
      points: tTarget.points.map(pt => Area3d.perspectiveTransform(pt)),
      sides: tTarget.sides,
      top: tTarget.top,
      bottom: tTarget.bottom
    };
  }

  /**
   * Get the transformed walls
   * @type {Object{Point3d[]}[]}
   */
  get transformedWalls() {
    return this._transformedWalls || (this._transformedWalls = this._transformWalls());
  }

  /**
   * Perspective divide the target points.
   * See https://www.scratchapixel.com/lessons/3d-basic-rendering/computing-pixel-coordinates-of-3d-point/mathematics-computing-2d-coordinates-of-3d-points
   * Then scale by 1000, primarily for debug drawing.
   * @type {Object{Point3d[]}[]}
   */
  get perspectiveWalls() {
    const tWalls = this.transformedWalls;
    return tWalls.map(wall => wall.map(pt => Area3d.perspectiveTransform(pt)));
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
   * Calculate the bounds rectangle encompassing the token center and the target shape.
   * XY (original) coordinates
   * @returns {PIXI.Rectangle}
   */
  _calculateBoundsXY() {
    if ( !this.target || !this.viewer ) return undefined;

    const targetBounds = this.target.bounds;

    const maxX = Math.max(this.viewerCenter.x, targetBounds.right);
    const maxY = Math.max(this.viewerCenter.y, targetBounds.bottom);
    const minX = Math.min(this.viewerCenter.x, targetBounds.left);
    const minY = Math.min(this.viewerCenter.y, targetBounds.top);

    return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
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
   * Transform the token center
   * Only used for debugging
   */
  _transformViewerCenter() {
    return Matrix.fromPoint3d(this.viewerCenter).multiply(this.viewerViewM).toPoint3d();
  }

  /**
   * Transform the target location.
   */
  _transformTarget() {
    const t = this._target3dPoints();
    t.points = t.points.map(pt => Matrix.fromPoint3d(pt).multiply(this.viewerViewM).toPoint3d());
    return t;
  }

  /**
   * Transform the wall locations.
   */
  _transformWalls() {
    return this.blockingWalls.map(w => {
      const pts = Area3d.wall3dPoints(w);
      const wall = pts.map(pt => Matrix.fromPoint3d(pt).multiply(this.viewerViewM).toPoint3d());
      return this._trucateTransformedWall(wall);
    });
  }

  /**
   * Truncate transformed walls so only the visible portions (below z = 0) are kept.
   * Warning: destructive operation on wall points!
   */
  _trucateTransformedWall(wall) {
    const targetE = -1;
    const ln = wall.length;
    let A = wall[ln - 1];
    for ( let i = 0; i < ln; i += 1 ) {
      const B = wall[i];
      const Aabove = A.z > targetE;
      const Babove = B.z > targetE;
      if ( !(Aabove ^ Babove) ) continue;

      const res = truncateWallAtElevation(A, B, targetE, -1, 0);
      if ( res ) {
        A.copyFrom(res.A);
        B.copyFrom(res.B);
      }
      A = B;
    }
    return wall;
  }

  /**
   * Construct wall shadows in the transformed coordinates.
   * Shadows for where walls block vision of the token due to angle of token view --> wall edge.
   * Each edge is considered a separate "wall".
   * - Treat the wall as 2d, with each edge a line that can block vision.
   */
  _projectShadowsForWalls() {
    const origin = new Point3d(0, 0, 0);
    const tTarget = this.transformedTarget;
    const tWalls = this.transformedWalls;
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
    const tTarget = this.perspectiveTarget;
    const sides = tTarget.sides;
    const shadowsArr = this._useShadows ? this.perspectiveShadows : undefined;
    const walls = this.perspectiveWalls;
    const wallPolys = walls.map(w => new PIXI.Polygon(w));

    // For each side, union the blocking wall with any shadows and then take diff against the side
    const nSides = sides.length;
    const obscuredSides = [];
    this.sidePolys = [];
    for ( let i = 0; i < nSides; i += 1 ) {
      const side = sides[i];
      const sidePoints = elementsByIndex(tTarget.points, side);
      const sidePoly = new PIXI.Polygon(sidePoints);
      this.sidePolys.push(sidePoly);

      const blockingPolygons = [...wallPolys];
      if ( this._useShadows ) blockingPolygons.push(...shadowsArr[i]);

      const obscuredSide = Shadow.combinePolygonWithShadows(sidePoly, blockingPolygons);
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
    if ( this.debug ) {
      this._drawLineOfSight();
      this._drawTransformedTarget();
      this._drawTransformedWalls();
      if (this._useShadows ) this._drawTransformedShadows();

      const target = this.target;
      this.debugSideAreas = {
        top: target.w * target.h,
        ogSide1: target.w * (target.topZ - target.bottomZ),
        ogSide2: target.h * (target.topZ - target.bottomZ),
        sides: [],
        obscuredSides: []
      };
    } else if ( !this.blockingWalls.size ) return 1; // Only skip calcs and drawings if not debugging.

    const obscuredSides = this.obscuredSides;
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
  _findBlockingWalls() {
    const collisionTest = (o, rect) => this._testWallInclusion(o.t, rect);
    let walls = canvas.walls.quadtree.getObjects(this.boundsXY, { collisionTest });

    // If any walls, refine further by testing against the vision triangle
    const constrainedTokenBorder = ConstrainedTokenBorder.get(this.target, this.type).constrainedBorder();
    if ( walls.size ) walls = Area3d.filterWallsForVisionCone(
      walls,
      constrainedTokenBorder,
      this.viewerCenter);

    return walls;
  }


  /**
   * Get 3d points representing a given wall.
   * To avoid numeric difficulties, set the top and bottom elevations to max radius and
   * negative max radius, respectively, of the scene if the respective elevation is infinite.
   * @param {Wall} wall
   * @returns {Point3d[]}
   */
  static wall3dPoints(wall) {
    const { A, B, topZ, bottomZ } = wall;
    const maxR = canvas.dimensions.maxR;

    const top = isFinite(topZ) ? topZ : maxR;
    const bottom = isFinite(bottomZ) ? bottomZ : -maxR;

    return [
      new Point3d(A.x, A.y, top),
      new Point3d(B.x, B.y, top),
      new Point3d(B.x, B.y, bottom),
      new Point3d(A.x, A.y, bottom)
    ];
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
   * Draw the transformed target.
   */
  _drawTransformedTarget(perspective = true) {
    const t = perspective ? this.perspectiveTarget : this.transformedTarget;
    t.points.forEach(pt => drawing.drawPoint(pt, { color: drawing.COLORS.red }));

    for ( const side of t.sides ) {
      this._drawSide(t.points, side, { color: drawing.COLORS.red });
    }
  }

  _drawSide(points, index, { color = drawing.COLORS.blue } = {}) {
    const ln = index.length;
    if ( ln !== 4 ) console.error("_drawSide expects sides with 4 points.");

    const pts = elementsByIndex(points, index);
    for ( let i = 1; i < ln; i += 1 ) {
      drawing.drawSegment({A: pts[i - 1], B: pts[i]}, { color });
    }
    drawing.drawSegment({A: pts[ln - 1], B: pts[0]}, { color });
  }

  /**
   * For debugging.
   */
  _drawTransformedWalls(perspective = true) {
    const walls = perspective ? this.perspectiveWalls : this.transformedWalls;
    walls.forEach(w => {
      const poly = new PIXI.Polygon(w);
      drawing.drawShape(poly, { color: drawing.COLORS.blue, fill: drawing.COLORS.blue, fillAlpha: 0.2 });
    });
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
    const keys = [];

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
        !foundNonKeyAfter && keys.push(i); // eslint-disable-line no-unused-expressions
        foundNonKeyAfter && keys.unshift(i); // eslint-disable-line no-unused-expressions
      } else { // !isKey
        foundNonKeyFirst ||= !foundKey;
        foundNonKeyAfter ||= foundKey;
        if ( foundNonKeyFirst && foundKey ) break; // Finished the key sequence
      }
    }

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

  /**
   * @param {Token} token
   * @param {string} type     Wall restriction type, for constructing the constrained token shape.
   */
  constructor(token, type = "sight") {
    this.token = token;
    this.type = type;

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
    const topZ = this.token.topZ;
    return topZ === this.bottomZ ? topZ + 2 : topZ;
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
  viewableFaces(viewingPoint) {
    const sides = this.viewableSides(viewingPoint);

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
  viewableSides(viewingPoint) {
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
   * Transform the faces using a provided function.
   * @param {function} transformFn
   * @returns {Point3d[][]}
   */
  static transformFaces(faces, transformFn) {
    // Use for loop with preset arrays for speed. Map would be simpler.
    const nFaces = faces.length;
    const tFaces = Array(nFaces);
    for ( let i = 0; i < nFaces; i += 1 ) {
      const face = faces[i];
      const nPts = face.length;
      const tFace = Array(nPts);
      tFaces[i] = tFace;
      for ( let j = 0; j < nPts; j += 1 ) {
        tFace[j] = transformFn(face[j]);
      }
    }
    return tFaces;
  }
}

