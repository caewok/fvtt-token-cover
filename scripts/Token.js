/* globals
canvas,
CONFIG,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { MODULE_ID, COVER, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Settings } from "./settings.js";
import { log } from "./util.js";

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


Token getters:
- coverCalculator: Instantiation of CoverCalculator where this token is the attacker.
- coverTypes: Set of CoverTypes currently assigned to this token.
- coverEffects: Set of CoverEffects currently assigned to this token.
- coverFromMap: Percentage and CoverTypes for this token relative to every other token (attackers)
- ignoresCover: Instantiation fo IgnoresCover class to determine if this token ignores cover for attacks

Token methods:
- coverPercentFromAttacker: Calculated/cached percent cover for this token from an attacker. Uses coverFromMap
- coverTypeFromAttacker: Calculated/cached cover type for this token from an attacker. Uses coverFromMap
- updateCoverTypes: Updates the cover types for this token given updated attackers
- updateCoverEffects: Updates the cover effects for this token given updated attackers
- refreshCoverTypes: Sets icons representing cover types on this token, given token.coverTypes and current display settings.
                     Setting icons can be forced, e.g. during attack roll.
- refreshCoverEffects: Sets effects representing cover effects on this token, given token.coverEffects and current display settings.
                       Setting effects can be forced, e.g. during attack roll.

The refresh methods can be triggered by renderFlags. Render flags affect the token for all users.


Helper functions:
- RefreshAllCover: When changing a setting, refresh all the cover for all users. Requires sockets.
                   Loops through tokens and calls refresh on each.


Triggers:
- Token is targeted or untargeted. If targeting option is set.
- Token is controlled or uncontrolled. If controlled option is set
- Token is moved. Wipe existing cover calculations. Refresh based on control or target.
- Combat.
-
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

/**
 * Hook Token refresh
 * Adjust elevation as the token moves.
 */
function refreshToken(token, flags) {
  if ( !flags.refreshPosition ) return;

  log(`refreshToken hook|${token.name} at ${token.position.x},${token.position.y}. Token is ${token._original ? "Clone" : "Original"}`);

  // Clear this token's cover calculations because it moved.
  token.coverFromMap.clear();

  // Clear the cover calculations relative to this token.
  resetTokenCoverFromAttacker(token);

  // TODO: Do we need to do anything different during token animation?
  if ( token._original ) {
    // This token is a clone in a drag operation.
    log(`refreshToken hook|Token ${token.name} is being dragged.`);

    // Update cover of other tokens relative to the dragged token.
    // Only need to update tokens if this one is an "attacker"
    // Otherwise, can just reset.
    const coverAttackers = CONFIG.Token.objectClass._coverAttackers;
    if ( coverAttackers("COVER_TYPES").some(t => t.id === token.id)
      || coverAttackers("COVER_EFFECTS").some(t => t.id === token.id) ) {
      canvas.tokens.placeables.forEach(t => {
        if ( t.id === token.id ) return; // Use id so clones are ignored
        updateCoverFromToken(t, token);
      });
    }
  } else if ( token._animation ) {
    log(`refreshToken hook|Token ${token.name} is animating`);
  }

  // Refresh token icons and effects for those that have changed.
  updateAllTokenCover();
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
  token.coverFromMap.clear();

  // Clear the cover calculations for this token and update cover.
  resetTokenCoverFromAttacker(token);
  updateAllTokenCover();
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
  updateAllTokenCover();
}

/**
 * Hook: destroyToken
 * @param {PlaceableObject} object    The object instance being destroyed
 */
function destroyToken(token) {
  log(`destroyToken hook|destroying ${token.name}`);
  if ( token[MODULE_ID]?.coverCalc ) token.coverCalculator.destroy();

  // Clear all other token's cover calculations for this token.
  const id = token.id;
  canvas.tokens.placeables.forEach(t => {
    if ( t === token ) return;
    t.coverFromMap.delete(id);
  });
  updateAllTokenCover();
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
    target.refreshCoverTypes();
  }
  if ( coverEffectTargetsOnly ) {
    log(`targetToken hook|updating cover effects for ${target.name}.`);
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

PATCHES.BASIC.HOOKS = { destroyToken, updateToken, controlToken, targetToken, refreshToken };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };
// PATCHES.NO_PF2E.HOOKS = { targetToken };

