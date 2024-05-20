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
    .filter(t => t !== target && t.controlled && t._tokencover)
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
  if ( !changedToken._tokencover ) return;
  const changedCalc = changedToken[MODULE_ID].coverCalculator.calc;
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
    .filter(t => t !== changedToken && t.controlled && t._tokencover)
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
 * Adjust cover calculations as the token moves.
 */
function refreshToken(token, flags) {
  if ( !flags.refreshPosition ) return;

  log(`refreshToken hook|${token.name} at ${token.position.x},${token.position.y}. Token is ${token._original ? "Clone" : "Original"}
  \tdocument: ${token.document.x},${token.document.y}
  \tcenter: ${token.center.x},${token.center.y}`);

  // Clear this token's cover calculations because it moved.
 // token.tokencover.coverFromMap.clear();

  // Clear the cover calculations relative to this token.
  //const id = token.id;
  //canvas.tokens.placeables.forEach(t => t.tokencover.coverFromMap.delete(id));


  // TODO: Do we need to do anything different during token animation?
  if ( token._original ) {
    // This token is a clone in a drag operation.
    const snap = !(canvas.grid.type === CONST.GRID_TYPES.GRIDLESS
      || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT));
    log(`refreshToken hook|Token ${token.name} is being dragged. ${snap ? "Snap." : "No snapping."}`);

    if ( snap ) {
      // Use a different clone for the attacker and move it to a snapped position.
      const snapClone = token._snapClone ?? (token._snapClone = CoverCalculator.cloneForTokenLocation(token));

      // Determine the snapped position.
      const snappedPosition = getSnappedTokenPosition(token);
      snapClone.document.updateSource(snappedPosition);

      // Remove original and animating clone from attackers.
      TokenCover.removeAttacker(token._original, false);
      TokenCover.removeAttacker(token, false);
      TokenCover.addAttacker(snapClone, false, false);
      TokenCover.tokenMoved(snapClone);

    } else {
      // Use the provided animating clone
      // Remove original and snapping clone from attackers.
      if ( token._snapClone ) TokenCover.removeAttacker(token._snapClone, false);
      TokenCover.removeAttacker(token._original, false);
      TokenCover.addAttacker(token, false, false);
      TokenCover.tokenMoved(token);
    }

  } else if ( token._animation ) {
    log(`refreshToken hook|Token ${token.name} is animating`);
    // Remove any clones?
    TokenCover.tokenMoved(token);

  } else {
    log(`refreshToken hook|Token ${token.name} is original but not animating.`);
    // Remove any clones?
    TokenCover.tokenMoved(token);
  }
}

/**
 * Get the snapped position of a token.
 * @param {Token} token
 */
function getSnappedTokenPosition(token) {
  // See Token.prototype._onDragLeftDrop
  const isTiny = (token.document.width < 1) && (token.document.height < 1);
  const interval = canvas.grid.isHex ? 1 : isTiny ? 2 : 1;
  return canvas.grid.getSnappedPosition(token.x, token.y, interval, { token });
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
  const token = tokenD.object;
  if ( !token ) return;
  if ( Object.hasOwn(change, "disposition") ) {
    token[MODULE_ID].updateCoverIconDisplay();
    CONFIG[MODULE_ID].CoverEffect.refreshCoverDisplay(token);
  }
  if ( !(Object.hasOwn(change, "x")
      || Object.hasOwn(change, "y")
      || Object.hasOwn(change, "elevation")
      || Object.hasOwn(change, "rotation")) ) return;

  if ( CanvasAnimation.getAnimation(_token.animationName) ) return;
  log(`updateToken hook|${token.name} moved from ${token.position.x},${token.position.y} -> ${token.document.x},${token.document.y} Center: ${token.center.x},${token.center.y}.`);
  TokenCover.tokenMoved(token);
}

/**
 * Hook: controlToken
 * Control of tokens may modify the attacker set for this user.
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
function controlToken(controlledToken, controlled) {
  log(`controlToken hook|${controlledToken.name} ${controlled ? "selected" : "unselected"}`);
  if ( controlled ) TokenCover.addAttacker(controlledToken);
  else TokenCover.removeAttacker(controlledToken);
}

/**
 * Hook: destroyToken
 * @param {PlaceableObject} object    The object instance being destroyed
 */
function destroyToken(token) {
  log(`destroyToken hook|destroying ${token.name}`);

  // Clear all other token's cover calculations for this token.
  const id = token.id;
  canvas.tokens.placeables.forEach(t => t.tokencover.coverFromMap.delete(id));

  // If clone attacker, add back the original attacker.
  if ( token._original && TokenCover.attackers.has(token) ) TokenCover.addAttacker(token._original, false, false);

  // Remove as attacker.
  if ( token._snapClone ) {
    const snapClone = token._snapClone;
    if ( TokenCover.attackers.has(snapClone) ) TokenCover.addAttacker(token._original, false, false);
    TokenCover.removeAttacker(snapClone);
    if ( !token._snapClone.destroyed ) token._snapClone.destroy();
  }

  TokenCover.removeAttacker(token);
  if ( token._tokencover ) token.tokencover.destroy();
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
  target.tokencover.targetStatusChanged();
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
