/* globals
canvas,
PIXI
*/
"use strict";

// Represent a Wall in as a set of 4 3d points.

import { PlanePoints3d } from "./PlanePoints3d.js";

export class TilePoints3d extends PlanePoints3d {
  /** @type {Point3d[]} */
  points = new Array(4);

  /** @type {Point3d[]} */
  tPoints = new Array(4);

  constructor(object) {
    const { x, y, width, height, elevation } = wall.document;
    const eZ = zValue(elevation); // There is a wall.document.z value but not sure from where -- Levels?

    const top = isFinite(topZ) ? topZ : maxR;
    const bottom = isFinite(bottomZ) ? bottomZ : -maxR;

    const points = new Array(4);
    points[0] = new Point3d(A.x, A.y, top);
    points[1] = new Point3d(B.x, B.y, top);
    points[2] = new Point3d(B.x, B.y, bottom);
    points[3] = new Point3d(A.x, A.y, bottom);

    super(object, points);
  }
}