// ----- NOTE: Wraps ----- //
/**
 * Wrap method: Token.prototype._applyRenderFlags
 * Handle cover and effect refresh.
 * Updates and refreshes.
 */
function _applyRenderFlags(wrapped, flags) {
  wrapped(flags);
  log(`Token#_applyRenderFlags|${this.name} > ${Object.keys(flags).join(", ")}`);
  if ( flags.refreshCoverTypes ) this.refreshCoverTypes();
  if ( flags.refreshCoverEffects ) this.refreshCoverEffects();
}

PATCHES.BASIC.WRAPS = { _applyRenderFlags };


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
 * New method: Token.prototype.updateCoverTypes
 * Determine what cover types the token has, if any.
 * @returns {boolean} True if the update resulted in a change to the existing set.
 */
function updateCoverTypes() {
  const existingCoverTypes = this.coverTypes; // Calling the getter ensures the property is there.
  const attackers = this.constructor._coverAttackers("COVER_TYPES");
  attackers.findSplice(t => t === this);
  const newCoverTypes = this[MODULE_ID]._coverTypes = CONFIG[MODULE_ID].CoverType
    .minimumCoverFromAttackers(this, attackers);
  return !existingCoverTypes.equals(newCoverTypes);
}

/**
 * New method: Token.prototype.updateCoverEffects
 * Determine what type of effects could be applied to the token, if any.
 * @returns {boolean} True if the update resulted in a change to the existing set.
 */
function updateCoverEffects() {
  // Attackers may be different than cover types, depending on settings. (E.g., only targeting)
  const ctAttackers = new Set(this.constructor._coverAttackers("COVER_TYPES"));
  const ceAttackers = new Set(this.constructor._coverAttackers("COVER_EFFECTS"));
  ctAttackers.delete(this);
  ceAttackers.delete(this);
  const coverTypes = ctAttackers.equals(ceAttackers) ? this.coverTypes
    : CONFIG[MODULE_ID].CoverType.minimumCoverFromAttackers(this, [...ceAttackers]);

  // Determine if the cover effects have changed given the current cover types.
  const existingCoverEffects = this.coverEffects; // Calling the getter ensures the property is there.
  const newCoverEffects = this[MODULE_ID]._coverEffects = new Set(CONFIG[MODULE_ID].CoverEffect
    .coverObjectsMap.values().filter(ce => coverTypes.intersects(ce.coverTypes)));
  return !existingCoverEffects.equals(newCoverEffects);
}

/**
 * New method: Token.prototype.refreshCoverTypes
 * Set the cover icons representing whether this token currently has cover from tokens.
 * Observes settings that control whether icons should be displayed unless forced.
 * @param {boolean} [force=false]   If true, ignore settings; just display icons corresponding to types
 * @returns {boolean} True if a change occurred
 */
function refreshCoverTypes(force = false) {
  log(`Token#refreshCoverTypes|${this.name}`);
  const coverTypes = (force || useCoverObject("COVER_TYPES", this)) ? this.coverTypes : NULL_SET;

  // Trigger token icons update if there was a change.
  const changed = CONFIG[MODULE_ID].CoverType.replaceCoverTypes(this, coverTypes);
  if ( changed ) this.renderFlags.set({ redrawEffects: true });
  return changed;
}

/**
 * New method: Token.prototype.refreshCoverEffects
 * Applies cover effects based on existing cover effects set.
 * Observes settings that control whether effects should be applied unless forced.
 * @param {boolean} [force=false]   If true, ignore settings; just display icons corresponding to types
 * @returns {boolean} True if a change occurred
 */
function refreshCoverEffects(force=false) {
  log(`Token#refreshCoverEffects|${this.name}`);
  const coverEffects = (force || useCoverObject("COVER_EFFECTS", this)) ? this.coverEffects : NULL_SET;

  // Trigger local effects update for actor; return changed state.
  return CONFIG[MODULE_ID].CoverEffect.replaceLocalEffectsOnActor(this, coverEffects);
}

PATCHES.BASIC.METHODS = {
  coverPercentFromAttacker,
  coverTypesFromAttacker,
  coverTypes,
  coverEffects,
  updateCoverTypes,
  updateCoverEffects,
  refreshCoverTypes,
  refreshCoverEffects
};

// ----- NOTE: Static methods ----- //

/**
 * New method: Token._coverAttackers
 * Tokens considered to be currently attacking for purposes of assigning
 * cover types and effects.
 * @param {"COVER_TYPES"|"COVER_EFFECTS"} [objectType]
 * @returns {Token[]}
 */
