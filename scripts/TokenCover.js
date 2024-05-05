/* globals
canvas,
CONFIG,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { MODULE_ID, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Settings } from "./settings.js";
import { log } from "./util.js";

const NULL_SET = new Set(); // Set intended to signify no items, as a placeholder.

// Class to use to handle added methods and getters for token
// Encapsulated inside Token.prototype.tokencover

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

export class TokenCover {
  /** @type {Token} */
  token;

  /** @type {IgnoresCover} */
  ignoresCover;

  /** @type {CoverCalculator} */
  coverCalculator;

  /**
   * Map of token ids and percentage cover
   * @type {Map<string|number>}
   */
  coverFromMap = new Map();

  /**
   * Set of CoverTypes currently assigned to this token.
   * @type {Set<CoverType>}
   */
  coverTypes = new Set();

  /**
   * Set of CoverEffects currently assigned to this token.
   * @type {Set<CoverEffect>}
   */
  coverEffects = new Set();

  constructor(token) {
    this.token = token;
    this.ignoresCover = new IGNORES_COVER_HANDLER(token);
    this.coverCalculator = new CoverCalculator(token);
  }

  // ----- NOTE: Methods ----- //

  /**
   * Returns the stored cover percent or calculates it, as necessary.
   * @param {Token} attackingToken   Other token from which this token may have cover
   * @returns {number}
   */
  coverPercentFromAttacker(attackingToken) {
    const { coverFromMap, token } = this;
    if ( !coverFromMap.has(attackingToken.id) ) this.constructor.updateCoverFromToken(token, attackingToken);
    return coverFromMap.get(attackingToken.id).percentCover;
  }

  /**
   * Returns the stored cover type or calculates it, as necessary.
   * @param {Token} attackingToken   Other token from which this token may have cover
   * @returns {CoverType[]}
   */
  coverTypesFromAttacker(attackingToken) {
    const { coverFromMap, token } = this;
    if ( !coverFromMap.has(attackingToken.id) ) this.constructor.updateCoverFromToken(token, attackingToken);
    return coverFromMap.get(attackingToken.id).coverTypes;
  }

  /**
   * Determine what cover types the token has, if any.
   * @returns {boolean} True if the update resulted in a change to the existing set.
   */
  updateCoverTypes() {
    const token = this.token;
    const attackers = this.constructor.coverAttackers("COVER_TYPES");
    attackers.findSplice(t => t === token);
    const newCoverTypes = CONFIG[MODULE_ID].CoverType.minimumCoverFromAttackers(token, attackers);
    const changed = !this.coverTypes.equals(newCoverTypes);
    this.coverTypes = newCoverTypes;
    return changed;
  }

  /**
   * Determine what type of effects could be applied to the token, if any.
   * @returns {boolean} True if the update resulted in a change to the existing set.
   */
  updateCoverEffects() {
    const token = this.token;

    // Attackers may be different than cover types, depending on settings. (E.g., only targeting)
    const ctAttackers = new Set(this.constructor.coverAttackers("COVER_TYPES"));
    const ceAttackers = new Set(this.constructor.coverAttackers("COVER_EFFECTS"));
    ctAttackers.delete(token);
    ceAttackers.delete(token);
    const coverTypes = ctAttackers.equals(ceAttackers) ? this.coverTypes
      : CONFIG[MODULE_ID].CoverType.minimumCoverFromAttackers(token, [...ceAttackers]);

    // Determine if the cover effects have changed given the current cover types.
    const newCoverEffects = new Set(CONFIG[MODULE_ID].CoverEffect
      .coverObjectsMap.values().filter(ce => coverTypes.intersects(ce.coverTypes)));
    const changed = !this.coverEffects.equals(newCoverEffects);
    this.coverEffects = newCoverEffects;
    return changed;
  }

  /**
   * Set the cover icons representing whether this token currently has cover from tokens.
   * Observes settings that control whether icons should be displayed unless forced.
   * @param {boolean} [force=false]   If true, ignore settings; just display icons corresponding to types
   * @returns {boolean} True if a change occurred
   */
  refreshCoverTypes(force = false) {
    const token = this.token;
    log(`TokenCover#refreshCoverTypes|${token.name}`);
    const coverTypes = (force || this.constructor.useCoverObject("COVER_TYPES", token)) ? this.coverTypes : NULL_SET;

    // Trigger token icons update if there was a change.
    const changed = CONFIG[MODULE_ID].CoverType.replaceCoverTypes(token, coverTypes);
    if ( changed ) token.renderFlags.set({ redrawEffects: true });
    return changed;
  }

  /**
   * Applies cover effects based on existing cover effects set.
   * Observes settings that control whether effects should be applied unless forced.
   * @param {boolean} [force=false]   If true, ignore settings; just display icons corresponding to types
   * @returns {boolean} True if a change occurred
   */
  refreshCoverEffects(force=false) {
    const token = this.token;
    log(`TokenCover#refreshCoverEffects|${token.name}`);
    const coverEffects = (force || this.constructor.useCoverObject("COVER_EFFECTS", token)) ? this.coverEffects : NULL_SET;

    // Trigger local effects update for actor; return changed state.
    return CONFIG[MODULE_ID].CoverEffect.replaceLocalEffectsOnActor(token, coverEffects);
  }


  // ----- NOTE: Static helper functions ----- //

  /**
   * Tokens considered to be currently attacking for purposes of assigning
   * cover types and effects.
   * @param {"COVER_TYPES"|"COVER_EFFECTS"} [objectType]
   * @returns {Token[]}
   */
  static coverAttackers(objectType = "COVER_TYPES") {
    if ( game.combat?.started && game.combat.combatant?.isOwner ) {
      const choice = Settings.get(Settings.KEYS[objectType].USE);
      const choices = Settings.KEYS[objectType].CHOICES;
      if ( choice === choices.COMBATANT ) return [game.combat.combatant];
    }
    return canvas.tokens.controlled;
  }

  /**
   * Helper to determine whether to apply a cover icon or cover effect.
   * @param {"COVER_TYPES"|"COVER_EFFECTS"} objectType
   * @param {Token} token
   * @returns {boolean}
   */
  static useCoverObject(objectType, token) {
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
  static updateCoverFromToken(tokenToUpdate, attackingToken) {
    const percentCover = attackingToken.tokencover.coverCalculator.percentCover(tokenToUpdate);
    const coverTypes = attackingToken.tokencover.coverCalculator.coverTypes(tokenToUpdate);
    log(`updateCoverFromToken|${attackingToken.name} ⚔️ ${tokenToUpdate.name}: ${percentCover}
    \t${attackingToken.name} ${attackingToken.document.x},${attackingToken.document.y} Center ${attackingToken.center.x},${attackingToken.center.y}
    \t${tokenToUpdate.name} ${tokenToUpdate.document.x},${tokenToUpdate.document.y} Center ${tokenToUpdate.center.x},${tokenToUpdate.center.y}`);
    tokenToUpdate.tokencover.coverFromMap.set(attackingToken.id, { coverTypes, percentCover});
  }

  /**
   * Helper to update cover types and effects for all tokens for the current user on the canvas.
   */
  static updateAllTokenCover() {
    canvas.tokens.placeables.forEach(t => {
      log(`updateAllTokenCover|updating cover for ${t.name}.`);
      if ( t.tokencover.updateCoverTypes() ) t.tokencover.refreshCoverTypes();
      if ( t.tokencover.updateCoverEffects() ) t.tokencover.refreshCoverEffects();
    });
  }

  /**
   * Helper to remove cover calculations for a given attacker.
   * The presumption here is that the attacker changed position or some other property meaning
   * that the previous cover calculation is no longer valid.
   * @param {Token} attacker
   */
  static resetTokenCoverFromAttacker(attacker) {
    // Clear all other token's cover calculations for this token.
    const id = attacker.id;
    canvas.tokens.placeables.forEach(t => {
      if ( t === attacker ) return;
      t.tokencover.coverFromMap.delete(id);
    });
  }
}
