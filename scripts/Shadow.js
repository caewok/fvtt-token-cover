/* globals
PIXI,
canvas,
ClipperLib
*/
"use strict";

import { distanceSquaredBetweenPoints, zValue, log } from "./util.js";
import { COLORS, drawShape } from "./drawing.js";
import { Point3d } from "./Point3d.js";
import { ClipperPaths } from "./ClipperPaths.js";
import { Plane } from "./Plane.js";

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
   * Build shadow given a segment and a plane
   * Assume A and B represent a wall or shape that moves straight down to plane.
   * So shadow is from A outward and B outward.
   * @param {Point3d} A
   * @param {Point3d} B
   * @param {Point3d} origin
   * @param {Plane} surfacePlane
   * @returns {Point3d[]}
   */
  static segmentWithPlane(A, B, origin, surfacePlane) {
    const upV = new Point3d(0, 0, 1);

    // Direction of the surfacePlane in relation to the origin.
    const ixOrigin = surfacePlane.lineIntersection(origin, upV);

    const dir = ixOrigin.subtract(origin).z;
    if ( !dir ) return null; // Origin is on the plane

    // Truncate wall to be below the origin
    const res = truncateWallAtElevation(A, B, origin.z, dir);
    if ( !res ) return null;
    A = res.A;
    B = res.B;

    // Where does the (infinite) wall cross the surface?
    const ixAB = surfacePlane.lineIntersection(A, B);
    if ( ixAB ) {
      // Truncate wall to be above the surface
      // Can use the intersection point: will create a triangle shadow.
      // (Think flagpole shadow.)
      const res = truncateWallAtElevation(A, B, ixAB.z, -dir, 0);
      if ( !res ) return null; // Wall completely behind the surface
      A = res.A;
      B = res.B;
    } else {
      // Does not cross the surface. Reject if endpoint is on the wrong side.
      if ( dir > 0 && A.z < surfacePlane.point.z || dir < 0 && A.z > surfacePlane.point.z ) return null;
    }

    // Intersection points of origin --> wall endpoint --> surface
    // If the intersection point is above the origin, then the surface is twisted
    // such that the surface is between the origin and the wall at that point.
    const ixShadowA = surfacePlane.lineSegmentIntersection(origin, A);
    if ( !ixShadowA || (dir > 0 && ixShadowA.z < origin.z) || (dir < 0 && ixShadowA.z > origin.z) ) return null;

    const ixShadowB = surfacePlane.lineSegmentIntersection(origin, B);
    if ( !ixShadowB || (dir > 0 && ixShadowB.z < origin.z) || (dir < 0 && ixShadowB.z > origin.z) ) return null;

    // Find the intersection points of the wall with the surfacePlane
    const ixWallA = surfacePlane.lineIntersection(A, upV);
    if ( !ixWallA ) return null; // Unlikely, but possible?

    const ixWallB = surfacePlane.lineIntersection(B, upV);
    if ( !ixWallB ) return null; // Unlikely, but possible?

    // Surface intersection must be behind the wall
//     const ixWallABehindWall = dir < 0 ? A.z - ixWallA.z : ixWallA.z - A.z;
//     const ixWallBBehindWall = dir < 0 ? B.z - ixWallB.z : ixWallB.z - B.z;
//
//     // TO-DO: Is it possible to get the proportion that hits the plane?
//     if ( ixWallABehindWall <= 0 || ixWallBBehindWall <= 0 ) return null;

    // Surface intersection must be further from origin than the wall point
    const distWallA = distanceSquaredBetweenPoints(origin, A);
    const distIxWallA = distanceSquaredBetweenPoints(origin, ixWallA);
    if ( distWallA >= distIxWallA ) {
      log("segmentWithPlane distWallA >= distIxWallA")
      return null;
    }

    const distWallB = distanceSquaredBetweenPoints(origin, B);
    const distIxWallB = distanceSquaredBetweenPoints(origin, ixWallB);
    if ( distWallB >= distIxWallB ) {
      log("segmentWithPlane distWallB >= distIxWallB")
      return null;
    }

    // const ixWallAbehindOrigin = dir < 0 ? origin.z - ixWallA.z : ixWallA.z - origin.z;
//     const ixWallBbehindOrigin = dir < 0 ? origin.z - ixWallB.z : ixWallB.z - origin.z;
//
//     // TO-DO: Is it possible to get the proportion that hits the plane in front of origin?
//     // Is it worth it?
//     if ( ixWallAbehind < 0 || ixWallBbehind < 0 ) return null;

    // Surface intersection must be further from origin than the wall point
    if ( distWallA >= ixShadowA ) {
      log("segmentWithPlane distWallA >= ixShadowA")
      return null;
    }

    if ( distWallB >= ixShadowB ) {
      log("segmentWithPlane distWallB >= ixShadowB")
      return null;
    }



   //  const ixShadowAbehind = dir < 0 ? origin.z - ixShadowA.z : ixShadowA.z - origin.z;
//     const ixShadowBbehind = dir < 0 ? origin.z - ixShadowB.z : ixShadowB.z - origin.z;
//
//     // TO-DO: Is it possible to get the proportion that hits the plane in front of origin?
//     // Is it worth it?
//     if ( ixShadowAbehind < 0 || ixShadowBbehind < 0 ) return null;


    return [
      ixWallA,
      ixShadowA,
      ixShadowB,
      ixWallB
    ];
  }

  /**
   * Construct shadow assuming an XY top-down view with a surface plane.
   * Wall presumed to be a plane perpendicular to the XY canvas view.
   * @param {Wall} wall
   * @param {Point3d} origin
   * @param {Plane} surfacePlane
   * @returns {Point3d[]} Four points representing the shadow trapezoid
   */
  static XYWallWithPlane(wall, origin, surfacePlane) {

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
    const { bottomZ, topZ } = wall;
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

    const shadowPoints = Shadow.XYWallWithPlane(wall, sourcePoint, surfacePlane);
    if ( !shadowPoints ) return null;

    const points = shadowPoints.map(pt => pt.to2d());
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

    // Make all the shadow paths orient the same direction
    shadowPaths.paths.forEach(path => {
      if ( !ClipperLib.Clipper.Orientation(path) ) path.reverse();
    });

    const combinedShadowPaths = shadowPaths.combine();
    combinedShadowPaths.clean(cleanDelta);

    const out = combinedShadowPaths.diffPolygon(boundary);
    out.clean(cleanDelta);
    return out;
  }
}

