/* globals
PIXI,
canvas
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

import { Shadow } from "./Shadow.js";
import { Matrix } from "./Matrix.js";
import { Point3d } from "./Point3d.js";
import { getConstrainedTokenShape } from "./token_visibility.js";
import * as drawing from "./drawing.js"; // For debugging

export class Area3d {
  M = Matrix.empty(4, 4);

  token = undefined;

  target = undefined;

  tokenCenter = new Point3d();

  targetCenter = new Point3d();

  _boundsXY = null;

  _blockingWalls = null;

  _transformedTargetPoints = undefined;

  _transformedWalls = undefined;

  wallShadows = [];

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
   * Get the transformed target points
   * @type {Point3d[]}
   */
  get transformedTargetPoints() {
    return this._transformedTargetPoints || (this._transformedTargetPoints = this._transformTarget());
  }

  /**
   * Get the transformed walls
   * @type {Object{Point3d[]}[]}
   */
  get transformedWalls() {
    return this._transformedWalls || (this._transformedWalls = this._transformWalls());
  }

  /**
   * Calculate the bounds rectangle encompassing the token center and the target shape.
   * XY (original) coordinates
   * @returns {PIXI.Rectangle}
   */
  _calculateBoundsXY() {
    if ( !this.target || !this.token ) return undefined;

    const targetBounds = this.target.bounds;

    const maxX = Math.max(this.tokenCenter.x, targetBounds.left);
    const maxY = Math.max(this.tokenCenter.y, targetBounds.bottom);
    const minX = Math.min(this.tokenCenter.x, targetBounds.x);
    const minY = Math.min(this.tokenCenter.y, targetBounds.top);

    return new PIXI.Rectangle(minX, minY, maxX - minX, maxY - minY);
  }

  /**
   * @param {Token} token     Token, viewing from token.topZ.
   * @param {Target} target   Target; token is looking at the target center.
   */
  constructor(token, target) {
    this.token = token;
    this.target = target;

    this.tokenCenter = new Point3d(token.center.x, token.center.y, token.topZ);
    this.targetCenter = Area3d.tokenCenter(target);
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
  _calculateTransformMatrix() {
    const tokenCenter = this.tokenCenter;
    const targetCenter = this.targetCenter;

    // Move token center to origin, b/c we are rotating around it
    const tZ = Matrix.translation(-tokenCenter.x, -tokenCenter.y, -tokenCenter.z);
    const tZinv = Matrix.translation(tokenCenter.x, tokenCenter.y, tokenCenter.z);

    // Rotation around z axis to be even with the y axis
    const tokenCenterXY = tokenCenter.to2d({x: "x", y: "y"});
    const targetCenterXY = targetCenter.to2d({x: "x", y: "y"});
    const axisY = new PIXI.Point(tokenCenter.x, tokenCenter.y - 100);
    const angleZ = -Area3d.angleBetweenSegments(tokenCenterXY, targetCenterXY, tokenCenterXY, axisY);
    const rotZ = Matrix.rotationZ(angleZ);

    // Temporarily move so we can find the correct angle from the rotated position
    const tTargetCenter = Matrix.empty(4, 4);
    Matrix.fromPoint3d(targetCenter)
      .multiply4x4(tZ, tTargetCenter)
      .multiply4x4(rotZ, tTargetCenter)
      .multiply4x4(tZinv, tTargetCenter);

    // Then rotate around x axis so target is directly below token. Usually 90º unless elevations differ
    const tokenCenterYZ = tokenCenter.to2d({x: "y", y: "z"});
    const targetCenterYZ = tTargetCenter.toPoint3d().to2d({x: "y", y: "z"});
    const axisZ = new PIXI.Point(tokenCenter.y, tokenCenter.z - 100);
    const angleX = Area3d.angleBetweenSegments(tokenCenterYZ, targetCenterYZ, tokenCenterYZ, axisZ);
    const rotX = Matrix.rotationX(angleX);

    this.M = Matrix.empty(4, 4);
    tZ.multiply4x4(rotZ, this.M)
      .multiply4x4(rotX, this.M)
      .multiply4x4(tZinv, this.M);
  }

  /**
   * Transform the target location.
   */
  _transformTarget() {
    const t = Area3d.token3dPoints(this.target);
    return this.transformedTargetPoints = t.map(pt =>
      Matrix.fromPoint3d(pt).multiply4x4(this.M).toPoint3d());
  }

  /**
   * Transform the wall locations.
   */
  _transformWalls() {
    const walls = this.blockingWalls.map(w => w.map(pt => Area3d.wall3dPoints(pt)));

    return this.transformedWalls = walls.map(w =>
      w.map(pt => Matrix.fromPoint3d(pt).multiply4x4(this.M).toPoint3d()));
  }

  /**
   * Construct wall shadows in the transformed coordinates.
   * Shadows for where walls block vision of the token due to angle of token view --> wall edge.
   * Each edge is considered a separate "wall".
   * Approximate the perspective shadow by two simplifications:
   * - Treat the wall as 2d, with each edge a line that can block vision.
   * - Assume the surface elevation for the shadow to be the center of the target.
   * (As opposed to projecting the shadow onto the precise 3d target shape)
   */
  _constructWallShadows() {
    // For now, do nothing.
    // Ultimately would like to:
    // 1. Treat each square of the target as a separate plane.
    // 2. Project shadow from the wall onto the plane.
    // 3. Calculate area of the planes w/ shadows and walls block vs. area w/o.

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

    // Ignore one-directional walls facing away from the origin
    const side = wall.orientPoint(this.tokenCenter);
    return !wall.document.dir || (side !== wall.document.dir);
  }

  /**
   * Find relevant walls—--those intersecting the boundary between token center and target.
   */
  _findBlockingWalls() {
    const collisionTest = (o, rect) => this._testWallInclusion(o.t, rect);
    return canvas.walls.quadtree.getObjects(this.boundsXY, { collisionTest });
  }

  /**
   * Get 3d points representing a given token.
   * @param {Token} token
   * @param {boolean} useConstrained    If true, use the token polygon constrained by walls.
   * @returns {Point3d[]}
   */
  static token3dPoints(token, useConstrained = true) {
    let tokenShape = this.token.bounds;
    if ( useConstrained ) tokenShape = getConstrainedTokenShape(token);

    const { bottomZ, topZ } = token;

    if ( tokenShape instanceof PIXI.Rectangle ) {
      const { x, y, height, width } = tokenShape;

      // Face points are:
      // top: 1, 3, 5, 7
      // bottom: 0, 2, 4, 6
      // s1: 1, 3, 2, 0
      // s2: 3, 5, 4, 2
      // s3: 5, 7, 6, 4
      // s4: 7, 1, 0, 6
      return [
        new Point3d(x, y, bottomZ),
        new Point3d(x, y, topZ),

        new Point3d(x + width, y, bottomZ),
        new Point3d(x + width, y, topZ),

        new Point3d(x + width, y + height, bottomZ),
        new Point3d(x + width, y + height, topZ),

        new Point3d(x, y + height, bottomZ),
        new Point3d(x, y + height, topZ)
      ];
    }

    // Face points are:
    // top: 1, 3, 5, ...
    // bottom: 0, 2, 4, ...
    // s1: 1, 3, 2, 0
    // s2: 3, 5, 4, 2 ...
    // sn: n, 1, 0, n - 1
    const pts = [];
    for ( const pt of tokenShape.iteratePoints({close: false}) ) {
      pts.push(
        new Point3d(pt.x, pt.y, bottomZ),
        new Point3d(pt.x, pt.y, topZ)
      );
    }
    return pts;
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

  _transformedTargetFaces() {
    const pts = this.transformedTargetPoints;
    const ln = pts.length;
    if ( ln < 4 ) return [];

    const top = [];
    const bottom = [];
    const sides = [];
    const seen = [];

    for ( let i = 0; i < ln; i += 1 ) {
      const pt = pts[i];
      if ( seen.some(s => s.almostEqual(pt)) ) continue;

      // Even points are bottom; odd points are top
      if ( i % 2 === 0 ) bottom.push(pt);
      else top.push(pt);

      // Every 4th is a new side
      if ( (i + 1) % 4 === 0 ) {
        sides.push(pts[i - 2], pt, pts[i - 2], pts[i - 3]);
      }

      seen.push(pt);
    }
    // Final side
    sides.push([pts[ln - 1], pts[1], pts[0], pts[ln - 2]]);

    return [
      top,
      bottom,
      ...sides
    ];
  }

  /**
   * For debugging.
   * Draw the line of sight from token to target.
   */
  _drawLineOfSight() {
    drawing.drawSegment({A: this.tokenCenter, B: this.targetCenter});
  }

  /**
   * For debugging.
   * Draw the transformed target.
   */
  _drawTransformedTarget() {
    const t = this.transformedTargetPoints;
    t.forEach(pt => drawing.drawPoint(pt, { color: drawing.COLORS.red }));

    const faces = this._transformedTargetFaces();
    faces.forEach(f => {
      drawing.drawSegment({A: f[0], B: f[1]}, { color: drawing.COLORS.red });
      drawing.drawSegment({A: f[1], B: f[2]}, { color: drawing.COLORS.red });
      drawing.drawSegment({A: f[2], B: f[3]}, { color: drawing.COLORS.red });
      drawing.drawSegment({A: f[3], B: f[0]}, { color: drawing.COLORS.red });
    });
  }

  /**
   * For debugging.
   * Draw the transformed target.
   */
  _drawTransformedWalls() {
    const walls = this.transformedWalls;
    walls.forEach(w => {
      w.forEach(pt => drawing.drawPoint(pt, { color: drawing.COLORS.blue }));
      drawing.drawSegment({A: w[0], B: w[1]}, { color: drawing.COLORS.blue });
      drawing.drawSegment({A: w[1], B: w[2]}, { color: drawing.COLORS.blue });
      drawing.drawSegment({A: w[2], B: w[3]}, { color: drawing.COLORS.blue });
      drawing.drawSegment({A: w[3], B: w[0]}, { color: drawing.COLORS.blue });
    });
  }

}
