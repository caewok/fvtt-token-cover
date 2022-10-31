/* globals
ClockwiseSweepPolygon
*/
"use strict";

// Version of Clockwise Sweep that ignores non-infinite walls

export class CWSweepInfiniteWallsOnly extends ClockwiseSweepPolygon {
  /**
   * @overwrite
   */
  _testWallInclusion(wall, bounds) {
    if ( isFinite(wall.topZ) || isFinite(wall.bottomZ) ) return false;
    return super._testWallInclusion(wall, bounds);
  }
}
