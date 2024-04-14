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

/* Token Cover

Track cover types and cover effects for each token behind the scenes.
Token properties:
- coverCalculator. For calculating whether other tokens have cover from this token.
- coverFromMap. Map of cover types for every other token on the scene.
- coverAttackers. What tokens are considered to be attacking this token, for setting cover types
- coverTypes. Cover types given the current attackers.
- coverEffects. Cover effects given the current attackers.

Attackers are always the selected token(s) unless Combatant is chosen.
Settings control whether attackers are tracked and how types are assigned.
- Never: Not tracked.
- Attack: Not tracked. Handled at the moment of attack.
- Targeting: Only assign cover types, effects to targeted tokens.
- Combat:
  - Always: Track regardless of combat.
  - Combat: Only track during combat.
  - Combatant: Only the current user; combatant is the attacker.

Token methods:
- coverPercentFromToken
- coverTypeFromToken
- coverTypesForAttackers
- coverEffectsForAttackers




*/


// ----- NOTE: Hooks ----- //

/**
 * Helper function: determine whether to use the cover icon.
 * @param {"COVER_TYPES"|"COVER_EFFECTS"} objectType
 */
function useCoverObject(objectType, token) {
  const choice = Settings.get(Settings.KEYS[objectType].USE);
  const choices = Settings.KEYS[objectType].CHOICES;
  switch ( choice ) {
    case choices.NEVER: return false;
    case choices.ALWAYS: return true;
    case choices.COMBAT: return Boolean(game.combats.active);
    case choices.TARGETING: return game.user.targets.has(token);
    case choices.ATTACK: return false;
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

  const attackingTokens = canvas.tokens.controlled;
  if ( attackingTokens.length
    && useCoverObject("COVER_TYPES", token) ) {
      token.updateCoverForAttackingTokens(attackingTokens);

  }

  if ( attackingTokens.length && useCoverObject("COVER_EFFECTS", token) ) {
      const coverTypes = CoverType.minimumCoverFromAttackers(token, attackingTokens);
      CoverEffect.replaceLocalEffectsOnActor(token, coverTypes);
  }
}

/**
 * Hook: controlToken
 * When the user selects the token, add a cover status for all tokens relative to that one.
 * When the user deselects the token, remove all cover status.
 * If multiple tokens controlled,
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
function controlToken(controlledToken, _controlled) {
  if ( !useCoverIcon()) return;
  const tokens = canvas.tokens;
  if ( tokens.controlled.length ) updateCoverForAttackingTokens(tokens.controlled);
  else tokens.placeables.forEach(t => t.updateCoverIcons()); // Remove all cover status.
}

/**
 * Helper to recalculate cover status for a controlled token versus all other tokens.
 * Used when controlling a token or moving a controlled token.
 * @param {Token} attackingTokens     Tokens seeking other tokens (The token assumed to be controlled.)
 */
function updateCoverForAttackingTokens(attackingTokens = []) {
  attackingTokens = new Set(attackingTokens);
  canvas.tokens.placeables.forEach(t => {
    if ( attackingTokens.has(t) ) return;
    t.updateCoverIcons(attackingTokens);
  });
}

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
  if ( !game.combat?.started ) return; // If not in combat, do nothing because it is unclear who is targeting
  const updateCoverTypes = Settings.get(Settings.KEYS.COVER_TYPES.USE) === Settings.KEYS.COVER_TYPES.CHOICES.TARGETING;
  const updateCoverEffects = Settings.get(Settings.KEYS.COVER_EFFECTS.USE) === Settings.KEYS.COVER_EFFECTS.CHOICES.TARGETING;
  if ( !(updateCoverTypes || updateCoverEffects) ) return;

  // If no targets, then disable the former target's icons and effects.
  if ( !targeted ) {
    if ( updateCoverTypes ) CoverType.replaceCoverTypes(target);
    if ( updateCoverEffects ) CoverEffect.replaceLocalEffectsOnActor(target);
    return;
  }

  // If targets, update the cover types and cover effects.
  const attackingTokens = canvas.tokens.controlled;
  if ( updateCoverTypes ) target.updateCoverForAttackingTokens(tokens)


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

PATCHES.BASIC.HOOKS = { destroyToken, updateToken, controlToken };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };
// PATCHES.NO_PF2E.HOOKS = { targetToken };


// ----- NOTE: Methods ----- //

/**
 * Helper to update whether this token has cover from another token.
 * @param {Token} tokenToUpdate   Token whose cover should be calcualted
 * @param {Token} attackingToken  Other token from which this token may have cover
 * @returns {CoverTypes[]} Array of cover types, for convenience.
 */
function updateCoverFromToken(tokenToUpdate, attackingToken) {
  const coverTypes = attackingToken.coverCalculator.coverTypes(tokenToUpdate);
  tokenToUpdate.coverFromMap.set(attackingToken.id, coverTypes);
  return coverTypes;
}

/**
 * New method: Token.prototype.coverFromToken
 * Returns the stored cover type or calculates it, as necessary.
 * @param {Token} attackingToken   Other token from which this token may have cover
 * @returns {COVER_TYPES}
 */
function coverFromToken(attackingToken) {
  const coverFromMap = this.coverFromMap;
  return coverFromMap.get(attackingToken.id) ?? updateCoverFromToken(this, attackingToken);
}

/**
 * New method: Token.prototype.updateCoverTypes
 * Update cover types for this token based on a group of attackers.
 * @param {Token[]|Set<Token>} [attackingTokens=[]]   Other tokens from which this token may have cover
 *                                                    If length/size 0, no cover.
 */
function updateCoverTypes(attackingTokens = []) {
  const coverTypes = this.coverTypes;
  coverTypes.clear();
  CoverType.minimumCoverFromAttackers(this, attackingTokens).forEach(ct => coverTypes.add(ct));
}

/**
 * New method: Token.prototype.updateCoverIcons
 * Set the cover icons representing whether this token currently has cover from tokens.
 */
function refreshCoverIcons() {
  const changed = CoverType.replaceCoverTypes(token, this.coverTypes);

  // Trigger effects update if there was a change.
  if ( changed ) this.renderFlags.set({ redrawEffects: true });
}

PATCHES.BASIC.METHODS = { coverFromToken };

// ----- NOTE: Getters ----- //

/**
 * New getter: Token.prototype.coverTypes
 * Determine what type of cover the token has, if any.
 * @type {Set<COVER_TYPES>}
 */
function coverTypes() {
  this[MODULE_ID] ??= {};
  return this[MODULE_ID][FLAGS.COVER_TYPES] ??= new Set();
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
  coverTypes,
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

/**
 * Determine what tokens should be deemed "attacking."
 * If in combat and it is the user's turn, assume the combatant is the attacker.
 * Otherwise, user's selected tokens are attackers.
 * @param {Token} [target]      If provided, the target is excluded from attackers.
 * @returns {Token[]}
 */
function attackingTokens(target) {
  if ( game.combats.active
    && game.combat.combatant.isOwner
    && tokens.controlled.length < 2
    && target !== game.combat.combatant) return [game.combat.combatant.token];

  if ( target ) return canvas.tokens.controlled.filter(t => t !== target);
  return canvas.tokens.controlled;
}
