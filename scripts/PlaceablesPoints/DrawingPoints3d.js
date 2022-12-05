/* globals
*/
"use strict";

// Represent a Wall in as a set of 4 3d points.

import { PlanePoints3d } from "./PlanePoints3d.js";
import { Point3d } from "../geometry/3d/Point3d.js";

// Drawing points can be modified by setting the elevation.
// Used by Area3d to construct holes in a tile based on a drawing at a given elevation.
export class DrawingPoints3d extends PlanePoints3d {
  /** @type {number} */
  _elevationZ = 0;

  /** @type {CenteredPolygonBase} */
  shape;

  /**
   * @param {Drawing}
   * @param {object} [options]
   * @param {number} [elevation]    Elevation of the drawing; defaults to current drawing elevation.
   */
  constructor(object, { elevation } = {}) {
    const shape = CONFIG.GeometryLib.utils.centeredPolygonFromDrawing(object);

    elevation ??= object.document?.elevation ?? 0;
    const elevationZ = zValue(elevation);
    const shapePoints = shape.points;
    const ln = shapePoints.length;
    const newLn = ln * 0.5;
    const points3d = new Array(newLn);
    for ( let i = 0; i < newLn; i += 1 ) {
      const j = i * 2;
      const x = shapePoints[j];
      const y = shapePoints[j + 1];
      points3d[i] = new Point3d(x, y, elevationZ);
    }

    super(object, points3d);
    this._elevationZ = elevationZ;
    this.shape = shape;
  }

  /**
   * Get or change the elevation, in pixel units, for this set of points.
   * @type {number}
   */
  get elevationZ() { return this._elevationZ; }

  set elevationZ(value) {
    if ( this._elevationZ === value ) return;
    this._elevationZ = value;

    // Redo elevation for the points in this drawing
    const ln = this.points.length;
    for ( let i = 0; i < ln; i += 1 ) {
      this.points[i].z = value;
    }

    // Trigger recalculation of the transform.
    this.viewIsSet = false;
  }

  get elevation() { return CONFIG.GeometryLib.utils.pixelsToGridUnits(this.elevationZ); }

  set elevation(value) { this.elevationZ = zValue(value); }
}
