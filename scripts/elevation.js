/* globals
Wall,
Token,
CONFIG

*/
"use strict";

import { MODULES_ACTIVE } from "./const.js";

/* Elevation properties for Placeable Objects
Generally:
- elevation and elevationZ properties
- topE/bottomE and topZ/bottomZ for walls, tokens

1. Walls.
- topE/bottomE and topZ/bottomZ: When Wall Height is active, non-infinite are possible.
Use Wall Height flag

2. Tokens.
- topE/bottomE. topE === bottomE unless Wall Height is active.
- bottomE === elevation

*/

export function registerElevationAdditions() {

  // ----- TOKENS ----- //
  if ( !Object.hasOwn(Token.prototype, "topE") ) {
    Object.defineProperty(Token.prototype, "topE", {
      get: tokenTopElevation
    });
  }

  if ( !Object.hasOwn(Token.prototype, "bottomE") ) {
    Object.defineProperty(Token.prototype, "bottomE", {
      get: tokenBottomElevation
    });
  }

  if ( !Object.hasOwn(Token.prototype, "topZ") ) {
    Object.defineProperty(Token.prototype, "topZ", {
      get: zTop
    });
  }

  if ( !Object.hasOwn(Token.prototype, "bottomZ") ) {
    Object.defineProperty(Token.prototype, "bottomZ", {
      get: zBottom
    });
  }

  // ----- WALLS ----- //
  if ( !Object.hasOwn(Wall.prototype, "topE") ) {
    Object.defineProperty(Wall.prototype, "topE", {
      get: wallTopElevation
    });
  }

  if ( !Object.hasOwn(Wall.prototype, "bottomE") ) {
    Object.defineProperty(Wall.prototype, "bottomE", {
      get: wallBottomElevation
    });
  }

  if ( !Object.hasOwn(Wall.prototype, "topZ") ) {
    Object.defineProperty(Wall.prototype, "topZ", {
      get: zTop
    });
  }

  if ( !Object.hasOwn(Wall.prototype, "bottomZ") ) {
    Object.defineProperty(Wall.prototype, "bottomZ", {
      get: zBottom
    });
  }
}

/**
 * Helper to convert to Z value for a top elevation.
 */
function zTop() {
  return CONFIG.GeometryLib.utils.gridUnitsToPixels(this.topE);
}

/**
 * Helper to convert to Z value for a bottom elevation.
 */
function zBottom() {
  return CONFIG.GeometryLib.utils.gridUnitsToPixels(this.bottomE);
}

/**
 * Bottom elevation of a token. Equivalent to token.document.elevation.
 * @returns {number} Grid units.
 */
function tokenBottomElevation() {
  return this.document.elevation ?? 0;
}

/**
 * Top elevation of a token.
 * @returns {number} In grid units.
 * If Wall Height is active, use the losHeight. Otherwise, use bottomE.
 */
function tokenTopElevation() {
  if ( MODULES_ACTIVE.WALL_HEIGHT ) return this.losHeight ?? this.bottomE;
  return this.bottomE;
}

/**
 * Bottom elevation of a wall
 * @returns {number} Grid units
 *   If Wall Height is inactive, returns negative infinity.
 */
function wallBottomElevation() {
  const e = MODULES_ACTIVE.WALL_HEIGHT ? this.document.flags?.["wall-height"]?.bottom : undefined;
  return e ?? Number.NEGATIVE_INFINITY;
}

/**
 * Top elevation of a wall
 * @returns {number} Grid units
 * If Wall Height is inactive, returns positive infinity.
 */
function wallTopElevation() {
  const e = MODULES_ACTIVE.WALL_HEIGHT ? this.document.flags?.["wall-height"]?.top : undefined;
  return e ?? Number.POSITIVE_INFINITY;
}
