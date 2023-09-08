/* globals

*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import { MODULE_ID, MODULES_ACTIVE, DEBUG, COVER, IGNORES_COVER_HANDLER } from "./const.js";

export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * Hook: updateToken
 * If the token width/height changes, invalidate the tokenShape.
 * If the token moves, clear all debug drawings.
 * @param {Document} tokenD                         The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow

 */
function updateToken(tokenD, change, options, userId) {
  // Token shape changed; invalidate cached shape.
  const token = tokenD.object;
  if ( (Object.hasOwn(change, "width") || Object.hasOwn(change, "height")) && token ) token._tokenShape = undefined;

  // Token moved; clear drawings.
  if ( Object.hasOwn(change, "x")
    || Object.hasOwn(change, "y")
    || Object.hasOwn(change, "elevation") ) {

    if ( DEBUG.once || DEBUG.range || DEBUG.area || DEBUG.cover || DEBUG.los ) {
      Draw.clearDrawings();

      if ( DEBUG.once ) {
        DEBUG.range = false;
        DEBUG.area = false;
        DEBUG.cover = false;
        DEBUG.los = false;
        DEBUG.once = false;
      }
    }
  }
}

PATCHES.BASIC.HOOKS = {
  updateToken
}


// ----- NOTE: Wraps ----- //

/**
 * Wrap Token.prototype.updateSource
 * Reset the debugging drawings.
 */
function updateSource(wrapper, ...args) {
  if ( DEBUG.once || DEBUG.range || DEBUG.area || DEBUG.cover || DEBUG.los ) {
    CONFIG.GeometryLib.Draw.clearDrawings();

    if ( DEBUG.once ) {
      DEBUG.range = false;
      DEBUG.area = false;
      DEBUG.cover = false;
      DEBUG.los = false;
      DEBUG.once = false;
    }
  }

  return wrapper(...args);
}

PATCHES.BASIC.WRAPS = {
  updateSource
}

// ----- NOTE: Getters ----- //

/**
 * New getter: Token.prototype.constrainedTokenBorder
 * Determine the constrained border shape for this token.
 * @returns {ConstrainedTokenShape|PIXI.Rectangle}
 */
function constrainedTokenBorder() { return ConstrainedTokenBorder.get(this).constrainedBorder(); }

/**
 * New getter: Token.prototype.tokenBorder
 * Determine the correct border shape for this token. Utilize the cached token shape.
 * @returns {PIXI.Polygon|PIXI.Rectangle}
 */
function tokenBorder() { return this.tokenShape.translate(this.x, this.y); }

/**
 * New getter: Token.prototype.tokenShape
 * Cache the token shape.
 * @type {PIXI.Polygon|PIXI.Rectangle}
 */
function tokenShape() { return this._tokenShape || (this._tokenShape = calculateTokenShape(this)); }

/**
 * New getter: Token.prototype.coverType
 * Determine what type of cover the token has, if any.
 * @type {COVER_TYPES}
 */
function coverType() {
  const statuses = this.actor?.statuses;
  if ( !statuses ) return COVER.TYPES.NONE;
  const coverModule = MODULES_ACTIVE.DFREDS_CE ? "dfreds-convenient-effects" : "tokenvisibility";
  return statuses.has(COVER.CATEGORIES.HIGH[coverModule]) ? COVER.TYPES.HIGH
    : statuses.has(COVER.CATEGORIES.MEDIUM[coverModule]) ? COVER.TYPES.MEDIUM
    : statuses.has(COVER.CATEGORIES.LOW[coverModule]) ? COVER.TYPES.LOW
    : COVER.TYPES.NONE;
}

PATCHES.BASIC.GETTERS = {
  constrainedTokenBorder,
  tokenBorder,
  tokenShape,
  coverType
};


// ----- NOTE: Helper functions ----- //
/**
 * Theoretical token shape at 0,0 origin.
 * @returns {PIXI.Polygon|PIXI.Rectangle}
 */
function calculateTokenShape(token) {
  // TODO: Use RegularPolygon shapes for use with WeilerAtherton
  // Hexagon (for width .5 or 1)
  // Square (for width === height)
  let shape;
  if ( canvas.grid.isHex ) {
    const pts = canvas.grid.grid.getBorderPolygon(token.document.width, token.document.height, 0);
    if ( pts ) shape = new PIXI.Polygon(pts);
  }

  return shape || new PIXI.Rectangle(0, 0, token.w, token.h);
}
