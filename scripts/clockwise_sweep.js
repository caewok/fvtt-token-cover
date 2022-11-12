/* globals
Ray,
canvas,
CONST
*/
"use strict";

import { Point3d } from "./geometry/Point3d.js";
import { lineSegment3dWallIntersection } from "./util.js";

/**
 * 3d version of ClockwiseSweepPolygon.testCollision
 * Test whether a Ray between the origin and destination points would collide with a boundary of this Polygon
 * @param {Point} origin                          An origin point
 * @param {Point} destination                     A destination point
 * @param {PointSourcePolygonConfig} config       The configuration that defines a certain Polygon type
 * @param {string} [config.mode]                  The collision mode to test: "any", "all", or "closest"
 * @returns {boolean|Point3d|Point3d[]|null} The collision result depends on the mode of the test:
 *                                                * any: returns a boolean for whether any collision occurred
 *                                                * all: returns a sorted array of Point3d instances
 *                                                * closest: returns a Point3d instance or null
 */
export function testCollision3dClockwiseSweepPolygon(origin, destination, {mode="all", wallTypes="all", ...config}={}) {
  const poly = new this();
  const ray = new Ray(origin, destination);
  config.boundaryShapes ||= [];
  config.boundaryShapes.push(ray.bounds);
  poly.initialize(origin, config);
  return poly._testCollision3d(ray, mode, wallTypes);
}

/**
 * Check whether a given ray intersects with walls.
 * This version considers rays with a z element
 *
 * @param {PolygonRay} ray            The Ray being tested
 * @param {object} [options={}]       Options which customize how collision is tested
 * @param {string} [options.type=move]        Which collision type to check, a value in CONST.WALL_RESTRICTION_TYPES
 * @param {string} [options.mode=all]         Which type of collisions are returned: any, closest, all
 * @param {boolean} [options.debug=false]     Visualize some debugging data to help understand the collision test
 * @param {boolean}[options.walls=all]        What walls to test:
 *                                            * all: all walls
 *                                            * limited: limited bottom or top walls only
 * @return {boolean|object[]|object}  Whether any collision occurred if mode is "any"
 *                                    An array of collisions, if mode is "all"
 *                                    The closest collision, if mode is "closest"
 */
export function _testCollision3dClockwiseSweepPolygon(ray, mode, wallTypes = "all") {
  // Identify candidate edges
  // Don't use this._identifyEdges b/c we need all edges, including those excluded by Wall Height
  const collisionTest = (o, rect) => originalTestWallInclusion.call(this, o.t, rect);
  let walls = canvas.walls.quadtree.getObjects(ray.bounds, { collisionTest });
  if ( wallTypes === "limited" ) {
    walls = walls.filter(w => isFinite(w.topZ) || isFinite(w.bottomZ) );
  }

  return testWallsForIntersections(ray.A, ray.B, walls, mode, this.config.type);
}

function testWallsForIntersections(origin, destination, walls, mode, type) {
  origin = new Point3d(origin.x, origin.y, origin.z);
  destination = new Point3d(destination.x, destination.y, destination.z);

  const collisions = [];
  for ( let wall of walls ) {
    const x = lineSegment3dWallIntersection(origin, destination, wall);
    if ( x ) {
      if ( mode === "any" ) {   // We may be done already
        if ( (type && wall.document[type] === CONST.WALL_SENSE_TYPES.NORMAL) || (walls.length > 1) ) return true;
      }
      if ( type ) x.type = wall.document[type];
      x.wall = wall;
      collisions.push(x);
    }
  }
  if ( mode === "any" ) return false;

  // Return all collisions
  if ( mode === "all" ) return collisions;

  // Calculate distance to return the closest collision
  collisions.forEach(p => {
    p.distance2 = Math.pow(p.x - origin.x, 2)
      + Math.pow(p.y - origin.y, 2)
      + Math.pow(p.z - origin.z, 2);
  });

  // Return the closest collision
  collisions.sort((a, b) => a.distance2 - b.distance2);
  if ( collisions[0]?.type === CONST.WALL_SENSE_TYPES.LIMITED ) collisions.shift();

  if ( mode === "sorted" ) return collisions;

  return collisions[0] || null;
}

function originalTestWallInclusion(wall, bounds) {
  const {type, boundaryShapes} = this.config;

  // First test for inclusion in our overall bounding box
  if ( !bounds.lineSegmentIntersects(wall.A, wall.B, { inside: true }) ) return false;

  // Specific boundary shapes may impose additional requirements
  for ( const shape of boundaryShapes ) {
    if ( shape._includeEdge && !shape._includeEdge(wall.A, wall.B) ) return false;
  }

  // Ignore walls which are nearly collinear with the origin, except for movement
  const side = wall.orientPoint(this.origin);
  if ( (type !== "move") && !side ) return false;

  // Always include interior walls underneath active roof tiles
  if ( (type === "sight") && wall.hasActiveRoof ) return true;

  // Otherwise, ignore walls that are not blocking for this polygon type
  else if ( !wall.document[type] || wall.isOpen ) return false;

  // Ignore one-directional walls which are facing away from the origin
  return !wall.document.dir || (side !== wall.document.dir);
}
