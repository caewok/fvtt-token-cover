/* globals
canvas,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { MODULE_ID, MODULES_ACTIVE, COVER, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { SETTINGS, Settings } from "./settings.js";
import { isFirstGM, keyForValue } from "./util.js";

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
 * Helper function: determine whether to use the cover icon.
 */
function useCoverIcon() {
  const choice = Settings.get(Settings.KEYS.USE_COVER_ICON);
  switch ( Settings.get(Settings.KEYS.USE_COVER_ICON) ) {
    case USE_COVER_ICON_CHOICES.NEVER: return false;
    case USE_COVER_ICON_CHOICES.ALWAYS: return true;
    case USE_COVER_ICON_CHOICES.COMBAT: return Boolean(game.combats.active);
    default: return false;
  }
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
  token.coverFromMap.clear();

  // Clear all other token's cover calculations for this token.
  const id = token.id;
  canvas.tokens.placeables.forEach(t => {
    if ( t === token ) return;
    t.coverFromMap.delete(id);
  });

  if ( useCoverIcon()  ) {
    // If tokens are controlled, update.
    const tokens = canvas.tokens.controlled;
    if ( tokens.length ) updateCoverForAttackingTokens(tokens);
  }
}

/**
 * Hook: controlToken
 * When the user selects the token, add a cover status for all tokens relative to that one.
 * When the user deselects the token, remove all cover status.
 * Only if a single token is controlled.
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
function controlToken(controlledToken, _controlled) {
  if ( !useCoverIcon()) return;
  const tokens = canvas.tokens;
  if ( tokens.controlled.length ) updateCoverForAttackingTokens(tokens.controlled);
  else tokens.placeables.forEach(t => t.updateCoverIcon()); // Remove all cover status.
}

/**
 * Helper to recalculate cover status for a controlled token versus all other tokens.
 * Used when controlling a token or moving a controlled token.
 * @param {Token} attackingToken     Token seeking other tokens (The token assumed to be controlled.)
 */
function updateCoverForAttackingTokens(attackingTokens) {
  attackingTokens = new Set(attackingTokens);
  canvas.tokens.placeables.forEach(t => {
    if ( attackingTokens.has(t) ) return;
    t.updateCoverIcon(attackingTokens);
  });
}

/**
 * Hook: targetToken
 * If the debug popout is active, redraw the 3d debug if the target changes.
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
// function targetTokenDebug(user, target, targeted) {
//   if ( !targeted || game.user !== user ) return;
//   for ( const token of canvas.tokens.controlled ) {
//     if ( !token[MODULE_ID]?.coverCalc ) continue;
//     const coverCalc = token.coverCalculator;
//     if ( !coverCalc.calc.popoutIsRendered ) continue;
//     coverCalc.target = target;
//     coverCalc.percentCover();
//     coverCalc.calc._draw3dDebug();
//   }
// }

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
// async function targetToken(user, target, targeted) {
//   if ( !isFirstGM()
//     || !Settings.get(SETTINGS.COVER.COMBAT_AUTO)
//     || !game.combat?.started // If not in combat, do nothing because it is unclear who is targeting what...
//     || !isUserCombatTurn(user)  // Ignore targeting by other users
//   ) return;
//
//   if ( !targeted ) return await CoverCalculator.disableAllCover(target.id);
//
//   // Target from the current combatant to the target token
//   const c = game.combats.active?.combatant;
//   if ( !c ) return; // Apparently combatant is not always defined.
//   const combatToken = c.token.object;
//   const coverCalc = combatToken.coverCalculator;
//   coverCalc.target = target;
//   return await coverCalc.setTargetCoverEffect();
// }

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

PATCHES.BASIC.HOOKS = { destroyToken, updateToken, controlToken };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };
// PATCHES.NO_PF2E.HOOKS = { targetToken };


// ----- NOTE: Methods ----- //
/**
 * Token.prototype.setCoverType
 * Set cover type for this token.
 * @param {COVER.TYPES} value
 */
