/* globals
canvas,
PIXI
*/
"use strict";

// Represent a Wall in as a set of 4 3d points.

import { PlanePoints3d } from "./PlanePoints3d.js";
import { Point3d } from "./Point3d.js";
import { ClipperPaths } from "./ClipperPaths.js";

export class WallPoints3d extends PlanePoints3d {
  constructor(object) {
    const { A, B, topZ, bottomZ } = object;
    const maxR = canvas.dimensions.maxR;

    const top = isFinite(topZ) ? topZ : maxR;
    const bottom = isFinite(bottomZ) ? bottomZ : -maxR;

    const points = new Array(4);
    points[0] = new Point3d(A.x, A.y, top);
    points[1] = new Point3d(B.x, B.y, top);
    points[2] = new Point3d(B.x, B.y, bottom);
    points[3] = new Point3d(A.x, A.y, bottom);

    super(object, points);
  }

  /**
   * Given an array of terrain walls, trim the polygons by combining.
   * Should be 2d perspective transform walls.
   * @param {PIXI.Point[][]} walls2d
   * @returns {ClipperPaths}
   */
  static combineTerrainWalls(walls2d) {
    // TODO: Handle walls that are actually lines?

    // Terrain walls can be represented as the union of the intersection of every two pairs
    // For each wall, union the intersection of it with every other wall.
    // Then union the set of resulting walls.
    // This only works for walls where we know the walls are between the viewer and the
    // target, because otherwise some walls could be behind the target and thus not count.
    const polys = [...walls2d.map(w => new PIXI.Polygon(w))];
    const nWalls = polys.length;
    if ( nWalls < 2 ) return null;

    const combined = new ClipperPaths();
    const ln = nWalls - 1;
    for ( let i = 0; i < ln; i += 1 ) {
      const cp = ClipperPaths.fromPolygons([polys[i]]);
      const ixs = new ClipperPaths();


      // Instead of intersecting each separately, union the i+1..nWalls walls then intersect against wall i.



      for ( let j = i + 1; j < nWalls; j += 1 ) {
        const intersectPath = cp.intersectPolygon(polys[j]);
        if ( intersectPath.paths[0].length ) ixs.paths.push(intersectPath.paths[0]);
      }

//       ixs.paths.push(cp.paths[0]);
      combined.paths.push(...(ixs.combine().paths));
    }

    if ( !combined.paths.length ) return null;

    const finalPath = combined.combine();
    finalPath.clean();

    return finalPath;
  }
}
