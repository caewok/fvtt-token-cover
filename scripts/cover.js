/* globals
ClockwiseSweepPolygon,
game,
PIXI,
canvas
*/
"use strict";

/* Cover options

1. Center to Center -- PF2e
Measure center of token to center of target

2.


/* Cover testing types:
1. Center to 4 Corners -- from the center point of the token to 4 corners
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
2. Corner to Four Corner -- DMG rules; vision from each occupied grid point
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
3. Center to Center -- PF2e version
3/4 (standard)
4. Area
Half trigger: % area
3/4 trigger: % area
full trigger: % area

3D versions ( same triggers )
5. Center to cube corners
6. Cube corner to cube corners
7. 3d Area


Other settings:
GM can provide the name of an active effect to apply when covered. Applies to the token with cover.
- low active effect
- medium active effect
- high active effect

Cover Names:
Generic: low, medium, high
PF2e: lesser, standard, greater
dnd5e: half, 3/4, full

*/

import { MODULE_ID, COVER_TYPES } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { Point3d } from "./Point3d.js";
import { getConstrainedTokenShape, getShadowLOS, calculatePercentSeen } from "./token_visibility.js";
import * as drawing from "./drawing.js";

/**
 * Test whether a target has cover vis-a-vis a token.
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function targetCover(token, target) {
  const algorithm = getSetting(SETTINGS.COVER.ALGORITHM);

  switch ( algorithm ) {
    case SETTINGS.COVER.TYPES.CENTER_CENTER:
      return coverCenterToCenter(token, target);
    case SETTINGS.COVER.TYPES.CENTER_CORNERS_TARGET:
      return coverCenterToTargetCorners(token, target);
    case SETTINGS.COVER.TYPES.CORNER_CORNERS_TARGET:
      return coverCornerToTargetCorners(token, target);
    case SETTINGS.COVER.TYPES.CENTER_CORNERS_SINGLE:
      return coverCenterToSingleCorners(token, target);
    case SETTINGS.COVER.TYPES.CORNER_CORNERS_SINGLE:
      return coverCornerToSingleCorners(token, target);
    case SETTINGS.COVER.TYPES.CENTER_CUBE:
      return coverCenterToCube(token, target);
    case SETTINGS.COVER.TYPES.CUBE_CUBE:
      return coverCubeToCube(token, target);
    case SETTINGS.COVER.TYPES.AREA:
      return coverArea(token, target);
    case SETTINGS.COVER.TYPES.AREA3D:
      return coverArea(token, target);
  }

  return COVER_TYPES.NONE;
}

/**
 * Test cover based on PF2e approach of measuring token center to target center.
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}    Will be either NONE or MEDIUM
 */
export function coverCenterToCenter(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Center-to-Center"); // eslint-disable-line no-unused-expressions

  // TO-DO: Test visibility? This is hard b/c testVisibility assumes a token is selected.
  // Test visibility is thus a per-user test.

  // Test all non-infinite walls for collisions
  const tokenPoint = new Point3d(token.center.x, token.center.y, token.topZ);

  const targetHeight = target.topZ - target.bottomZ;
  const targetAvgElevation = target.bottomZ + (targetHeight * 0.5);
  const targetPoint = new Point3d(target.center.x, target.center.y, targetAvgElevation);
  const collision = ClockwiseSweepPolygon.testCollision3d(tokenPoint, targetPoint, { type: "sight", mode: "any" });


  debug && drawing.drawSegment(  // eslint-disable-line no-unused-expressions
    {A: tokenPoint, B: targetPoint},
    { color: collision ? drawing.COLORS.red : drawing.COLORS.green });

  if ( collision ) return COVER_TYPES[getSetting(SETTINGS.COVER.TRIGGER_CENTER)];
  else return COVER_TYPES.NONE;
}

