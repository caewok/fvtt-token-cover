/* globals
game,
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


/* Testing
Draw = CONFIG.GeometryLib.Draw
Point3d = CONFIG.GeometryLib.threeD.Point3d;
api = game.modules.get("tokenvisibility").api;
Area3dLOS = api.Area3dLOS;

let [viewer] = canvas.tokens.controlled;
let [target] = game.user.targets;

calc = new Area3dLOS(viewer, target)
calc.hasLOS()
calc.percentVisible()

objs = calc.blockingObjects
[tile] = objs.tiles
Draw.shape(tile.bounds, { color: Draw.COLORS.orange })

objPts = calc.blockingObjectsPoints
[tilePts] = objPts.tiles

blockingPts = calc.blockingPoints

let { obscuredSides, sidePolys } = calc._obscureSides();

for ( const poly of sidePolys ) {
   Draw.shape(poly, { color: Draw.COLORS.lightgreen})
}

for ( const obscuredSide of obscuredSides ) {
  const polys = obscuredSide.toPolygons()
  for ( const poly of polys ) {
    Draw.shape(poly, { color: Draw.COLORS.red})
  }
}

// _constructBlockingPointsArray
visionPolygon = calc.visionPolygon;
edges = [...visionPolygon.iterateEdges()];
viewerLoc = calc.viewerPoint
pts = tilePts
Draw.shape(visionPolygon, { color: Draw.COLORS.blue })


targetShape = new PIXI.Rectangle(3600, 2500, 300, 300)
thisShape = new PIXI.Rectangle(2000, 3400, 2300, 900)
Draw.shape(thisShape, { color: Draw.COLORS.orange });
Draw.shape(targetShape, { color: Draw.COLORS.red })

*/

import { AlternativeLOS } from "./AlternativeLOS.js";
import { AREA3D_POPOUTS } from "./Area3dPopout.js"; // Debugging pop-up

// Geometry folder
import { Point3d } from "../geometry/3d/Point3d.js";

/**
 * Base class for measuring area 3d.
 * Variety of subclasses from this, mostly for testing and debugging.
 * This abstract parent class sets the target, caches target points, and caches
 * blocking objects between the viewer and the target.
 */
export class Area3dLOS extends AlternativeLOS {

  /**
   * Vector representing the up position on the canvas.
   * Used to construct the token camera and view matrices.
   * @type {Point3d}
   */
  static upVector = new Point3d(0, 0, -1);

  static sumRedPixels(targetCache) {
    const pixels = targetCache.pixels;
    const nPixels = pixels.length;
    let sumTarget = 0;
    for ( let i = 0; i < nPixels; i += 4 ) sumTarget += Boolean(targetCache.pixels[i]);
    return sumTarget;
  }

  static sumRedObstaclesPixels(targetCache) {
    const pixels = targetCache.pixels;
    const nPixels = pixels.length;
    let sumTarget = 0;
    for ( let i = 0; i < nPixels; i += 4 ) {
      const px = pixels[i];
      if ( px < 128 ) continue;
      sumTarget += Boolean(targetCache.pixels[i]);
    }
    return sumTarget;
  }

  // ----- NOTE: Debugging methods ----- //
  get popout() { return AREA3D_POPOUTS.geometric; }

  debug(hasLOS) {
    // Debug: console.debug(`debug|${this.viewer.name}👀 => ${this.target.name}🎯`);
    this._enableDebugPopout();
    super.debug(hasLOS);

    // Only draw in the popout for the targeted token(s).
    // Otherwise, it is really unclear to what the debug is referring.
    if ( !game.user.targets.has(this.target) ) return;
    this._draw3dDebug();
  }

  clearDebug() {
    // Debug: console.debug(`clearDebug|${this.viewer.name}👀 => ${this.target.name}🎯`);
    super.clearDebug();
    this._clear3dDebug();
  }

  /**
   * For debugging.
   * Draw debugging objects (typically, 3d view of the target) in a pop-up window.
   * Must be extended by subclasses. This version pops up a blank window.
   */
  _draw3dDebug() {
  }

  /**
   * For debugging.
   * Clear existing debug.
   * Must be extended by subclasses.
   */
  _clear3dDebug() {

  }

  async enableDebug() { return this._enableDebugPopout(); }

  async disableDebug() { return this._closeDebugPopout(); }

  /**
   * For debugging.
   * Close the popout window.
   */
  async _closeDebugPopout() {
    const app = this.popout.app;
    if ( !app || app.closing ) return;
    return app.close();
  }

  /**
   * For debugging.
   * Popout the debugging window if not already rendered.
   * Clear drawings in that canvas.
   * Clear other children.
   */
  async _enableDebugPopout() {
    const popout = this.popout;
    if ( popout.app._state < 2 ) popout.app.render(true);
  }
}
