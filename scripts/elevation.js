/* globals
MovementSource,
VisionSource,
LightSource,
SoundSource,
Wall,
Token,
ClockwiseSweepPolygon,
GlobalLightSource,
CONFIG

*/
"use strict";



// Patch objects to use consistent elevation values.
// Rely on wall-height if available.
// Same as Elevated Vision

export function registerElevationAdditions() {

  if ( !Object.hasOwn(MovementSource.prototype, "elevationZ") ) {
    Object.defineProperty(MovementSource.prototype, "elevationZ", {
      get: movementSourceElevation
    });
  }

  if ( !Object.hasOwn(VisionSource.prototype, "elevationZ") ) {
    Object.defineProperty(VisionSource.prototype, "elevationZ", {
      get: visionSourceElevation
    });
  }

  if ( !Object.hasOwn(LightSource.prototype, "elevationZ") ) {
    Object.defineProperty(LightSource.prototype, "elevationZ", {
      get: lightSourceElevation
    });
  }

  if ( !Object.hasOwn(SoundSource.prototype, "elevationZ") ) {
    Object.defineProperty(SoundSource.prototype, "elevationZ", {
      get: soundSourceElevation
    });
  }

  if ( !Object.hasOwn(Wall.prototype, "topZ") ) {
    Object.defineProperty(Wall.prototype, "topZ", {
      get: wallTop
    });
  }

  if ( !Object.hasOwn(Wall.prototype, "bottomZ") ) {
    Object.defineProperty(Wall.prototype, "bottomZ", {
      get: wallBottom
    });
  }

  if ( !Object.hasOwn(Token.prototype, "topZ") ) {
    Object.defineProperty(Token.prototype, "topZ", {
      get: tokenTop
    });
  }

  if ( !Object.hasOwn(Token.prototype, "bottomZ") ) {
    Object.defineProperty(Token.prototype, "bottomZ", {
      get: tokenBottom
    });
  }
}

/**
 * For MovementSource objects, use the token's elevation
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function movementSourceElevation() {
  return this.object.topZ;
}

/**
 * For VisionSource objects, use the token's elevation.
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function visionSourceElevation() {
  return this.object.topZ;
}

/**
 * For LightSource objects, default to infinite elevation.
 * This is to identify lights that should be treated like in default Foundry.
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function lightSourceElevation() {
  if ( this instanceof GlobalLightSource ) return Number.POSITIVE_INFINITY;

  const gridUnitsToPixels = CONFIG.GeometryLib.utils.gridUnitsToPixels;
  return gridUnitsToPixels(this.object.document.flags?.levels?.rangeTop ?? Number.POSITIVE_INFINITY);
}

/**
 * For SoundSource objects, default to 0 elevation.
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function soundSourceElevation() {
  const gridUnitsToPixels = CONFIG.GeometryLib.utils.gridUnitsToPixels;
  return gridUnitsToPixels(this.object.document.flags?.levels?.rangeTop ?? Number.POSITIVE_INFINITY);
}

/**
 * For Token objects, default to 0 elevation.
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function tokenTop() {
  // From Wall Height but skip the extra test b/c we know it is a token.
  return CONFIG.GeometryLib.utils.gridUnitsToPixels(this.losHeight ?? this.document.elevation ?? 0);
}

/**
 * For Token objects, default to 0 elevation.
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function tokenBottom() {
  // From Wall Height but skip the extra test b/c we know it is a token.
  return CONFIG.GeometryLib.utils.gridUnitsToPixels(this.document.elevation ?? 0);
}

/**
 * For Wall objects, default to infinite top/bottom elevation.
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function wallTop() {
  return CONFIG.GeometryLib.utils.gridUnitsToPixels(this.document.flags?.["wall-height"]?.top ?? Number.POSITIVE_INFINITY);
}

/**
 * For Wall objects, default to infinite top/bottom elevation.
 * @type {number} Elevation, in grid units to match x,y coordinates.
 */
function wallBottom() {
  return CONFIG.GeometryLib.utils.gridUnitsToPixels(this.document.flags?.["wall-height"]?.bottom ?? Number.NEGATIVE_INFINITY);
}
