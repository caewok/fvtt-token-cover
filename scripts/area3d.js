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
import { Plane } from "./Plane.js";
import { getConstrainedTokenShape } from "./token_visibility.js";
import { elementsByIndex, segmentBlocks } from "./util.js";
import * as drawing from "./drawing.js"; // For debugging

export class Area3d {
  _M = undefined;

  token = undefined;

  target = undefined;

  tokenCenter = new Point3d();

  targetCenter = new Point3d();

  _boundsXY = null;

  _blockingWalls = null;

  _transformedTarget = undefined;

  _transformedWalls = undefined;

  wallShadows = [];

  /**
   * Vector representing the up position on the canvas.
   * Used to construct the token camera and view matrices.
   * @type {Point3d}
   */
  _upVector = new Point3d(0, 0, 1);

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
  get transformedTarget() {
    return this._transformedTarget || (this._transformedTarget = this._transformTarget());
  }

  /**
   * Get the transformed walls
   * @type {Object{Point3d[]}[]}
   */
  get transformedWalls() {
    return this._transformedWalls || (this._transformedWalls = this._transformWalls());
  }

  get tokenViewM() {
    return this._tokenViewM || (this._tokenViewM = this.tokenCameraM.invert());
  }

  get tokenCameraM() {
    return this._tokenCameraM || (this._tokenCameraM = this._calculateTokenCameraMatrix());
  }

