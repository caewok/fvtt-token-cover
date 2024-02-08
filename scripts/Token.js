/* globals
canvas,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { MODULE_ID, MODULES_ACTIVE, COVER, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { SETTINGS, Settings } from "./settings.js";
import { isFirstGM } from "./util.js";

export const PATCHES = {};
PATCHES.BASIC = {};
PATCHES.DEBUG = {};
PATCHES.sfrpg = {};
PATCHES.NO_PF2E = {};


// ----- NOTE: Debug Hooks ----- //

/**
 * Hook: controlToken
 * If the token is uncontrolled, clear debug drawings.
 * @event controlObject
 * @category PlaceableObject
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
async function controlTokenDebugHook(token, controlled) {
  if ( !token[MODULE_ID].coverCalc ) return;
  const coverCalc = token.coverCalculator;
  coverCalc.clearDebug();
  if ( controlled ) {
    if ( coverCalc.calc.openDebugPopout ) await coverCalc.calc.openDebugPopout();
    updateDebugForControlledToken(token);
  }
}

/**
 * Hook: targetToken
 * Check for other controlled tokens and update their Area3d debug popout to point at this target.
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
function targetTokenDebugHook(user, target, targeted) {
  if ( !targeted || game.user !== user ) return;
  canvas.tokens.placeables
    .filter(t => t !== target && t.controlled && t[MODULE_ID]?.coverCalc)
    .forEach(t => {
      const coverCalc = t.coverCalculator;
      if ( !coverCalc._draw3dDebug ) return;
      coverCalc.calc._clearCache();
      coverCalc.target = target;
      coverCalc.calc.updateDebug();
    });

}

/**
 * Hook: updateToken
 * If the token moves, clear all debug drawings.
 * @param {Document} tokenD                         The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
function updateTokenDebugHook(tokenD, change, _options, _userId) {
  if ( !(Object.hasOwn(change, "x")
      || Object.hasOwn(change, "y")
      || Object.hasOwn(change, "elevation")
      || Object.hasOwn(change, "rotation")) ) return;

  // Token moved
  const token = tokenD.object;
  if ( token.controlled ) updateDebugForControlledToken(token);
  updateDebugForRelatedTokens(token);
}

/**
 * If token position is refreshed (i.e., clone), then clear debug.
 * @param {PlaceableObject} object    The object instance being refreshed
 * @param {RenderFlag} flags
 */
function refreshTokenDebugHook(token, flags) {
  if ( !flags.refreshPosition ) return;
  if ( token.controlled ) updateDebugForControlledToken(token);
  updateDebugForRelatedTokens(token);
}

function updateDebugForControlledToken(changedToken) {
  // If this token is controlled, update its LOS canvas display to every other token.
  const changedCalc = changedToken[MODULE_ID]?.coverCalc.calc;
  if ( !changedCalc ) return;
  changedCalc.clearDebug();
  canvas.tokens.placeables.forEach(token => {
    if ( token === changedToken ) return;
    changedCalc._clearCache();
    changedCalc.target = token;
    changedCalc.updateDebug();
  });

}

/**
 * Update debug graphics for tokens related to this one.
 * @param {Token} changedToken    Token that has been updated (position, etc.)
 */
function updateDebugForRelatedTokens(changedToken) {
  // For any other controlled token, update its LOS canvas display for this one.
  canvas.tokens.placeables
    .filter(t => t !== changedToken && t.controlled && t[MODULE_ID]?.coverCalc)
    .forEach(token => {
      const coverCalc = token.coverCalculator;
      if ( coverCalc.target === changedToken ) coverCalc.clearDebug();
      coverCalc.calc._clearCache();
      coverCalc.target = changedToken;
      coverCalc.calc.updateDebug();
    });
}

PATCHES.DEBUG.HOOKS = {
  controlToken: controlTokenDebugHook,
  updateToken: updateTokenDebugHook,
  refreshToken: refreshTokenDebugHook,
  targetToken: targetTokenDebugHook
};

// ----- NOTE: Hooks ----- //

/**
 * Hook: targetToken
 * If the debug popout is active, redraw the 3d debug if the target changes.
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
function targetTokenDebug(user, target, targeted) {
  if ( !targeted || game.user !== user ) return;
  for ( const token of canvas.tokens.controlled ) {
    if ( !token[MODULE_ID]?.coverCalc ) continue;
    const coverCalc = token.coverCalculator;
    if ( !coverCalc.calc.popoutIsRendered ) continue;
    coverCalc.target = target;
    coverCalc.percentCover();
    coverCalc.calc._draw3dDebug();
  }
}

/**
 * Hook: destroyToken
 * @param {PlaceableObject} object    The object instance being destroyed
 */
function destroyToken(token) { if ( token[MODULE_ID]?.coverCalc ) token.coverCalculator.destroy(); }

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
  if ( !isFirstGM()
    || !Settings.get(SETTINGS.COVER.COMBAT_AUTO)
    || !game.combat?.started // If not in combat, do nothing because it is unclear who is targeting what...
    || !isUserCombatTurn(user)  // Ignore targeting by other users
  ) return;

  if ( !targeted ) return await CoverCalculator.disableAllCover(target.id);

  // Target from the current combatant to the target token
  const c = game.combats.active?.combatant;
  if ( !c ) return; // Apparently combatant is not always defined.
  const combatToken = c.token.object;
  const coverCalc = combatToken.coverCalculator;
  coverCalc.target = target;
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

PATCHES.BASIC.HOOKS = { destroyToken, targetToken: targetTokenDebug };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };
PATCHES.NO_PF2E.HOOKS = { targetToken };


// ----- NOTE: Methods ----- //
/**
 * Token.prototype.setCoverType
 * Set cover type for this token.
 * @param {COVER.TYPES} value
 */
async function setCoverType(value) { return this.coverCalculator.setTargetCoverEffect(value); }

PATCHES.BASIC.METHODS = { setCoverType };

// ----- NOTE: Getters ----- //

/**
 * New getter: Token.prototype.coverType
 * Determine what type of cover the token has, if any.
 * @type {COVER_TYPES}
 */
function coverType() {
  const statuses = this.actor?.statuses;
  if ( !statuses ) return COVER.TYPES.NONE;
  const coverModule = MODULES_ACTIVE.DFREDS_CE ? "dfreds-convenient-effects" : MODULE_ID;
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

/**
 * New getter: Token.prototype.coverCalculator
 * Retrieve a valid cover calculator or construct a new one.
 */
function coverCalculator() {
  this[MODULE_ID] ??= {};
  return (this[MODULE_ID].coverCalc ??= new CoverCalculator(this));
}

PATCHES.BASIC.GETTERS = {
  coverCalculator,
  coverType,
  ignoresCoverType
};


// ----- NOTE: Helper functions ----- //

/**
 * Determine if the user's token is the current combatant in the active tracker.
 * @param {User} user
 * @returns {boolean}
 */
function isUserCombatTurn(user) {
  if ( !game.combat?.started ) return false;

  // If no players, than it must be a GM token
  const players = game.combats.active?.combatant?.players;
  if ( !players?.length ) return user.isGM;
  return players.some(player => user.name === player.name);
}