/**
 * Project a 2d or 3d line
 * @param {Point3d|PIXI.Point} A
 * @param {Point3d|PIXI.Point} B
 * @returns {Point3d|PIXI.Point}
 */
function project(A, B, t) {
  const delta = B.subtract(A);
  return A.add(delta.multiplyScalar(t));
}

/**
 * Find the 3d point on a 3d line that equals a z coordinate.
 * @param {Point3d} A
 * @param {Point3d} B
 * @param {number} z
 * @returns {object{point:{Point3d}, proportion: {number}}}
 */
function towardZ(A, B, z) {
  const delta = B.subtract(A);
  const t = (z - A.z) / delta.z;
  return {
    point: A.add(delta.multiplyScalar(t)),
    t
  };
}

/**
 * Truncate a wall so that only the portion below an elevation ("z") point is seen
 * @param {Point3d} A
 * @param {Point3d} B
 * @param {number} z
 * @param {number} dir    Direction to truncate.
 *   If negative, force wall to be below z. If positive, force wall to be above z.
 * @return {object{ A: {Point3d}, B: {Point3d}}|null}
 */
function truncateWallAtElevation(A, B, z, dir = -1, dist = 0.001) {
  const distAz = dir < 0 ? z - A.z : A.z - z;
  const distBz = dir < 0 ? z - B.z : B.z - z;

  if ( distAz > 0 && distBz > 0 ) {
    // do nothing
  } else if ( distAz <= 0 && distBz <= 0 ) {
    return null;
  } else if ( distAz <= 0 || distBz <= 0 ) {
    // Find the point on AB that is even in elevation with z
    // Shorten the wall to somewhere just in front of z
    const {t} = towardZ(A, B, z);

    if ( distAz <= 0 ) {
      const newT = t + dist;
      if ( newT > 1 ) return null;
      A = project(A, B, newT);

    } else { // Bbehind <= 0
      const newT = t - dist;
      if ( newT < 0 ) return null;
      B = project(A, B, newT);
    }
  }
  return { A, B, distAz, distBz };
}