  /**
   * Calculate the bounds rectangle encompassing the token center and the target shape.
   * XY (original) coordinates
   * @returns {PIXI.Rectangle}
   */
  _calculateBoundsXY() {
    if ( !this.target || !this.token ) return undefined;

    const targetBounds = this.target.bounds;

    const maxX = Math.max(this.tokenCenter.x, targetBounds.right);
    const maxY = Math.max(this.tokenCenter.y, targetBounds.bottom);
    const minX = Math.min(this.tokenCenter.x, targetBounds.left);
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
  _calculateTokenCameraMatrix() {
    const cameraPosition = this.tokenCenter;
    const targetPosition = this.targetCenter;
    return Matrix.lookAt(cameraPosition, targetPosition, this._upVector);
  }

  /**
   * Transform the token center
   * Only used for debugging
   */
  _transformTokenCenter() {
    return Matrix.fromPoint3d(this.tokenCenter).multiply(this.tokenViewM).toPoint3d();
  }

  /**
   * Transform the target location.
   */
  _transformTarget() {
    const t = this._target3dPoints();
    t.points = t.points.map(pt => Matrix.fromPoint3d(pt).multiply(this.tokenViewM).toPoint3d());
    return t;
  }

  /**
   * Transform the wall locations.
   */
  _transformWalls() {
    const walls = this.blockingWalls.map(w => Area3d.wall3dPoints(w));

    return walls.map(w =>
      w.map(pt => Matrix.fromPoint3d(pt).multiply(this.tokenViewM).toPoint3d()));
  }

  /**
   * For debugging, draw a given side after transforming to 2d along with walls and shadows
   */
  _drawSideTransform(side) {

    const tTarget = this.transformedTarget;

    if ( side === "top" ) {
      if ( !tTarget.top ) {
        console.warn("No top side.");
        return;
      }
      side = tTarget.sides.length - 1;
    } else if ( side === "bottom" ) {
      if ( !tTarget.bottom ) {
        console.warn("No bottom side.");
        return;
      }
      side = tTarget.sides.length - 1;
    }
    const sideTransform = this._sideTransforms[side];
    if ( !sideTransform ) {
      console.warn("Side not found");
      return;
    }

    drawing.drawShape(sideTransform.sidePoly, { color: drawing.COLORS.red });

    if ( !sideTransform.blockingPolygons ) return;

    // The first (usually) is the wall, followed by shadows
    sideTransform.blockingPolygons.forEach(poly => {
      if ( poly instanceof Shadow ) {
        poly.draw();
      } else {
        drawing.drawShape(poly, { color: drawing.COLORS.blue, width: 2 });
      }

    });
  }

  _drawSideTransforms() {
    const tTarget = this.transformedTarget;
    const nSides = tTarget.sides.length
    for ( let i = 0; i < nSides; i += 1 ) {
      this._drawSideTransform(i);
    }
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
  _percentAreaVisible() {
    // 1. Treat each square of the target as a separate plane.
    // 2. Project shadow from the wall onto the plane.
    // 3. Calculate area of the planes w/ shadows and walls block vs. area w/o.
    const origin = new Point3d(0, 0, 0)

    const tTarget = this.transformedTarget;
    const tWalls = this.transformedWalls;

    // For each side of the target:
    // 1. Project the wall edge onto the plane of the target.
    // - skip wall projection if points are collinear
    // - diff the target side vs the wall projection in clipper
    // 2. Project shadow from each wall edge.
    // - diff the target side from each wall edge
    // 3. calculate area of remaining side
    // 4. sum areas with diff divided by areas of target sides alone

    const sides = tTarget.sides;
    if ( tTarget.top ) sides.push(tTarget.top);
    if ( tTarget.bottom ) sides.push(tTarget.bottom);

    if ( !sides.length ) return;

    let obscuredSidesArea = 0;
    let sidesArea = 0;

    // For debugging
    const target = this.target;
    const obscuredSideAreasArray = [];
    const sideAreasArray = [];
    const originalSideAreas = {
      top: target.w * target.h,
      side1: target.w * (target.topZ - target.bottomZ),
      side2: target.h * (target.topZ - target.bottomZ)
    };
    this._sideTransforms = [];


    for ( const side of sides ) {
      const sidePoints = elementsByIndex(tTarget.points, side);
      const sidePlane = Plane.fromPoints(sidePoints[0], sidePoints[1], sidePoints[2]);

      // Measure area from point of view of the token
      // TO-DO: Canvas perspective?  https://www.scratchapixel.com/lessons/3d-basic-rendering/computing-pixel-coordinates-of-3d-point/mathematics-computing-2d-coordinates-of-3d-points
      const sidePoly = new PIXI.Polygon(sidePoints);
      const sideArea = sidePoly.area();
      sidesArea += sideArea;
      sideAreasArray.push(sideArea); // Debugging

      // Debugging
      const sideTransform = { sidePoly, shadows: [], blockingPolygons: [] };
      this._sideTransforms.push(sideTransform);

      for ( const wall of tWalls ) {
        // If the wall is represented by 4 distinct XY points, use to block the side
        const ln = wall.length;
        if ( ln === 4 ) {
          const w0 = wall[0].to2d();
          const w1 = wall[1].to2d();
          const w2 = wall[2].to2d();
          if ( !(w0.almostEqual(wall[1])
            || w0.almostEqual(wall[2])
            || w0.almostEqual(wall[3])
            || w1.almostEqual(wall[2])
            || w1.almostEqual(wall[3])
            || w2.almostEqual(wall[3])) ) {

            sideTransform.blockingPolygons.push(new PIXI.Polygon(wall));
          }
        }

        // For each wall edge, construct shadow
        for ( let i = 0; i < ln; i += 1 ) {
          const A = wall[i];
          const B = wall[(i + 1) % ln];
          const shadow = Shadow.segmentWithPlane(A, B, origin, sidePlane);
          if ( shadow ) {
            const shadowPoly = new Shadow(shadow);
            sideTransform.blockingPolygons.push(shadowPoly);
            sideTransform.shadows.push({A, B, origin, surfacePlane: sidePlane}); // Debugging
          }
        }
      }

      if ( !sideTransform.blockingPolygons.length ) {
        obscuredSideAreasArray.push(sideArea); // Debugging
        obscuredSidesArea += sideArea;
        continue;
      }

      const obscuredSide = Shadow.combinePolygonWithShadows(sidePoly, sideTransform.blockingPolygons);

      const obscuredArea = obscuredSide.area();
      obscuredSideAreasArray.push(obscuredArea); // Debugging
      obscuredSidesArea += obscuredArea;
    }

    this._obscuredSideAreasArray = obscuredSideAreasArray;
    this._sideAreas = sideAreasArray;
    this._originalSideAreas = originalSideAreas;

    return sidesArea ? obscuredSidesArea / sidesArea : 0;
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
   * Get the 3d points representing the target, along with
   * indices indicating the potentially viewable sides.
   * @returns {object} [object]
   *   [object.points]  Points used
   * Indices for object.points:
   *   [object.top]     Top points, or undefined
   *   [object.bottom]  Bottom points, or undefined
   *   [object.sides]   Array of sides
   */
  _target3dPoints() {
    // In 2d XY coordinates, check what points are visible.
    const center = this.tokenCenter;
    const centerZ = this.tokenCenter.z;
    const target = this.target;
    const { bottomZ, topZ } = target;
    const targetShape = getConstrainedTokenShape(target);
    const targetPoly = targetShape instanceof PIXI.Rectangle ? targetShape.toPolygon() : targetShape;

    const out = {
      points: [],
      sides: []
    };

    const edges = [...targetPoly.iterateEdges()];
    const points = [...targetPoly.iteratePoints()];
    let seen = [];
    const ln = points.length;
    for ( let i = 0; i < ln; i += 1 ) {
      const pt = points[i];
      if ( !edges.some(edge => segmentBlocks(center, pt, edge.A, edge.B)) ) seen.push(i);
    }

    // Re-arrange so the first viewable point moving clockwise is index 0
    const sLn = seen.length;
    let splitIndex;
    for ( let i = 1; i < sLn; i += 1 ) {
      if ( seen[i - 1] + 1 !== seen[i] ) {
        splitIndex = i;
        break;
      }
    }
    if ( splitIndex ) seen = [...seen.slice(splitIndex), ...seen.slice(0, splitIndex)];

    if ( centerZ > topZ ) {
      // Looking down at the target
      // Top face only
      out.top = Array.fromRange(points.length);

      // Make the 3d top points
      out.points = points.map(pt => new Point3d(pt.x, pt.y, topZ));

      if ( seen.length < 2 ) return out;

      // Add the bottom seen points and corresponding indices for the sides
      // Assuming for the moment that points are clockwise
      // Start by adding the initial bottom right
      const right = points[seen[0]];
      out.points.push(new Point3d(right.x, right.y, bottomZ));

      const numSides = sLn - 1;
      for ( let i = 0; i < numSides; i += 1 ) {
        const pLn = out.points.length;
        const side = [];
        out.sides.push(side);

        // Top right
        side.push(seen[i]);

        // Bottom right
        side.push(pLn - 1);

        // Bottom left
        const left = points[seen[i + 1]];
        out.points.push(new Point3d(left.x, left.y, bottomZ));
        side.push(pLn);

        // Top left
        side.push(seen[i + 1]);

      }

    } else if ( centerZ < bottomZ ) {
      // Looking up at the target
      // Bottom face only

      out.bottom = Array.fromRange(points.length);

      // Make the 3d top points
      out.points = points.map(pt => new Point3d(pt.x, pt.y, bottomZ));

      if ( seen.length < 2 ) return out;

      // Add the bottom seen points and corresponding indices for the sides
      // Assuming for the moment that points are clockwise
      // Start by adding the initial bottom right
      const right = points[seen[0]];
      out.points.push(new Point3d(right.x, right.y, topZ));

      const numSides = sLn - 1;
      for ( let i = 0; i < numSides; i += 1 ) {
        const pLn = out.points.length;
        const side = [];
        out.sides.push(side);

        // Top right
        side.push(pLn - 1);

        // Bottom right
        side.push(seen[i]);

        // Bottom left
        side.push(seen[i + 1]);

        // Top left
        const left = points[seen[i + 1]];
        out.points.push(new Point3d(left.x, left.y, topZ));
        side.push(pLn);

      }


    } else {
      // Looking face-on.
      // No top or bottom faces.

      if ( seen.length < 2 ) return out;

      // Add the bottom seen points and corresponding indices for the sides
      // Assuming for the moment that points are clockwise
      // Start by adding the initial top right and bottom right
      const right = points[seen[0]];
      out.points.push(new Point3d(right.x, right.y, bottomZ));
      out.points.push(new Point3d(right.x, right.y, topZ));


      const numSides = sLn - 1;
      for ( let i = 0; i < numSides; i += 1 ) {
        const pLn = out.points.length;
        const side = [];
        out.sides.push(side);

        // Top right
        side.push(pLn - 1);

        // Bottom right
        side.push(pLn - 2);

        // Bottom left
        const left = points[seen[i + 1]];
        out.points.push(new Point3d(left.x, left.y, bottomZ));
        side.push(pLn);

        // Top left
        out.points.push(new Point3d(left.x, left.y, topZ));
        side.push(pLn + 1);

      }
    }

    return out;

  }

  /**
   * Get 3d points representing a given token.
   * @param {Token} token
   * @param {boolean} useConstrained    If true, use the token polygon constrained by walls.
   * @returns {Point3d[]}
   */
  static token3dPoints(token, useConstrained = true) {
    let tokenShape = token.bounds;
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
    const t = this.transformedTarget;
    t.points.forEach(pt => drawing.drawPoint(pt, { color: drawing.COLORS.red }));

    if ( t.top ) this._drawSide(t.points, t.top, { color: drawing.COLORS.red });
    if ( t.bottom ) this._drawSide(t.points, t.bottom, { color: drawing.COLORS.red });

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
