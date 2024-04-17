/* globals
canvas,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { MODULE_ID, MODULES_ACTIVE, COVER, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { SETTINGS, Settings } from "./settings.js";
import { isFirstGM, keyForValue, log } from "./util.js";
import { CoverType } from "./CoverType.js";
import { CoverEffect } from "./CoverEffect.js";

export const PATCHES = {};
PATCHES.BASIC = {};
PATCHES.DEBUG = {};
PATCHES.sfrpg = {};
PATCHES.NO_PF2E = {};

const NULL_SET = new Set(); // Set intended to signify no items, as a placeholder.

/* Token Cover

Track cover types and cover effects for each token behind the scenes.
Token properties:
- coverCalculator. For calculating whether other tokens have cover from this token.
- coverFromMap. Map of cover types and percents for every other token on the scene.


Attackers are always the selected token(s) unless Combatant is chosen.
Settings control whether attackers are tracked and how types and effects are assigned.
Effects require types, so greater number of attackers will be used.
()

- Never: Not tracked.
- Attack: Not tracked. Handled at the moment of attack.
- Combat: Only track during combat.
- Combatant: Only the current user; combatant is the attacker.
- Targeting boolean: Only assign cover types, effects to targeted tokens.

Token methods:
- coverPercentFromAttacker
- coverTypeFromAttacker
- _coverAttackers. What tokens are considered to be attacking this token, for setting cover types
- _coverTypes. Cover types given the current attackers.
- _coverEffects. Cover effects given the current attackers.
- refreshCoverIcons. Refresh the icons representing cover types.
- refreshCoverEffects. Refresh the local cover effects.

Triggers:
- Token is targeted or untargeted. If targeting option is set.
- Token is controlled or uncontrolled. If controlled option is set
- Token is moved. Wipe existing cover calculations. Refresh based on control or target.
*/

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

function preUpdateToken(tokenD, change, _options, _userId) {
  return true;
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

  if ( useCoverObject("COVER_TYPES") ) {
    log(`updateToken hook|updating cover icons.`)
    canvas.tokens.placeables.forEach(t => t.refreshCoverIcons());
  }
  if ( useCoverObject("COVER_EFFECTS") ) {
    log(`updateToken hook|updating cover effects.`)
    canvas.tokens.placeables.forEach(t => t.refreshCoverEffects());
  }
}

/**
 * Hook: controlToken
 * When the user selects the token, add cover type icons and effects for all tokens relative to that one.
 * When the user deselects the token, remove all cover type icons and effects.
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
function controlToken(_controlledToken, _controlled) {
  if ( useCoverObject("COVER_TYPES") ) {
    log(`controlToken hook|updating cover icons. ${_controlledToken.name} ${_controlled ? "controlled" : "uncontrolled"}`)
    canvas.tokens.placeables.forEach(t => t.refreshCoverIcons());
  }
  if ( useCoverObject("COVER_EFFECTS") ) {
    log(`controlToken hook|updating cover effects. ${_controlledToken.name} ${_controlled ? "controlled" : "uncontrolled"}`)
    canvas.tokens.placeables.forEach(t => t.refreshCoverEffects());
  }
}

/**
 * Hook: destroyToken
 * @param {PlaceableObject} object    The object instance being destroyed
 */
