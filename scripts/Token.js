/* globals
canvas,
CONFIG,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { MODULE_ID, COVER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Settings } from "./settings.js";
import { log } from "./util.js";
import { TokenCover } from "./TokenCover.js";

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
  const coverCalc = token.tokencover.coverCalculator;
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
      const coverCalc = t.tokencover.coverCalculator;
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
      const coverCalc = token.tokencover.coverCalculator;
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
 * Hook Token refresh
 * Adjust elevation as the token moves.
 */
function refreshToken(token, flags) {
  if ( !flags.refreshPosition ) return;

  log(`refreshToken hook|${token.name} at ${token.position.x},${token.position.y}. Token is ${token._original ? "Clone" : "Original"}`);

  // Clear this token's cover calculations because it moved.
  token.tokencover.coverFromMap.clear();

  // Clear the cover calculations relative to this token.
  TokenCover.resetTokenCoverFromAttacker(token);

  // TODO: Do we need to do anything different during token animation?
  if ( token._original ) {
    // This token is a clone in a drag operation.
    log(`refreshToken hook|Token ${token.name} is being dragged.`);

    // Update cover of other tokens relative to the dragged token.
    // Only need to update tokens if this one is an "attacker"
    // Otherwise, can just reset.
    const coverAttackers = TokenCover.coverAttackers;
    if ( coverAttackers("COVER_TYPES").some(t => t.id === token.id)
      || coverAttackers("COVER_EFFECTS").some(t => t.id === token.id) ) {
      canvas.tokens.placeables.forEach(t => {
        if ( t.id === token.id ) return; // Use id so clones are ignored
        TokenCover.updateCoverFromToken(t, token);
      });
    }
  } else if ( token._animation ) {
    log(`refreshToken hook|Token ${token.name} is animating`);
  }

  // Refresh token icons and effects for those that have changed.
  TokenCover.updateAllTokenCover();
}

/**
 * Hook: updateToken
 * If the token moves, clear cover calculations
 * @param {Document} tokenD                         The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
function updateToken(tokenD, change, _options, _userId) {
  if ( !(Object.hasOwn(change, "x")
      || Object.hasOwn(change, "y")
      || Object.hasOwn(change, "elevation")
      || Object.hasOwn(change, "rotation")) ) return;

  // Token moved
  // Clear this token's cover calculations.
  const token = tokenD.object;
  log(`updateToken hook|${token.name} moved from ${token.position.x},${token.position.y} -> ${token.document.x},${token.document.y} Center: ${token.center.x},${token.center.y}.`);
  token.tokencover.coverFromMap.clear();

  // Clear the cover calculations for this token and update cover.
  TokenCover.resetTokenCoverFromAttacker(token);
  TokenCover.updateAllTokenCover();
}

/**
 * Hook: controlToken
 * When the user selects the token, add cover type icons and effects for all tokens relative to that one.
 * When the user deselects the token, remove all cover type icons and effects.
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
function controlToken(controlledToken, controlled) {
  log(`controlToken hook|${controlledToken.name} ${controlled ? "selected" : "unselected"}`);
  TokenCover.updateAllTokenCover();
}

/**
 * Hook: destroyToken
 * @param {PlaceableObject} object    The object instance being destroyed
 */
function destroyToken(token) {
  log(`destroyToken hook|destroying ${token.name}`);
  if ( token[MODULE_ID]?.coverCalc ) token.tokencover.coverCalculator.destroy();

  // Clear all other token's cover calculations for this token.
  const id = token.id;
  canvas.tokens.placeables.forEach(t => {
    if ( t === token ) return;
    t.tokencover.coverFromMap.delete(id);
  });
  TokenCover.updateAllTokenCover();
}

/**
 * Hook: targetToken
 * If a token is targeted, determine its cover status.
 *
 * A hook event that fires when a token is targeted or un-targeted.
 * @function targetToken
 * @memberof hookEvents
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
function targetToken(user, target, _targeted) {
  const coverTypeTargetsOnly = Settings.get(Settings.KEYS.COVER_TYPES.TARGETING);
  const coverEffectTargetsOnly = Settings.get(Settings.KEYS.COVER_EFFECTS.TARGETING);
  if ( coverTypeTargetsOnly ) {
    log(`targetToken hook|updating cover icons for ${target.name}.`);
    target.tokencover.refreshCoverTypes();
  }
  if ( coverEffectTargetsOnly ) {
    log(`targetToken hook|updating cover effects for ${target.name}.`);
    target.tokencover.refreshCoverEffects();
  }
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

PATCHES.BASIC.HOOKS = { destroyToken, updateToken, controlToken, targetToken, refreshToken };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };


// ----- NOTE: Getters ----- //

/**
 * New method: Token.tokencover
 * Class that handles various token cover functions and getters.
 */
function tokencover() { return (this._tokencover ??= new TokenCover(this)); }

/**
 * New getter: Token.prototype.coverCalculator
 * Retrieve a valid cover calculator or construct a new one.
 */
function coverCalculator() { return this.tokencover.coverCalculator; }

PATCHES.BASIC.GETTERS = {
  tokencover,
  coverCalculator
};
