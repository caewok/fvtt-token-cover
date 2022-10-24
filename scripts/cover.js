/* globals
ClockwiseSweepPolygon,
game,
PIXI,
canvas,
CONST
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
import { ClipperPaths } from "./ClipperPaths.js";
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
    case SETTINGS.COVER.TYPES.CENTER_CORNERS_GRID:
      return coverCenterToTargetGridCorners(token, target);
    case SETTINGS.COVER.TYPES.CORNER_CORNERS_GRID:
      return coverCornerToTargetGridCorners(token, target);
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
  const targetPoints = getCorners(getConstrainedTokenShape(target), target);

  return testTokenTargetPoints([tokenPoint], [targetPoints]);
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

  const tokenCorners = getCorners(getConstrainedTokenShape(token), token, token.topZ);
  const targetPoints = getCorners(getConstrainedTokenShape(target), target);

  return testTokenTargetPoints(tokenCorners, [targetPoints]);
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
export function coverCenterToTargetGridCorners(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions

  const tokenPoint = new Point3d(token.center.x, token.center.y, token.topZ);

  const targetShapes = gridShapesUnderToken(target);
  const targetPointsArray = targetShapes.map(targetShape => getCorners(targetShape, target));

  return testTokenTargetPoints([tokenPoint], targetPointsArray);
}

/**
 * Test cover based on corner-to-corners test. This is a simpler version of the DMG dnd5e test.
 * Runs a collision test on all corners of the token, and takes the best one
 * from the perspective of the token (the corner that provides least cover).
 * @param {Token} token
 * @param {Token} target
 * @returns {COVER_TYPE}
 */
export function coverCornerToTargetGridCorners(token, target) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions


  const tokenCorners = getCorners(getConstrainedTokenShape(token), token, token.topZ);
  const targetShapes = gridShapesUnderToken(target);
  const targetPointsArray = targetShapes.map(targetShape => getCorners(targetShape, target));

  return testTokenTargetPoints(tokenCorners, targetPointsArray);
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
  const targetShape = getConstrainedTokenShape(target);
  if ( target.topZ - target.bottomZ ) {
    targetPoints = [...getCorners(targetShape, target, target.topZ), ...getCorners(targetShape, target.bottomZ)];
  } else {
    targetPoints = getCorners(targetShape, target);
  }

  return testTokenTargetPoints([tokenPoint], [targetPoints]);
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

  const tokenCorners = getCorners(getConstrainedTokenShape(token), token, token.topZ);
  let targetPoints;
  const targetShape = getConstrainedTokenShape(target);
  if ( target.topZ - target.bottomZ ) {
    targetPoints = [...getCorners(targetShape, target, target.topZ), ...getCorners(targetShape, target, target.bottomZ)];
  } else {
    targetPoints = getCorners(targetShape, target);
  }

  return testTokenTargetPoints(tokenCorners, [targetPoints]);
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
 * Test an array of token points against an array of target points
 */
export function testTokenTargetPoints(tokenPoints, targetPointsArray) {
  const debug = game.modules.get(MODULE_ID).api.debug;
  let minCover = COVER_TYPES.TOTAL;
  const minPointData = { tokenPoint: undefined, targetPoints: undefined }; // Debugging

  for ( const tokenPoint of tokenPoints ) {
    for ( const targetPoints of targetPointsArray ) {
      // We can escape early if we have discovered a no-cover option!
      const cover = testPointToPoints(tokenPoint, targetPoints);
      if ( cover === COVER_TYPES.NONE ) {
        debug && drawPointToPoints(tokenPoint, targetPoints, { width: 2 });  // eslint-disable-line no-unused-expressions
        return COVER_TYPES.NONE;
      }

      if ( debug && cover < minCover ) {
        minPointData.tokenPoint = tokenPoint;
        minPointData.targetPoints = targetPoints;
      }

      minCover = Math.min(minCover, cover);

      debug && drawPointToPoints(tokenPoint, targetPoints, { alpha: 0.1 }); // eslint-disable-line no-unused-expressions
    }
  }

  debug && drawPointToPoints(minPointData.tokenPoint, minPointData.targetPoints, { width: 2 }); // eslint-disable-line no-unused-expressions

  return minCover;
}

/**
 * Get polygons representing all grids under the token.
 * If token is constrained, overlap the constrained polygon on the grid shapes.
 * @param {Token} targettoken
 * @return {PIXI.Polygon[]|PIXI.Rectangle[]|null}
 */
function gridShapesUnderToken(token) {
  const constrained = getConstrainedTokenShape(token);

  if ( canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ) {
    console.error("gridShapesUnderTarget called on gridless scene!");
    return constrained;
  }

  const gridShapes = canvas.grid.type === CONST.GRID_TYPES.SQUARE ? squaresUnderToken(token) : hexesUnderToken(token);

  // Token unconstrained by walls.
  if ( constrained instanceof PIXI.Rectangle ) return gridShapes;

  // For each gridShape, intersect against the constrained shape
  const constrainedGridShapes = [];
  const constrainedPath = ClipperPaths.fromPolygons([constrained]);

  for ( const gridShape of gridShapes ) {
    const constrainedGridShape = constrainedPath.intersectPolygon(gridShape).simplify();
    if ( !constrainedGridShape || constrainedGridShape.points.length < 6 ) continue;
    constrainedGridShapes.push(constrainedGridShape);
  }

  return constrainedGridShapes;
}

