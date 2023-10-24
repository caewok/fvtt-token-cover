/* globals
canvas,
CONFIG,
game,
PIXI
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { ConstrainedTokenBorder } from "./LOS/ConstrainedTokenBorder.js";
import { MODULE_ID, MODULES_ACTIVE, DEBUG, COVER, IGNORES_COVER_HANDLER } from "./const.js";
import { Draw } from "./geometry/Draw.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { SETTINGS, getSetting } from "./settings.js";

export const PATCHES = {};
PATCHES.BASIC = {};
PATCHES.sfrpg = {};
PATCHES.NOT_PF2E = {};

// ----- NOTE: Hooks ----- //

/**
 * If a token is targeted, determine its cover status.
 *
 * A hook event that fires when a token is targeted or un-targeted.
 * @function targetToken
 * @memberof hookEvents
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
async function targetToken(user, target, targeted) {
  if ( !getSetting(SETTINGS.COVER.COMBAT_AUTO) ) return;

  // If not in combat, do nothing because it is unclear who is targeting what...
  if ( !game.combat?.started ) return;

  // Ignore targeting by other users
  if ( !isUserCombatTurn(user) ) return;

  if ( !targeted ) {
    return await CoverCalculator.disableAllCover(target.id);
  }

  // Target from the current combatant to the target token
  const c = game.combats.active;
  const combatToken = c.combatant.token.object;
  const coverCalc = new CoverCalculator(combatToken, target);
  return await coverCalc.setTargetCoverEffect();
}

/**
 * For Starfinder, hook apply token status effect to add the cover item as needed.
 * @param {Token} token           The token the status is being applied to
 * @param {string} statusId       The status effect ID being applied, from CONFIG.specialStatusEffects
 * @param {boolean} active        Is the special status effect now active?
 */
function applyTokenStatusEffect(token, statusId, active) {
  if ( game.system.id !== "sfrpg" ) return;

  // Is this a cover status?
  // statusId is all lowercase, at least in sfrpg.
  const cover = COVER.TYPES_FOR_ID[MODULE_ID][statusId];
  if ( !cover ) return;
  return active ? CoverCalculator.enableCover(token, COVER.TYPES_FOR_ID[MODULE_ID][statusId])
    : CoverCalculator.disableAllCover(token);
}

/**
 * Hook: updateToken
 * If the token width/height changes, invalidate the tokenShape.
 * If the token moves, clear all debug drawings.
 * @param {Document} tokenD                         The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow

 */
function updateToken(tokenD, change, _options, _userId) {
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

PATCHES.BASIC.HOOKS = { updateToken };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };
PATCHES.NOT_PF2E.HOOKS = { targetToken };

// ----- NOTE: Wraps ----- //

/**
 * Wrap Token.prototype.updateSource
 * Reset the debugging drawings.
 */
function updateSource(wrapper, ...args) {
  if ( DEBUG.once || DEBUG.cover ) {
    CONFIG.GeometryLib.Draw.clearDrawings();

    if ( DEBUG.once ) {
      DEBUG.cover = false;
      DEBUG.once = false;
    }
  }

  return wrapper(...args);
}

PATCHES.BASIC.WRAPS = {
  updateSource
};

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

/**
 * New getter: Token.prototype.ignoresCoverType
 * Instantiate a IgnoresCover class to determine if cover can be ignored for different attack types.
 * @type {boolean}
 */
function ignoresCoverType() {
  return this._ignoresCoverType || (this._ignoresCoverType = new IGNORES_COVER_HANDLER(this));
}

PATCHES.BASIC.GETTERS = {
  constrainedTokenBorder,
  tokenBorder,
  tokenShape,
  coverType,
  ignoresCoverType
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

/**
 * Determine if the user's token is the current combatant in the active tracker.
 * @param {User} user
 * @returns {boolean}
 */
function isUserCombatTurn(user) {
  if ( !game.combat?.started ) return false;

  // If no players, than it must be a GM token
  const c = game.combats.active;
  if ( !c.combatant.players.length ) return user.isGM;
  return c.combatant.players.some(player => user.name === player.name);
}