async function setCoverType(value) { return this.coverCalculator.setTargetCoverEffect(value); }

/**
 * Helper to update whether this token has cover from another token.
 * @param {Token} tokenToUpdate   Token whose cover should be calcualted
 * @param {Token} otherToken      Other token from which this token may have cover
 * @returns {number} Cover percent, for convenience.
 */
function updateCoverFromToken(tokenToUpdate, attackingToken) {
  const coverPercent = tokenToUpdate.coverCalculator.percentCover(attackingToken);
  tokenToUpdate.coverFromMap.set(attackingToken.id, coverPercent);
  return coverPercent;
}

/**
 * New method: Token.prototype.coverTypeFromToken
 * Returns the stored cover type or calculates it, as necessary.
 * @param {Token} attackingToken   Other token from which this token may have cover
 * @returns {COVER_TYPES}
 */
function coverFromToken(attackingToken) {
  const coverFromMap = this.coverFromMap;
  const percentCover = coverFromMap.get(attackingToken.id) ?? updateCoverFromToken(this, attackingToken);
  return CoverCalculator.typeForPercentage(percentCover);
}

/**
 * New method: Token.prototype.updateCoverIcon
 * Set the cover icon representing whether this token has cover from a specified token.
 * Only one status icon should be present at a time.
 * @param {Token[]|Set<Token>} [attackingToken]   Other tokens from which this token may have cover
 *                                                If length/size 0, all cover icons are removed
 */
async function updateCoverIcon(attackingTokens = []) {
  const mod = this[MODULE_ID] ??= {};
  const currentIcon = mod.currentCoverIcon; // Store here b/c cannot add property to src string.
  let changed = false;

  // Determine the minimum cover from the attacking tokens.
  let coverType = Number.POSITIVE_INFINITY;
  for ( const attackingToken of attackingTokens ) {
    coverType = Math.min(coverType, this.coverFromToken(attackingToken));
    if ( !coverType ) break; // If no cover, then we are done.
  }
  if ( !Number.isFinite(coverType) ) coverType = COVER.TYPES.NONE;

  // No cover; remove cover icon
  if ( currentIcon && !coverType ) {
    this.document.effects = this.document.effects.filter(e => e !== currentIcon);
    changed ||= true;
    mod.currentCoverIcon = undefined;
  }

  // Cover; remove old, add new, unless already same.
  else if ( currentIcon && coverType ) {
    mod.currentCoverIcon = Settings.get(Settings.KEYS.COVER_ICON[keyForValue(COVER.TYPES, coverType)]);
    if ( currentIcon !== mod.currentCoverIcon ) {
      this.document.effects = this.document.effects.filter(e => e !== currentIcon);
      this.document.effects.push(mod.currentCoverIcon);
      changed ||= true;
    }
  }

  // Cover; add the new source.
  else if ( !currentIcon && coverType ) {
    mod.currentCoverIcon = Settings.get(Settings.KEYS.COVER_ICON[keyForValue(COVER.TYPES, coverType)]);
    this.document.effects.push(mod.currentCoverIcon);
    changed ||= true;
  }

  // if ( !currentIcon && !coverType ) <-- No cover and no current cover icon, so nothing to do.

  // Trigger effects update if there was a change.
  if ( changed ) this.renderFlags.set({ redrawEffects: true });
}


PATCHES.BASIC.METHODS = { setCoverType, coverFromToken, updateCoverIcon };

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


/**
 * New getter: Token.prototype.coverFromMap
 * Return a map that records the cover percentage of this token versus every other token on the scene.
 * Updated on token movement.
 * Map is not guaranteed to have any specific token in the map.
 * @type {Map<string|number>} Map of token ids and percentage cover
 */
function coverFromMap() {
  const mod = this[MODULE_ID] ??= {};
  return (mod._coverFromMap ??= new Map());
}

PATCHES.BASIC.GETTERS = {
  coverCalculator,
  coverType,
  ignoresCoverType,
  coverFromMap
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