/**
 * Helper that constructs 3d points for the points of a token shape (rectangle or polygon).
 * Assumes the average elevation for the target if it has a height.
 * @param {Token} token
 * @returns {Point3d[]} Array of corner points.
 */
export function getCorners(tokenShape, token, elevation) {
  if ( typeof elevation === "undefined" ) elevation = token.bottomZ + ((token.topZ - token.bottomZ) * 0.5);

  if ( tokenShape instanceof PIXI.Rectangle ) {
    // Token unconstrained by walls.
    // Use corners 1 pixel in to ensure collisions if there is an adjacent wall.
    tokenShape.pad(-1);
    return [
      new Point3d(tokenShape.left, tokenShape.top, elevation),
      new Point3d(tokenShape.right, tokenShape.top, elevation),
      new Point3d(tokenShape.right, tokenShape.bottom, elevation),
      new Point3d(tokenShape.left, tokenShape.bottom, elevation)
    ];
  }

  // Constrained is polygon. Only use corners of polygon
  // Scale down polygon to avoid adjacent walls.
  const padShape = tokenShape.pad(-2, { scalingFactor: 100 });
  return [...padShape.iteratePoints({close: false})].map(pt => new Point3d(pt.x, pt.y, elevation));
}

/**
 * Helper that tests collisions between a given point and a target points.
 * @param {Point3d} tokenPoint        Point on the token to use.
 * @param {Point3d[]} targetPoints    Array of points on the target to test
 * @returns {COVER_TYPE}
 */
export function testPointToPoints(tokenPoint, targetPoints) {
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
export function drawPointToPoints(tokenPoint, targetPoints, { alpha = 1, width = 1 } = {}) {
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
 * Get an array of all the squares under a token
 * @param {Token} token
 * @returns {PIXI.Rectangle[]}
 */
export function squaresUnderToken(token) {
  const tX = token.x;
  const tY = token.y;

  const w = token.document.width;
  const h = token.document.height;

  const r1 = canvas.grid.grid.getRect(1, 1);
  const r = canvas.grid.grid.getRect(w, h);

  const wRem = r.width % r1.width;
  const hRem = r.height % r1.height;

  const wMult = Math.floor(w);
  const hMult = Math.floor(h);

  const squares = [];
  const baseRect = new PIXI.Rectangle(tX, tY, r1.width, r1.height);
  for ( let i = 0; i < wMult; i += 1 ) {
    for ( let j = 0; j < hMult; j += 1 ) {
      squares.push(baseRect.translate(i * r1.width, j * r1.height));
    }
  }

  if ( wRem ) {
    // Add partial width rectangles on the right
    const x = (wMult * r1.width )+ tX;
    for ( let j = 0; j < hMult; j += 1 ) {
      const y = (j * r1.height) + tY;
      squares.push(new PIXI.Rectangle(x, y, wRem, r1.height));
    }
  }

  if ( hRem ) {
    // Add partial height rectangles on the bottom
    const y = (hMult * r1.height) + tX;
    for ( let i = 0; i < wMult; i += 1 ) {
      const x = (i * r1.width) + tY;
      squares.push(new PIXI.Rectangle(x, y, r1.width, hRem));
    }
  }

  if ( wRem && hRem ) {
    const x = (wMult * r1.width) + tX;
    const y = (hMult * r1.height) + tY;
    squares.push(new PIXI.Rectangle(x, y, wRem, hRem));
  }

  return squares;
}

/**
 * Get an array of all the hexes under a token.
 * Like base Foundry, defaults to squares under token if token width/height is not 1, 2, 3 or 4.
 * See HexagonalGrid.prototype.getBorderPolygon for just the border
 * @param {Token} token
 * @returns {PIXI.Polygon[]}
 */
export function hexesUnderToken(token) {
  const tX = token.x;
  const tY = token.y;

  const w = token.document.width;
  const h = token.document.height;
  if ( w !== h || w > 4 ) return squaresUnderToken(token);

  const hexes = [];
  const isColumnar = canvas.grid.grid.columnar;
  switch (w) {
    case 1:
      hexes.push(hexes1());
      break;
    case 2:
      hexes.push(...(isColumnar ? colHexes2(tX, tY) : rowHexes2(tX, tY)));
      break;

    case 3:
      hexes.push(...(isColumnar ? colHexes3(tX, tY) : rowHexes3(tX, tY)));
      break;

    case 4:
      hexes.push(...(isColumnar ? colHexes4(tX, tY) : rowHexes4(tX, tY)));
      break;
  }

  /* Test:
    polyBorder = new PIXI.Polygon(canvas.grid.grid.getBorderPolygon(token.document.width, token.document.height, 0))
    drawing.drawShape(polyBorder, { color: drawing.COLORS.blue })
    hexes = hexesUnderToken(token)
    hexes.forEach(hex => drawing.drawShape(hex, { color: drawing.COLORS.red }))
  */

  if ( hexes.length === 0 ) return squaresUnderToken(token);

  return hexes;
}

function hexes1(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  return new PIXI.Point(canvas.grid.grid.getPolygon(x, y, r1.width, r1.height));
}

// 2: Forms triangle.  •
//                    • •
function rowHexes2(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

  return [
    baseHex.translate(halfCol, 0),
    baseHex.translate(0, row),
    baseHex.translate(col, row)
  ];
}

/** 3: Forms • •
 *          • • •
 *           • •
 */
function rowHexes3(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

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

// 4: Forms • • •
//         • • • •
//          • • •
//           • •
function rowHexes4(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

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
function colHexes2(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

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
function colHexes3(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

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
function colHexes4(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

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
