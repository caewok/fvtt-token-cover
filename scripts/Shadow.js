/* globals
PIXI,
Ray,
canvas
*/
"use strict";

import { perpendicularPoint, distanceBetweenPoints, distanceSquaredBetweenPoints, zValue, log } from "./util.js";
import { COLORS, drawShape } from "./drawing.js";
import { Point3d } from "./Point3d.js";
import { ClipperPaths } from "./ClipperPaths.js";

/* Testing
api = game.modules.get("tokenvisibility").api
Point3d = api.Point3d
Shadow = api.Shadow
visionSource = _token.vision
shadowPolygonForElevation = api.shadowPolygonForElevation
polygonToRectangle = api.polygonToRectangle
intersectConstrainedShapeWithLOS = api.intersectConstrainedShapeWithLOS

target = _token


let [wall] = canvas.walls.placeables
s0 = Shadow.construct(wall, visionSource, Shadow.zValue(0))
s10 = Shadow.construct(wall, visionSource, Shadow.zValue(10))


s30 = Shadow.construct(wall, visionSource, Shadow.zValue(30))

// Project to bottom surface.
Token losHeight = 30; elevation = 25
surface elevation = 0
wall at 20, 10

// Project to top surface:
token losHeight = 0; elevation = -5
surface elevation = 30

*/

/*
 Looking at a cross-section:
  V----------W----O-----?
  | \ Ø      |    |
Ve|    \     |    |
  |       \  |    |
  |          \    |
  |        We|  \ | <- point O where obj can be seen by V for given elevations
  ----------------•----
  |<-   VO      ->|
 e = height of V (vision object)
 Ø = theta
 W = terrain wall

 Looking from above:
              •
             /| 𝜶 is the angle VT to VT.A
          •/ -|
         /|   |
       /  | S | B
     /    |   |
   / 𝜶  B |   |
 V -------W---• O
 (and mirrored on bottom)
 S = shadow area
 B = bright area

 naming:
 - single upper case: point. e.g. V
 - double upper case: ray/segment. e.g. VT
 - lower case: descriptor. e.g., Ve for elevation of V.

Bottom wall to surface is similar:
 Looking at a cross-section:
  V----------W----O-----?
  | \ I      |    |
Ve| K  \   We|    |
  |       \  |    |
  |          \    |
  |           L  \ | <- point O where obj can be seen by V for given elevations
  ----------------•----
  |<-   VO   |  ->|
             |<- Point where wall would touch the surface

*/

export class Shadow extends PIXI.Polygon {
  constructor(...points) {
    super(...points);

    // Round to nearest pixel to avoid some visual artifacts when joining shadows
    this.points = this.points.map(val => Math.round(val));

    if ( !this.isClosed ) {
      const ln = this.points.length;
      this.addPoint({ x: this.points[ln - 2], y: this.points[ln -1] });
    }

  }

  static zValue = zValue;

 /**
  * Build parallelogram using plane-line intersection method.
  * @param {Wall} wall
  * @param {Point3d} sourcePoint
  * @param {Plane} surfacePlane
  * @return {Shadow} Shadow, in the plane coordinates
  */
  static constructWallWithPlane(wall, sourcePoint, surfacePlane) {
    let wBottom = {
      A: new Point3d(wall.A.x, wall.A.y, wall.bottomZ),
      B: new Point3d(wall.B.x, wall.B.y, wall.bottomZ)
    };

    let wTop = {
      A: new Point3d(wall.A.x, wall.A.y, wall.topZ),
      B: new Point3d(wall.B.x, wall.B.y, wall.topZ)
    };


    // Find the intersection points of the wall with the surfacePlane
    let ixWallA = surfacePlane.lineSegmentIntersection(wTop.A, wBottom.A);
    let ixWallB = surfacePlane.lineSegmentIntersection(wTop.B, wBottom.B);


    if ( isFinite(wall.bottomZ) ) {
      ixShadowBottomA = surfacePlane.lineSegmentIntersection(sourcePoint, wBottom.A);
      ixShadowBottomB = surfacePlane.lineSegmentIntersection(sourcePoint, wBottom.B);

    } else {

    }

    if ( isFinite(wall.topZ) ) {
      ixShadowTopA = surfacePlane.lineSegmentIntersection(sourcePoint, wTop.A);
      ixShadowTopB = surfacePlane.lineSegmentIntersection(sourcePoint, wTop.B);

    } else {

    }


    const ixTopA = surfacePlane.lineSegmentIntersection(sourcePoint, wTop.A);
    const ixTopB = surfacePlane.lineSegmentIntersection(sourcePoint, wTop.B);
    const ixBottomA = surfacePlane.lineSegmentIntersection(sourcePoint, wBottom.A);
    const ixBottomB = surfacePlane.lineSegmentIntersection(sourcePoint, wBottom.B);

    return {
      ixTopA,
      ixTopB,
      ixBottomA,
      ixBottomB
    }

  }