/**
 * Test cover based on center-to-corners test. This is a simpler version of the DMG dnd5e test.
 * It is assumed that "center" is at the losHeight elevation, and corners are
 * at the mean height of the token.
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverCenterToTargetCorners(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions

  const tokenPoint = new Point3d(token.center.x, token.center.y, token.topZ);
  const targetPoints = getCorners(target);
  debug && drawPointToPoints(tokenPoint, targetPoints); // eslint-disable-line no-unused-expressions

  return testPointToPoints(tokenPoint, targetPoints);
}

/**
 * Test cover based on corner-to-corners test. This is a simpler version of the DMG dnd5e test.
 * Runs a collision test on all corners of the token, and takes the best one
 * from the perspective of the token (the corner that provides least cover).
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverCornerToTargetCorners(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Corner-to-Corners"); // eslint-disable-line no-unused-expressions

  // TO-DO: Hex corners!
  const tokenCorners = getCorners(token, token.topZ);
  const targetPoints = getCorners(target);
  const coverByCorner = tokenCorners.map(pt => testPointToPoints(pt, targetPoints));

  if ( debug ) {
    const maxI = coverByCorner.indexOf(Math.min(...coverByCorner));
    for ( let i = 0; i < coverByCorner.length; i += 1 ) {
      drawPointToPoints(tokenCorners[i], targetPoints, { alpha: i === maxI ? 1 : 0.2 });
    }
  }

  return Math.min(...coverByCorner);
}

/**
 * Test cover based on center-to-corners test. This is a simpler version of the DMG dnd5e test.
 * If the token covers multiple squares, this version selects the token square with the least cover.
 * It is assumed that "center" is at the losHeight elevation, and corners are
 * at the mean height of the token.
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverCenterToSingleCorners(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions

  const tokenPoint = new Point3d(token.center.x, token.center.y, token.topZ);
  const targetPoints = getCorners(target);
  debug && drawPointToPoints(tokenPoint, targetPoints); // eslint-disable-line no-unused-expressions

  return testPointToPoints(tokenPoint, targetPoints);
}

/**
 * Test cover based on corner-to-corners test. This is a simpler version of the DMG dnd5e test.
 * Runs a collision test on all corners of the token, and takes the best one
 * from the perspective of the token (the corner that provides least cover).
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverCornerToSingleCorners(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Corner-to-Corners"); // eslint-disable-line no-unused-expressions

  // TO-DO: Hex corners!
  const tokenCorners = getCorners(token, token.topZ);
  const targetPoints = getCorners(target);
  const coverByCorner = tokenCorners.map(pt => testPointToPoints(pt, targetPoints));

  if ( debug ) {
    const maxI = coverByCorner.indexOf(Math.min(...coverByCorner));
    for ( let i = 0; i < coverByCorner.length; i += 1 ) {
      drawPointToPoints(tokenCorners[i], targetPoints, { alpha: i === maxI ? 1 : 0.2 });
    }
  }

  return Math.min(...coverByCorner);
}


/**
 * Test cover based on center to cube test.
 * If target has a defined height, test the corners of the cube target.
 * Otherwise, call coverCenterToCorners.
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverCenterToCube(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Center-to-Cube"); // eslint-disable-line no-unused-expressions

  const targetHeight = target.topZ - target.bottomZ;
  if ( !targetHeight ) return coverCenterToTargetCorners(token, target);

  const tokenPoint = new Point3d(token.center.x, token.center.y, token.topZ);

  let targetPoints;
  if ( target.topZ - target.bottomZ ) {
    targetPoints = [...getCorners(target, target.topZ), ...getCorners(target, target.bottomZ)];
  } else {
    targetPoints = getCorners(target);
  }

  debug && drawPointToPoints(tokenPoint, targetPoints); // eslint-disable-line no-unused-expressions
  return testPointToPoints(tokenPoint, targetPoints);
}

/**
 * Test cover based on cube to cube test.
 * If target has a defined height, test the corners of the cube target.
 * Otherwise, call coverCornerToCorners.
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverCubeToCube(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Cube-to-Cube"); // eslint-disable-line no-unused-expressions

  const targetHeight = target.topZ - target.bottomZ;
  if ( !targetHeight ) return coverCenterToTargetCorners(token, target);

  const tokenCorners = getCorners(token, token.topZ);
  let targetPoints;
  if ( target.topZ - target.bottomZ ) {
    targetPoints = [...getCorners(target, target.topZ), ...getCorners(target, target.bottomZ)];
  } else {
    targetPoints = getCorners(target);
  }

  // Just try them all!
  const coverByCorner = tokenCorners.map(pt => testPointToPoints(pt, targetPoints));

  if ( debug ) {
    const maxI = coverByCorner.indexOf(Math.min(...coverByCorner));
    for ( let i = 0; i < coverByCorner.length; i += 1 ) {
      drawPointToPoints(tokenCorners[i], targetPoints, { alpha: i === maxI ? 1 : 0.05, width: i === maxI ? 3 : 1 });
    }
  }

  return Math.min(...coverByCorner);
}

/**
 * Test cover based on area
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverArea(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Area"); // eslint-disable-line no-unused-expressions

  const percentCover = calculatePercentCover(token.vision, target);

  if ( percentCover >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.HIGH) ) return COVER_TYPES.HIGH;
  if ( percentCover >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM) ) return COVER_TYPES.MEDIUM;
  if ( percentCover >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.LOW) ) return COVER_TYPES.LOW;
  return COVER_TYPES.NONE;
}

/**
 * Helper that constructs 3d points for the corners of a target.
 * Assumes the average elevation for the target if it has a height.
 * @param {Token} target
 * @returns {Point3d[]} Array of corner points.
 */
