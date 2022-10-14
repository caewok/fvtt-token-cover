/* globals
PIXI,
Ray,
canvas
*/
"use strict";

import { perpendicularPoint, distanceBetweenPoints2d, zValue, log } from "./util.js";
import { COLORS, drawShape } from "./drawing.js";
import { Point3d } from "./Point3d.js";

/* Testing
api = game.modules.get("tokenvisibility").api
Point3d = api.Point3d
Shadow = api.Shadow
visionSource = _token.vision
let [wall] = canvas.walls.placeables
s0 = Shadow.constructShadow(wall, visionSource, Shadow.zValue(0))
s10 = Shadow.constructShadow(wall, visionSource, Shadow.zValue(10))


s0 = Shadow.constructShadow(wall, visionSource, Shadow.zValue(30))
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
   * Build the parallelogram representing a shadow cast from a wall.
   * Looking top-down with a light or other source object at a given elevation
   * above a wall.
   * With the shadow cast onto a flat surface of a given elevation
   * @param {Wall} wall                         Wall to test
   * @param {LightSource|VisionSource} source   Source of the light or vision
   * @param {number} surfaceElevation=0         Elevation of the shadowed surface
   * @returns {Shadow}
   */
  static constructShadow(wall, source, surfaceElevation = 0) {
    const wBottom = {
      A: new Point3d(wall.A.x, wall.A.y, wall.bottomZ),
      B: new Point3d(wall.B.x, wall.B.y, wall.bottomZ)
    };

    const wTop = {
      A: new Point3d(wall.A.x, wall.A.y, wall.topZ),
      B: new Point3d(wall.B.x, wall.B.y, wall.topZ)
    };

    const V = new Point3d(source.x, source.y, source.elevationZ);
    const O = new Point3d(0, 0, surfaceElevation); // x and y TBD
    let flipped = false;

    // Need at least one finite wall direction
    // Construct shadow based on max radius
//     if ( !isFinite(Wtz) && !isFinite(Wbz) ) {
//       console.warning("Constructing infinite shadow.");
//       const dist = canvas.scene.dimensions.maxR;
//       return null;
//     }

    // If the source elevation equals the surface elevation, no shadows to be seen
    if ( V.z === O.z ) return null;

    // Projecting downward from source; if below bottom of wall, no shadow.
    else if ( V.z > O.z  && V.z < wBottom.A.z ) return null;

    // Projecting upward from source; if above bottom of wall, no shadow.
    else if ( V.z < O.z && V.z > wTop.A.z ) return null;

    else if ( V.z < O.z ) {
      // Flip, construct upwards to (underneath of) surface
      wBottom.A.z *= -1;
      wBottom.B.z *= -1;
      wTop.A.z *= -1;
      wTop.B.z *= -1;

      V.z *= -1;
      O.z *= -1;

      flipped = true;

      log("constructShadow: flipped.");
    }

    // Need the point of the wall that forms a perpendicular line to the vision object
    const Wix = perpendicularPoint(wall.A, wall.B, V);
    if ( !Wix ) return null; // Line collinear with vision object
    const VW = new Ray(V, Wix);

    // Get the distances between Wix and the wall endpoints.
    const distA = distanceBetweenPoints2d(wTop.A, VW.B);
    const distB = distanceBetweenPoints2d(wTop.B, VW.B);

    // Calculate the hypotenuse of the big triangle on each side.
    // That hypotenuse is used to extend a line from V past each endpoint.
    // First get the angle
    const alphaA = Math.atan(distA / VW.distance);
    const alphaB = Math.atan(distB / VW.distance);

    const topShadowPoints = Shadow._topWallShadowPoints(wTop, V, O, VW, alphaA, alphaB);
    const points = Shadow._bottomWallShadowPoints(wBottom, V, O, VW, alphaA, alphaB, topShadowPoints);

    // If any elevation is negative, normalize so that the lowest elevation is 0
//     const min_elevation = Math.min(Ve, Oe, We);
//     if ( min_elevation < 0 ) {
//       const adder = Math.abs(min_elevation);
//       Ve = Ve + adder;
//       Oe = Oe + adder;
//       We = We + adder;
//     }

    const out = new this(points);

    out.topPoints = topShadowPoints;
    out.alphaA = alphaA;
    out.alphaB = alphaB;
    out.VW = VW;
    out.wall = wall;
    out.source = source;
    out.surfaceElevation = surfaceElevation;

    if ( flipped ) {
      // Flip back something?

    }

    return out;
  }

  /**
   * Shadow cast by the top of the wall from the source to the surface.
   * Will be from wall corners to a defined distance, trapezoidal.
   * @param {Wall} wall                         Wall to test
   * @param {LightSource|VisionSource} source   Source of the light or vision
   * @param {number} surfaceElevation=0         Elevation of the shadowed surface
   * @param {Ray} VW                            Ray from source to wall, perpendicular to wall
   * @returns {Point[]} Array of 8 points representing the trapezoid
   */
  static _topWallShadowPoints(wTop, V, O, VW, alphaA, alphaB) {
    let VOdist = 0;
    if ( V.z <= wTop.A.z ) {
      // Source is below wall top; shadow is infinitely long
      // Use maxRadius for the scene
      VOdist = canvas.scene.dimensions.maxR;
    } else {
      // Theta is the angle between the 3-D sight line and the sight line in 2-D
      const theta = Math.atan((V.z - wTop.A.z) / VW.distance); // Theta is in radians
      const WOdist = (wTop.A.z - O.z) / Math.tan(theta); // Tan wants radians
      VOdist = VW.distance + WOdist;
    }

    // Now calculate the hypotenuse
    const hypA = VOdist / Math.cos(alphaA);
    const hypB = VOdist / Math.cos(alphaB);

    // Extend a line from V past wall T at each endpoint.
    // Each distance is the hypotenuse on the side.
    // given angle alpha.
    // Should form the parallelogram with wall T on one parallel side
    const VOa = Ray.towardsPoint(V, wTop.A, hypA);
    const VOb = Ray.towardsPoint(V, wTop.B, hypB);

    return [wTop.A, VOa.B, VOb.B, wTop.B];
  }

  /**
   * Shadow cast by the bottom of the wall from the source to the surface
   * Will be infinitely long, starts away from wall corners
   */
  static _bottomWallShadowPoints(wBottom, V, O, VW, alphaA, alphaB, topPoints) {
    // If the wall is "floating" above the surface, the shadow starts "after" the wall.
    // Need to determine the starting point.
    const gap = wBottom.A.z - O.z;
    if ( gap <= 0 ) return topPoints;

    const iota = Math.atan((V.z - gap) / VW.distance); // Iota is in radians
    // lambda is equal to iota b/c they form a rectangle.
    const VOgapdist = (V.z / Math.tan(iota)) - VW.distance;

    // Now calculate the hypotenuse for the extension on each endpoint
    const hypGapA = VOgapdist / Math.cos(alphaA);
    const hypGapB = VOgapdist / Math.cos(alphaB);

    const endA = topPoints[1];
    const endB = topPoints[2];

    const startA = Ray.towardsPoint(wBottom.A, endA, hypGapA);
    const startB = Ray.towardsPoint(wBottom.B, endB, hypGapB);

    return [startA.B, endA, endB, startB.B];
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
}
