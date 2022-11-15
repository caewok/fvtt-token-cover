/* globals
Drawing
*/
"use strict";

// Represent a Wall in as a set of 4 3d points.

import { PlanePoints3d } from "./PlanePoints3d.js";
import { Point3d } from "./Point3d.js";
import { centeredPolygonFromDrawing, zValue, pixelsToGridUnits } from "../util.js";
import { CenteredPolygonBase } from "./CenteredPolygonBase.js";

// Drawing points can be modified by setting the elevation.
// Used by Area3d to construct holes in a tile based on a drawing at a given elevation.
export class DrawingPoints3d extends PlanePoints3d {
  /** @type {number} */
  _elevationZ = 0;

  /** @type {CenteredPolygonBase} */
  shape;

  /**
   * @param {Drawing|CenteredPolygonBase}
   * @param {object} [options]
   * @param {number} [elevation]    Elevation of the drawing; defaults to current drawing elevation.
   */
  constructor(object, { elevation } = {}) {
    let shape;
    if ( object instanceof Drawing ) {
      shape = centeredPolygonFromDrawing(object);
    } else if ( object instanceof CenteredPolygonBase ) {
      shape = object;
      object = object._drawing;
    } else {
      console.error("DrawingPoints3d: drawing class not supported.");
      return super(object);
    }

    elevation ??= drawing.document?.elevation ?? 0;
    const elevationZ = zValue(elevation);
    const points = [];
    for ( const pt of shape.iteratePoints() ) {
      points.push(new Point3d(pt.x, pt.y, elevationZ));
    }

    super(object, points);
    this._elevationZ = elevationZ;
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

    // Redo the transform if already set.
    if ( this.viewIsSet ) {
      this._transform(this.M);
      this._truncateTransform();
    }
  }

  get elevation() { return pixelsToGridUnits(this.elevationZ); }

  set elevation(value) { this.elevationZ = zValue(value); }
}