function getCorners(target, elevation) {
  // TO-DO: HEX corners!
  // TO-DO: Corners for larger tokens, where we should be testing each grid square separately

  if ( typeof elevation === "undefined" ) elevation = target.bottomZ + ((target.topZ - target.bottomZ) * 0.5);

  // Use a token shape constrained by walls to avoid testing corners that are behind walls.
  const constrained = getConstrainedTokenShape(target);

  if ( constrained instanceof PIXI.Rectangle ) {
    // Token unconstrained by walls.
    // Use corners 1 pixel in to ensure collisions if there is an adjacent wall.
    constrained.pad(-1);
    return [
      new Point3d(constrained.left, constrained.top, elevation),
      new Point3d(constrained.right, constrained.top, elevation),
      new Point3d(constrained.right, constrained.bottom, elevation),
      new Point3d(constrained.left, constrained.bottom, elevation)
    ];
  }

  // Constrained is polygon. Only use corners of polygon
  // Scale down polygon to avoid adjacent walls.
  const padConstrained = constrained.pad(-2, { scalingFactor: 100 });
  return [...padConstrained.iteratePoints({close: false})].map(pt => new Point3d(pt.x, pt.y, elevation));
}

/**
 * Helper that tests collisions between a given point and a target points.
 * @param {Point3d} tokenPoint        Point on the token to use.
 * @param {Point3d[]} targetPoints    Array of points on the target to test
 * @returns {COVER_TYPE}
 */
function testPointToPoints(tokenPoint, targetPoints) {
  let numCornersBlocked = 0;
  const ln = targetPoints.length;
  for ( let i = 0; i < ln; i += 1 ) {
    const targetPoint = targetPoints[i];
    const collision = ClockwiseSweepPolygon.testCollision3d(tokenPoint, targetPoint, { type: "sight", mode: "any" });
    if ( collision ) numCornersBlocked += 1;
  }

  const percentCornersBlocked = numCornersBlocked / ln;

  if ( percentCornersBlocked >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.HIGH) ) return COVER_TYPES.HIGH;
  if ( percentCornersBlocked >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM) ) return COVER_TYPES.MEDIUM;
  if ( percentCornersBlocked >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.LOW) ) return COVER_TYPES.LOW;

  return COVER_TYPES.NONE;
}

/**
 * For debugging.
 * Color lines from point to points as red or green depending on collisions.
 * @param {Point3d} tokenPoint        Point on the token to use.
 * @param {Point3d[]} targetPoints    Array of points on the target to test
 */
function drawPointToPoints(tokenPoint, targetPoints, { alpha = 1, width = 1 } = {}) {
  const debug = game.modules.get(MODULE_ID).api.debug;

  const ln = targetPoints.length;
  for ( let i = 0; i < ln; i += 1 ) {
    const targetPoint = targetPoints[i];
    const collision = ClockwiseSweepPolygon.testCollision3d(tokenPoint, targetPoint, { type: "sight", mode: "any" });

    debug && drawing.drawSegment(  // eslint-disable-line no-unused-expressions
      {A: tokenPoint, B: targetPoint},
      { alpha, width, color: collision ? drawing.COLORS.red : drawing.COLORS.green });
  }
}

export function calculatePercentCover(visionSource, target) {
  const constrained = getConstrainedTokenShape(target);
  const shadowLOS = getShadowLOS(visionSource, target);

  const targetPercentAreaBottom = shadowLOS.bottom ? calculatePercentSeen(shadowLOS.bottom, constrained) : 0;
  const targetPercentAreaTop = shadowLOS.top ? calculatePercentSeen(shadowLOS.top, constrained) : 0;
  const percentSeen = Math.max(targetPercentAreaBottom, targetPercentAreaTop);

  return 1 - percentSeen;
}