  /**
   * Construct shadow assuming an XY top-down view with a surface plane.
   * Wall presumed to be a plane perpendicular to the XY canvas view.
   * @param {Wall} wall
   * @param {Point3d} origin
   * @param {Plane} surfacePlane
   * @returns {Point3d[]} Four points representing the shadow trapezoid
   */
  static constructXYWallWithPlane(wall, origin, surfacePlane) {
    const bottomZ = isFinite(wall.bottomZ) ? wall.bottomZ : -canvas.dimensions.maxR;
    const topZ = isFinite(wall.topZ) ? wall.topZ : canvas.dimensions.maxR;
    const { A, B } = wall;

    const wBottom = {
      A: new Point3d(A.x, A.y, bottomZ),
      B: new Point3d(B.x, B.y, bottomZ)
    };

    const wTop = {
      A: new Point3d(A.x, A.y, topZ),
      B: new Point3d(B.x, B.y, topZ)
    };


    // Find the intersection points of the wall with the surfacePlane
    const ixWallA = surfacePlane.lineSegmentIntersection(wTop.A, wBottom.A);
    const ixWallB = surfacePlane.lineSegmentIntersection(wTop.B, wBottom.B);

    let ixShadowBottomA = surfacePlane.lineSegmentIntersection(origin, wBottom.A);
    let ixShadowBottomB = surfacePlane.lineSegmentIntersection(origin, wBottom.B);

    let ixShadowTopA = surfacePlane.lineSegmentIntersection(origin, wTop.A);
    let ixShadowTopB = surfacePlane.lineSegmentIntersection(origin, wTop.B);

    const distWallA = distanceSquaredBetweenPoints(origin, ixWallA);
    const distWallB = distanceSquaredBetweenPoints(origin, ixWallB);

    const distShadowBottomA = distanceSquaredBetweenPoints(origin, ixShadowBottomA);
    const distShadowBottomB = distanceSquaredBetweenPoints(origin, ixShadowBottomB);

    const distShadowTopA = distanceSquaredBetweenPoints(origin, ixShadowTopA);
    const distShadowTopB = distanceSquaredBetweenPoints(origin, ixShadowTopB);

    // Check if "shadow" is completely between the wall and the origin
    if ( distShadowBottomA < distWallA
      && distShadowBottomB < distWallB
      && distShadowTopA < distWallA
      && distShadowTopB < distWallB ) return null;

    if ( origin.z > topZ ) {
      // Source looking down at wall
      // If bottom intersection is closer, use wall
      ixShadowBottomA = distWallA > distShadowBottomA ? ixWallA : ixShadowBottomA;
      ixShadowBottomB = distWallB > distShadowBottomB ? ixWallB : ixShadowBottomB;


    } else if ( origin.z < bottomZ ) {
      // Source looking up at wall
      // If top intersection is closer, use wall
      ixShadowTopA = distWallA > distShadowTopA ? ixWallA : ixShadowTopA;
      ixShadowTopB = distWallB > distShadowTopB ? ixWallB : ixShadowTopB;

    } else {
      // Source looking directly at wall


    }

      return [
        ixShadowBottomA,
        ixShadowTopA,
        ixShadowTopB,
        ixShadowBottomB
      ];
  }

  /**
   * Construct shadow using surface plane parallel to XY canvas, at provided elevation.
   * @param {Wall} wall
   * @param {VisionSource|LightSource} source
   * @param {number} surfaceElevation   Surface elevation, using zValues
   * @returns {Shadow}
   */
  static construct(wall, source, surfaceElevation = 0) {
    const { A, B, bottomZ, topZ } = wall;
    const { x, y, elevationZ } = source;

    // If the source elevation equals the surface elevation, no shadows to be seen.
    if ( elevationZ === surfaceElevation ) return null;

    // Viewer and the surface elevation both above the wall, so no shadow
    else if ( elevationZ > topZ && surfaceElevation > topZ ) return null;

    // Viewer and the surface elevation both below the wall, so no shadow
    else if ( elevationZ < bottomZ && surfaceElevation < bottomZ ) return null;

    // Projecting downward from source; if below bottom of wall, no shadow.
    else if ( elevationZ > surfaceElevation && elevationZ < bottomZ ) return null;

    // Projecting upward from source; if above bottom of wall, no shadow.
    else if ( elevationZ < surfaceElevation && elevationZ > topZ ) return null;

    const surfacePlane = new Plane(new Point3d(0, 0, surfaceElevation));
    const sourcePoint = new Point3d(x, y, elevationZ);

    const points = Shadow.constructXYWallWithPlane(wall, sourcePoint, surfacePlane).map(pt => pt.to2d());
    return new Shadow(points);
  }

  /**
   * Draw a shadow shape on canvas. Used for debugging.
   * Optional:
   * @param {HexString} color   Color of outline shape
   * @param {number} width      Width of outline shape
   * @param {HexString} fill    Color used to fill the shape
   * @param {number} alpha      Alpha transparency between 0 and 1
   */
  draw({ color = COLORS.gray, width = 1, fill = COLORS.gray, alpha = .5 } = {} ) {
    canvas.controls.debug.beginFill(fill, alpha);
    drawShape(this, { color, width });
    canvas.controls.debug.endFill();
  }

  /**
   * Given a boundary polygon and an array of Shadows (holes), combine using Clipper.
   * @param {PIXI.Polygon} boundary   Polygon, such as an los polygon
   * @param {Shadow[]} shadows        Array of Shadows
   * @param {object} [options]    Options that vary Clipper results.
   * @param {number} [options.scalingFactor]  Scaling used for more precise clipper integers
   * @param {number} [options.cleanDelta]     Passed to ClipperLib.Clipper.CleanPolygons.
   * @returns {ClipperPaths|PIXI.Polygon} Array of Clipper paths representing the resulting combination.
   */
  static combinePolygonWithShadows(boundary, shadows, { scalingFactor = 1, cleanDelta = 0.1 } = {}) {
    if ( shadows instanceof PIXI.Polygon ) shadows = [shadows];

    if ( !shadows.length ) return boundary;

    const shadowPaths = ClipperPaths.fromPolygons(shadows, { scalingFactor });
    const combinedShadowPaths = shadowPaths.combine();
    combinedShadowPaths.clean(cleanDelta);

    const out = combinedShadowPaths.diffPolygon(boundary);
    out.clean(cleanDelta);
    return out;
  }
}
