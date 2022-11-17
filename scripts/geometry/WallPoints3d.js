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
   * Viewer and target locations used to sort the walls by distance.
   * @param {Point3d} viewerLoc         Location of the viewer
   * @param {Point3d} targetLoc         Location of the target
   * @param {WallPoints3d[]} walls      Set, Array, or Map of terrain walls
   * @returns {ClipperPaths}
   */
  static combineTerrainWalls(viewerLoc, targetLoc, walls) {
    // TODO: Handle walls that are actually lines?

    walls = [...walls];

    // Examine each pair of walls once
    const nWalls = walls.length;
    const iLn = nWalls - 1;
    for ( let i = 0; i < iLn; i += 1 ) {
      // Consider wall I  the AB segment
      const wi = walls[i];
      const wallI = wi.object;

      const orientABV = foundry.utils.orient2dFast(wallI.A, wallI.B, viewerLoc);


      for ( let j = i + 1; j < nWalls; j += 1 ) {
        // Consider wall J the CD segment
        const wj = walls[j];
        const wallJ = wj.object;

        const orientCDV = foundry.utils.orient2dFast(wallJ.A, wallJ.B, viewerLoc);


        // Do the walls strictly cross, forming an X?
        if ( lineSegmentCrosses(wallI.A, wallI.B, wallJ.A, wallJ.B) ) {
          const ix = foundry.utils.lineLineIntersection(wallI.A, wallI.B, wallJ.A, wallJ.B);
          if ( !ix ) {
            console.warn("combineTerrainWalls: walls cross but intersection not found.");
            continue;
          }

          // Create 4 subset walls: A|ix, B|ix, C|ix, D|ix
          const wiA = new WallPoints3d(wi);
          const wiB = new WallPoints3d(wi);
          const wjC = new WallPoints3d(wj);
          const wjD = new WallPoints3d(wj);

          wiA.points[1].x = ix.x;
          wiA.points[1].y = ix.y;
          wiA.points[2].x = ix.x;
          wiA.points[2].y = ix.y;

          wiB.points[0].x = ix.x;
          wiB.points[0].y = ix.y;
          wiB.points[3].x = ix.x;
          wiB.points[3].y = ix.y;

          wiC.points[1].x = ix.x;
          wiC.points[1].y = ix.y;
          wiC.points[2].x = ix.x;
          wiC.points[2].y = ix.y;

          wiD.points[0].x = ix.x;
          wiD.points[0].y = ix.y;
          wiD.points[3].x = ix.x;
          wiD.points[3].y = ix.y;

          let wiFront;
          let wiBack;
          let wjFront;
          let wjBack;

          // Determine which endpoint is behind the other
          // Split the walls at the ix and intersect the relevant pieces
          if ( orientABV < 0 && orientCDV < 0 ) {
            // A --> B --> V is clockwise
            // C --> D --> V is clockwise
            // Viewer is closest to A and D looking toward the ix
            // ix --> B is behind ix --> D
            // ix --> C is behind ix --> A
            wiFront = wiA;
            wiBack = wiB;
            wjFront = wjD;
            wjBack = wjC;

          } else if ( orientABV > 0 && orientCDV > 0 ) {
            // A --> B --> V is CCW
            // C --> D --> V is CCW
            // Viewer is closest to B and C
            // ix --> D is behind ix --> B
            // ix --> A is behind ix --> C
            wiFront = wiB;
            wiBack = wiA;
            wjFront = wjC;
            wjBack = wjD;

          } else if ( orientABV < 0 && orientCDV > 0 ) {
            // A --> B --> V is clockwise
            // C --> D --> V is CCW
            // Viewer is closest to B and D
            // ix --> C is behind ix --> B
            // ix --> A is behind ix --> D
            wiFront = wiB;
            wiBack = wiA;
            wjFront = wjD;
            wjBack = wjC;

          } else if ( orientABV > 0 && orientCDV < 0 ) {
            // A --> B --> V is CCW
            // C --> D --> V is clockwise
            // Viewer is closest to A and C
            // ix --> D is behind ix --> A
            // ix --> B is behind ix --> C
            wiFront = wiA;
            wiBack = wiB;
            wjFront = wjC;
            wjBack = wjD;
          }

        }


        // Do the walls share an endpoint?
        if ( wallI.wallKeys.has(wallJ.A.key) ) {

        }

        if ( wallJ.wallKeys.has(wallJ.B.key) ) {

        }

        // Do the walls otherwise intersect? (Left with a T intersection)
        if ( foundry.utils.lineSegmentIntersects(wallI.A, wallI.B, wallJ.A, wallJ.B) ) {

        }



      }
    }





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