function _coverAttackers(objectType = "COVER_TYPES") {
  if ( game.combat?.started && game.combat.combatant?.isOwner ) {
    const choice = Settings.get(Settings.KEYS[objectType].USE);
    const choices = Settings.KEYS[objectType].CHOICES;
    if ( choice === choices.COMBATANT ) return [game.combat.combatant];
  }
  return canvas.tokens.controlled.filter(t => t !== this)
}

PATCHES.BASIC.STATIC_METHODS = { _coverAttackers };

// ----- NOTE: Getters ----- //

/**
 * New getter: Token.prototype.coverCalculator
 * Retrieve a valid cover calculator or construct a new one.
 */
function coverCalculator() {
  const mod = this[MODULE_ID] ??= {};
  return (mod.coverCalc ??= new CoverCalculator(this));
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

/**
 * New getter: Token.prototype.ignoresCover
 * Instantiate a IgnoresCover class to determine if cover can be ignored for different attack types.
 * @type {boolean}
 */
function ignoresCover() {
  return this._ignoresCover || (this._ignoresCover = new IGNORES_COVER_HANDLER(this));
}

/**
 * New getter: Token.prototype.coverTypes
 * Set of CoverTypes currently assigned to this token.
 * @type {Set<CoverType>}
 */
function coverTypes() {
  const mod = this[MODULE_ID] ??= {};
  return (mod._coverTypes ??= new Set());
}

/**
 * New getter: Token.prototype.coverEffects
 * Set of CoverEffects currently assigned to this token.
 * @type {Set<CoverEffect>}
 */
function coverEffects() {
  const mod = this[MODULE_ID] ??= {};
  return (mod._coverEffects ??= new Set());
}


PATCHES.BASIC.GETTERS = {
  coverCalculator,
  coverFromMap,
  ignoresCover,
  coverTypes,
  coverEffects
};


// ----- NOTE: Helper functions ----- //

/**
 * Helper function: determine whether to apply a cover icon or cover effect.
 * @param {"COVER_TYPES"|"COVER_EFFECTS"} objectType
 * @param {Token} token
 * @returns {boolean}
 */
function useCoverObject(objectType, token) {
  const { TARGETING, USE, CHOICES } = Settings.KEYS[objectType];
  const targetsOnly = Settings.get(TARGETING);
  if ( targetsOnly && !token.isTargeted ) return false;
  switch ( Settings.get(USE) ) {
    case CHOICES.NEVER: return false;
    case CHOICES.ATTACK: return false; // Handled by forcing application in the workflow.
    case CHOICES.ALWAYS: return true;
    case CHOICES.COMBAT: return Boolean(game.combat?.started);
    case CHOICES.COMBATANT: return Boolean(game.combat?.started) && game.combat.combatants.has(token.id);
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
  log(`updateCoverFromToken|${attackingToken.name} ⚔️ ${tokenToUpdate.name}: ${percentCover}
  \t${attackingToken.name} ${attackingToken.document.x},${attackingToken.document.y} Center ${attackingToken.center.x},${attackingToken.center.y}
  \t${tokenToUpdate.name} ${tokenToUpdate.document.x},${tokenToUpdate.document.y} Center ${tokenToUpdate.center.x},${tokenToUpdate.center.y}`);
  tokenToUpdate.coverFromMap.set(attackingToken.id, { coverTypes, percentCover});
}

/**
 * Helper to update cover types and effects for all tokens for the current user on the canvas.
 */
function updateAllTokenCover() {
  canvas.tokens.placeables.forEach(t => {
    log(`updateAllTokenCover|updating cover for ${t.name}.`);
    if ( t.updateCoverTypes() ) t.refreshCoverTypes();
    if ( t.updateCoverEffects() ) t.refreshCoverEffects();
  });
}

/**
 * Helper to remove cover calculations for a given attacker.
 * The presumption here is that the attacker changed position or some other property meaning
 * that the previous cover calculation is no longer valid.
 * @param {Token} attacker
 */
function resetTokenCoverFromAttacker(attacker) {
  // Clear all other token's cover calculations for this token.
  const id = attacker.id;
  canvas.tokens.placeables.forEach(t => {
    if ( t === attacker ) return;
    t.coverFromMap.delete(id);
  });
}