/**
 * Get an array of all the hexes under a token.
 * See HexagonalGrid.prototype.getBorderPolygon for just the border
 * @param {Token} token
 * @returns {PIXI.Polygon[]}
 */
export function hexesUnderToken(token) {


  const w = token.document.width;
  const h = token.document.height;
  if ( w !== h || w > 4 ) return null;

  const hexes = [];
  const isColumnar = canvas.grid.grid.columnar;
  switch (w) {
    case 1:
      hexes.push(hexes1());
      break;
    case 2:
      hexes.push(...(isColumnar ? colHexes2() : rowHexes2()));
      break;

    case 3:
      hexes.push(...(isColumnar ? colHexes3() : rowHexes3()));
      break;

    case 4:
      hexes.push(...(isColumnar ? colHexes4() : rowHexes4()));
      break;
  }

  /* Test:
    polyBorder = new PIXI.Polygon(canvas.grid.grid.getBorderPolygon(token.document.width, token.document.height, 0))
    drawing.drawShape(polyBorder, { color: drawing.COLORS.blue })
    hexes = hexesUnderToken(token)
    hexes.forEach(hex => drawing.drawShape(hex, { color: drawing.COLORS.red }))
  */

  return hexes;
}

function hexes1() {
  const r1 = canvas.grid.grid.getRect(1, 1);
  return new PIXI.Point(canvas.grid.grid.getPolygon(0, 0, r1.width, r1.height));
}

// 2: Forms triangle.  •
//                    • •
function rowHexes2() {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(0, 0, hexW, hexH));

  return [
    baseHex.translate(halfCol, 0),
    baseHex.translate(0, row),
    baseHex.translate(col, row)
  ];
}

/** 3: Forms • •
 *          • • •
 *           • •
 */
function rowHexes3() {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(0, 0, hexW, hexH));

  return [
    baseHex.translate(halfCol, 0),
    baseHex.translate(halfCol + col, 0),

    baseHex.translate(0, row),
    baseHex.translate(col, row),
    baseHex.translate(col * 2, row),

    baseHex.translate(halfCol, row * 2),
    baseHex.translate(halfCol + col, row * 2)
  ];
}

// 4: Forms • • •
//         • • • •
//          • • •
//           • •
function rowHexes4() {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(0, 0, hexW, hexH));

  return [
    baseHex.translate(halfCol, 0),
    baseHex.translate(halfCol + col, 0),
    baseHex.translate(halfCol + (col * 2), 0),

    baseHex.translate(0, row),
    baseHex.translate(col, row),
    baseHex.translate(col * 2, row),
    baseHex.translate(col * 3, row),

    baseHex.translate(halfCol, row * 2),
    baseHex.translate(halfCol + col, row * 2),
    baseHex.translate(halfCol + (col * 2), row * 2),

    baseHex.translate(col, row * 3),
    baseHex.translate(col * 2, row * 3)
  ];
}

/** 2: Forms triangle.  •
 *                    •
 *                      •
 */
function colHexes2() {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(0, 0, hexW, hexH));

  return [
    baseHex.translate(col, 0),
    baseHex.translate(0, halfRow),
    baseHex.translate(col, row)
  ];
}

/* 3: Forms  •
 *         •   •
 *           •
 *         •   •
 *           •
 */
function colHexes3() {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(0, 0, hexW, hexH));

  return [
    baseHex.translate(col, 0),

    baseHex.translate(0, halfRow),
    baseHex.translate(col * 2, halfRow),

    baseHex.translate(col, row),

    baseHex.translate(0, halfRow + row),
    baseHex.translate(col * 2, halfRow + row),

    baseHex.translate(col, row * 2)
  ];
}

/* 4: Forms   •
 *          •   •
 *            •   •
 *          •   •
 *            •   •
 *          •   • 
 *            •
 */
function colHexes4() {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(0, 0, hexW, hexH));

  return [
    baseHex.translate(col, 0),

    baseHex.translate(0, halfRow),
    baseHex.translate(col * 2, halfRow),

    baseHex.translate(col, row),
    baseHex.translate(col * 3, row),

    baseHex.translate(0, halfRow + row),
    baseHex.translate(col * 2, halfRow + row),

    baseHex.translate(col, row * 2),
    baseHex.translate(col * 3, row * 2),

    baseHex.translate(0, halfRow + (row * 2)),
    baseHex.translate(col * 2, halfRow + (row * 2)),

    baseHex.translate(col, row * 3)
  ];
}