function destroyToken(token) { if ( token[MODULE_ID]?.coverCalc ) token.coverCalculator.destroy(); }

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
function targetToken(user, target, targeted) {
  const coverTypeTargetsOnly = Settings.get(Settings.KEYS.COVER_TYPES.TARGETING);
  const coverEffectTargetsOnly = Settings.get(Settings.KEYS.COVER_EFFECTS.TARGETING);
  if ( coverTypeTargetsOnly && useCoverObject("COVER_TYPES") ) {
    log(`targetToken hook|updating cover icons.`)
    target.refreshCoverIcons();
  }
  if ( coverEffectTargetsOnly && useCoverObject("COVER_EFFECTS") ) {
    log(`targetToken hook|updating cover effects.`)
    target.refreshCoverEffects();
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

PATCHES.BASIC.HOOKS = { destroyToken, updateToken, controlToken, targetToken, preUpdateToken };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };
// PATCHES.NO_PF2E.HOOKS = { targetToken };

// ----- NOTE: Methods ----- //

/**
 * New method: Token.prototype.coverPercentFromAttacker
 * Returns the stored cover percent or calculates it, as necessary.
 * @param {Token} attackingToken   Other token from which this token may have cover
 * @returns {number}
 */
function coverPercentFromAttacker(attackingToken) {
  const coverFromMap = this.coverFromMap;
  if ( !coverFromMap.has(attackingToken.id) ) updateCoverFromToken(this, attackingToken);
  return coverFromMap.get(attackingToken.id).percentCover;
}

/**
 * New method: Token.prototype.coverTypesFromAttacker
 * Returns the stored cover type or calculates it, as necessary.
 * @param {Token} attackingToken   Other token from which this token may have cover
 * @returns {CoverType[]}
 */
function coverTypesFromAttacker(attackingToken) {
  const coverFromMap = this.coverFromMap;
  if ( !coverFromMap.has(attackingToken.id) ) updateCoverFromToken(this, attackingToken);
  return coverFromMap.get(attackingToken.id).coverTypes;
}

/**
 * New method: Token.prototype._coverAttackers
 * Tokens considered to be currently attacking this token for purposes of assigning
 * cover types and effects.
 * @param {Token} [target]
 * @param {"COVER_TYPES"|"COVER_EFFECTS"} [objectType]
 * @returns {Token[]}
 */
function _coverAttackers(objectType = "COVER_TYPES") {
  if ( game.combats?.active && game.combat?.combatant?.isOwner && game.combat.combatant !== this ) {
    const choice = Settings.get(Settings.KEYS[objectType].USE);
    const choices = Settings.KEYS[objectType].CHOICES;
    if ( choice === choices.COMBATANT ) [game.combat.combatant];
  }
  return canvas.tokens.controlled.filter(t => t !== this)
}

/**
 * New method: Token.prototype._coverTypes
 * Determine what type of cover the token has, if any.
 * @type {Set<CoverType>}
 */
function _coverTypes() {
  return CoverType.minimumCoverFromAttackers(this, this._coverAttackers("COVER_TYPES"));
}

/**
 * New method: Token.prototype._coverEffects
 * Determine what type of effects could be applied to the token, if any.
 * @type {Set<CoverEffect>}
 */
function _coverEffects() {
  const coverTypes = CoverType.minimumCoverFromAttackers(this, this._coverAttackers("COVER_EFFECTS"));
  return CoverEffect.coverObjectsMap.values().filter(ce => coverTypes.intersects(new Set(ce.coverTypes)));
}

/**
 * New method: Token.prototype.refreshCoverIcons
 * Set the cover icons representing whether this token currently has cover from tokens.
 */
function refreshCoverIcons() {
  const targetsOnly = Settings.get(Settings.KEYS.COVER_TYPES.TARGETING);
  const currCoverTypes = (targetsOnly && !this.isTargeted) ? NULL_SET : this._coverTypes();

  // Trigger token icons update if there was a change.
  const changed = CoverType.replaceCoverTypes(this, currCoverTypes);
  if ( changed ) this.renderFlags.set({ redrawEffects: true });
}

/**
 * New method: Token.prototype.refreshCoverEffects
 * Set the cover icons representing whether this token currently has cover from tokens.
 */
function refreshCoverEffects() {
  log(`Token#refreshCoverEffects|${this.name}`);
  const targetsOnly = Settings.get(Settings.KEYS.COVER_TYPES.TARGETING);
  const currCoverEffects = (targetsOnly && !this.isTargeted) ? NULL_SET : this._coverEffects();
  CoverEffect.replaceLocalEffectsOnActor(this, currCoverEffects);
}

PATCHES.BASIC.METHODS = {
  coverPercentFromAttacker,
  coverTypesFromAttacker,
  _coverAttackers,
  _coverTypes,
  _coverEffects,
  refreshCoverIcons,
  refreshCoverEffects
};

// ----- NOTE: Getters ----- //

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
 * Return a map that records the cover types of this token versus every other token on the scene.
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
  coverFromMap,
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

/**
 * Helper function: determine whether to apply a cover icon or cover effect.
 * @param {"COVER_TYPES"|"COVER_EFFECTS"} objectType
 */
function useCoverObject(objectType) {
  const choice = Settings.get(Settings.KEYS[objectType].USE);
  const choices = Settings.KEYS[objectType].CHOICES;
  switch ( choice ) {
    case choices.NEVER:
    case choices.ATTACK: return false;
    case choices.ALWAYS: return true;
    case choices.COMBAT:
    case choices.COMBATANT: return Boolean(game.combats?.active);
    default: return false;
  }
}

/**
 * Helper to update whether this token has cover from another token.
 * @param {Token} tokenToUpdate   Token whose cover should be calculated
 * @param {Token} attackingToken  Other token from which this token may have cover
 * @returns {CoverTypes[]} Array of cover types, for convenience.
 */
function updateCoverFromToken(tokenToUpdate, attackingToken) {
  const percentCover = attackingToken.coverCalculator.percentCover(tokenToUpdate);
  const coverTypes = attackingToken.coverCalculator.coverTypes(tokenToUpdate);
  tokenToUpdate.coverFromMap.set(attackingToken.id, { coverTypes, percentCover});
}
