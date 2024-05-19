/* globals
canvas,
CONFIG,
CONST,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { MODULE_ID, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Settings } from "./settings.js";
import { log } from "./util.js";

const NULL_SET = new Set();


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


CoverEffect icon display:
- Only if visible.
- Only if 1+ attackers
- Only if token is not attacker.
- Only if use setting met. combat/target/combatant

CoverEffect application:
- During attack workflow. Otherwise...
- Only if 1+ attackers
- Only if token is not attacker.
- Only if use setting met. combat/target/combatant

Triggers:
- Cover calc. setting changed. Wipe all cover calculations. Refresh all tokens.
- Attacker changed
- Token selected/unselected. Potentially refresh display
- Token targeted/untargeted
- Token moves/updates.
- Attacker moves/updates.


Use Settings triggers:
- Token controlled/uncontrolled. Potentially add/remove attackers.
- Token targeted/untargeted. Possibly update cover type and effect application
- Combat started/ended
- Combatant changed
- Attack workflow



Token getters:
- coverCalculator: Instantiation of CoverCalculator where this token is the attacker.
- coverEffects: Set of CoverEffects currently assigned to this token.
- coverFromMap: Percentage and cover for this token relative to every other token (attackers)
- ignoresCover: Instantiation fo IgnoresCover class to determine if this token ignores cover for attacks

Token methods:
- coverPercentFromAttacker: Calculated/cached percent cover for this token from an attacker. Uses coverFromMap
- coverTypeFromAttacker: Calculated/cached cover type for this token from an attacker. Uses coverFromMap
- updateCover: Updates the cover effects for this token given updated attackers
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
   * Map of token ids. Object is:
   *  - @prop {number} percentCover
   *  - @prop {Set<CoverEffect>} cover
   * @type {Map<string|object>}
   */
  coverFromMap = new Map();

  /**
   * Current cover effects applied to the token.
   * Should always be equal to the cover effects on the token.
   * It is an error to have the same cover effect applied twice on the token.
   * Not modifiable b/c it reflects actual effects on the actor.
   * @type {Set<CoverEffect>}
   */
  get _currentCoverEffects() {
    return CONFIG[MODULE_ID].CoverEffect.allCoverOnToken(this.token);
  }

  constructor(token) {
    this.token = token;
    this.ignoresCover = new IGNORES_COVER_HANDLER(token);
    this.coverCalculator = new CoverCalculator(token);
  }

  // ----- NOTE: Methods ----- //

  /**
   * Destroy this object, clearing its subobjects from memory.
   */
  destroy() {
    this.coverCalculator.destroy();
    delete this.token.tokencover;
  }

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
   * @returns {CoverEffect[]}
   */
  coverFromAttacker(attackingToken) {
    const { coverFromMap, token } = this;
    if ( !coverFromMap.has(attackingToken.id) ) this.constructor.updateCoverFromToken(token, attackingToken);
    return coverFromMap.get(attackingToken.id).cover;
  }

  /**
   * Calculates the cover types for multiple attackers. Least cover wins.
   * @param {Token[]} attackingTokens
   * @returns {Set<CoverEffect>}
   */
  coverFromAttackers(attackingTokens) { return this.minimumCoverFromAttackers(attackingTokens); }

  /**
   * Determine minimum cover types for a token from a group of attacking tokens.
   * @param {Token[]|Set<Token>} [attackingTokens]
   * @returns {Set<CoverEffect>}
   */
  minimumCoverFromAttackers(attackingTokens = this.constructor.attackers) {
    if ( !attackingTokens.length && !attackingTokens.size ) return NULL_SET;

    // For priority cover, smallest priority wins.
    // For other cover, only if this token has that cover from all attackers.
    let minCoverPriority = Number.POSITIVE_INFINITY;
    let minCover;
    let otherCover;
    for ( const attackingToken of attackingTokens ) {
      const coverEffects = this.coverFromAttacker(attackingToken);
      const potentialOther = new Set();
      coverEffects.forEach(c => {
        if ( c.canOverlap ) potentialOther.add(c);
        else if ( minCoverPriority > c.priority ) {
          minCover = c;
          minCoverPriority = c.priority;
        }
      });
      if ( !otherCover ) otherCover = potentialOther;
      else otherCover = otherCover.intersection(potentialOther);
    }

    otherCover ||= Set.NULL_SET;
    if ( minCover ) otherCover.add(minCover);
    return otherCover;
  }


  /**
   * Should cover effect icons be displayed?
   * If cover effects cannot be applied, their icons cannot be displayed.
   * @returns {boolean}
   */
  canDisplayCoverIcon() {
    if ( !this.token.isVisible ) return false;
    if ( !Settings.get(Settings.KEYS.DISPLAY_SECRET_COVER)
        && this.token.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET ) return false;
    return this.canApplyCover();
  }

  /**
   * Can any cover effect be applied to this token?
   * For speed, a cover effect is not applied if the token is not visible and not targeted.
   * (Otherwise, all tokens on a map would need cover calculation every time an attacker updates.)
   * @returns {boolean}
   */
  canApplyCover() {
    const token = this.token;
    const COVER_EFFECTS = Settings.KEYS.COVER_EFFECTS;
    if ( !token.isTargeted ) {
      if ( !token.isVisible ) return false;
      if ( Settings.get(COVER_EFFECTS.TARGETING) ) return false;
    }
    if ( this.isAttacker() ) return false;
    const CHOICES = COVER_EFFECTS.CHOICES;
    switch ( Settings.get(COVER_EFFECTS.USE) ) {
      case CHOICES.NEVER: return false;
      case CHOICES.ATTACK: return false; // Handled by forcing application in the workflow.
      case CHOICES.ALWAYS: return true;
      case CHOICES.COMBAT: return Boolean(game.combat?.started);
      case CHOICES.COMBATANT: return game.combat?.started
        && token.combatant
        && game.combat.combatants.has(token.combatant.id);
      default: return false;
    }
  }

  /**
   * Is this token an attacker for purposes of applying effects? Checks settings.
   * @return {boolean}
   */
  isAttacker() {
    const { USE, CHOICES } = Settings.KEYS.COVER_EFFECTS;
    const token = this.token;
    switch ( Settings.get(USE) ) {
      case CHOICES.NEVER: return false;
      case CHOICES.COMBATANT: {
        return game.combat?.started
          && token.combatant
          && game.combat.combatants.has(token.combatant.id)
      }
      case CHOICES.COMBAT: if ( !game.combat?.started ) return false;
      case CHOICES.ATTACK:  // eslint-disable-line no-fallthrough
      case CHOICES.ALWAYS: return token.controlled;
    }
  }

  /**
   * Attacker set changed.
   */
  attackersChanged() {
    if ( this.constructor.attackers.has(this.token) ) {
      this.clearCover();
      return;
    }
    this.updateCover();
  }

  /**
   * Something about an attacker position was updated.
   */
  attackerMoved() {
    if ( this.constructor.attackers.has(this.token) ) return;
    log(`TokenCover#attackerMoved|defender: ${this.token.name}`);
    this.updateCover();
  }

  /**
   * Something about this token position was updated.
   */
  tokenMoved() {
    this.coverFromMap.clear();
    this.updateCover();
  }

  /**
   * This token's target status changed.
   */
  targetStatusChanged() {
    if ( Settings.get(Settings.KEYS.COVER_EFFECTS.TARGETING) ) {
      if ( this.canApplyCover() ) this.updateCover();
      else this.clearCover();
    }
  }

  /**
   * Remove all cover effects from this token.
   * @returns {boolean} True if a change occurred
   */
  clearCover() {
    // Trigger local effects update for actor; return changed state.
    const changed = this.#clearCover();
    if ( changed ) log(`TokenCover#clearCover|${this.token.name}|clearing cover effects`);
    return changed;
  }

  /**
   * Add applicable cover effects to this token.
   * @returns {boolean} True if a change occurred
   */
  updateCover() {
    let changed = false;
    if ( this.canApplyCover() && !CONFIG[MODULE_ID].CoverEffect.coverOverrideApplied(this.token) ) {
      log(`TokenCover#updateCover|${[...this.constructor.attackers.values().map(a => a.name + ": " + a.x + "," + a.y)].join("\t")}`);
      const coverEffects = this.minimumCoverFromAttackers();
      changed = this._replaceCover(coverEffects);
    } else changed = this.#clearCover();

    if ( changed ) log(`TokenCover#updateCover|${this.token.name}|changing cover effects to: ${[...this._currentCoverEffects.values().map(ct => ct.name)].join(", ")}`);
    return changed;
  }

  /**
   * Handles clearing all cover effects.
   * @returns {boolean} True if a change was made.
   */
  #clearCover() {
    const coverEffects = this._currentCoverEffects;
    if ( !coverEffects.size ) return false;
    let change = false;
    const token = this.token;
    coverEffects.forEach(ce => {
      const res = ce.removeFromToken(token, false);
      change ||= res;
    });
    if ( change ) CONFIG[MODULE_ID].CoverEffect.refreshCoverDisplay(token);
    return change;
  }

  /**
   * Handle adding and removing cover effects based on the current set.
   * Assumes that replacementCover only includes valid choices. (i.e., follows overlap rules).
   * @param {Set<CoverEffect>} replacementCover
   * @returns {boolean} True if a change was made.
   */
  _replaceCover(replacementCover = NULL_SET) {
    const coverEffects = this._currentCoverEffects;
    const toAdd = replacementCover.difference(coverEffects);
    const toRemove = coverEffects.difference(replacementCover);
    let change = false;

    const token = this.token;
    toRemove.forEach(ce => {
      const res = ce.removeFromToken(token, false);
      change ||= res;
    });
    toAdd.forEach(ce => {
      const res = ce.addToToken(token, false);
      change ||= res;
    });
    if ( change ) CONFIG[MODULE_ID].CoverEffect.refreshCoverDisplay(token);
    return change;
  }


  // ----- NOTE: Static getters/setters/properties ----- //

  /**
   * Track attackers for this user.
   * @type {Set<Token>}
   */
  static attackers = new Set()

  // ----- NOTE: Static methods ----- //

  /**
   * A token position was updated.
   * @param {Token} token
   */
  static tokenMoved(token) {
    // Clear cover calculations from other tokens.
    const id = token.id;
    canvas.tokens.placeables.forEach(t => t.tokencover.coverFromMap.delete(id));

    // Update this token's cover data.
    token.tokencover.tokenMoved();

    // If this token is an attacker, tell all other tokens that their cover status may have changed.
    if ( this.attackers.has(token) ) canvas.tokens.placeables.forEach(t => t.tokencover.attackerMoved());
  }

  /**
   * Add an attacker to the user's set.
   * @param {Token} token
   * @param {boolean} [force=false]                   Should the attacker be added even if it fails "isAttacker"?
   * @return {boolean} True if results in addition.
   */
  static addAttacker(token, force = false, update = true) {
    if ( this.attackers.has(token) ) return false;
    if ( !force && !token.tokencover.isAttacker() ) return false;
    this.attackers.add(token);
    log(`TokenCover#addAttacker|Adding attacker ${token.name}.`)

    // Update each token's display.
    if ( update ) canvas.tokens.placeables.forEach(t => t.tokencover.attackersChanged());
  }

  /**
   * Remove an attacker from the user's set.
   * @param {Token} token
   * @param {boolean} [force=false]                   Should the attacker be added even if it fails "isAttacker"?
   * @return {boolean} True if results in addition.
   */
  static removeAttacker(token, update = true) {
    if ( !this.attackers.has(token) ) return false;
    this.attackers.delete(token);
    log(`TokenCover#removeAttacker|Removing attacker ${token.name}.`)

    // Update each token's display.
    if ( update ) canvas.tokens.placeables.forEach(t => t.tokencover.attackersChanged());
  }

  /**
   * Determine the current attackers and update the attacker set accordingly.
   * @return {boolean} True if results in change.
   */
  static updateAttackers() {
    const newAttackers = new Set(canvas.tokens.placeables.filter(t => t.tokencover.isAttacker()));
    let change = false;
    for ( const oldAttacker in this.attackers ) {
      if ( newAttackers.has(oldAttacker) ) continue;
      const res = this.removeAttacker(oldAttacker, false);
      change ||= res;
    }
    for ( const newAttacker in newAttackers ) {
      const res = this.addAttacker(newAttacker, false, false);
      change ||= res;
    }
    if ( change ) canvas.tokens.placeables.forEach(t => t.tokencover.attackersChanged());
    return change;
  }

  // ----- NOTE: Static helper functions ----- //


  /**
   * Helper to update whether this token has cover from another token.
   * @param {Token} tokenToUpdate   Token whose cover should be calculated
   * @param {Token} attackingToken  Other token from which this token may have cover
   */
  static updateCoverFromToken(tokenToUpdate, attackingToken) {
    const percentCover = attackingToken.tokencover.coverCalculator.percentCover(tokenToUpdate);
    const cover = attackingToken.tokencover.coverCalculator.coverEffects(tokenToUpdate);
    log(`updateCoverFromToken|${attackingToken.name} ⚔️ ${tokenToUpdate.name}: ${percentCover}
    \t${attackingToken.name} ${attackingToken.document.x},${attackingToken.document.y} Center ${attackingToken.center.x},${attackingToken.center.y}
    \t${tokenToUpdate.name} ${tokenToUpdate.document.x},${tokenToUpdate.document.y} Center ${tokenToUpdate.center.x},${tokenToUpdate.center.y}`);
    tokenToUpdate.tokencover.coverFromMap.set(attackingToken.id, { cover, percentCover});
  }


  /**
   * Helper to force update cover types and effects for all tokens for the current user on the canvas.
   * Used when changing settings related to cover types or effects.
   */
  static _forceUpdateAllTokenCover() {
    this.updateAttackers();
    canvas.tokens.placeables.forEach(t => {
      log(`updateAllTokenCover|updating cover for ${t.name}.`);
      t.tokencover.updateCover()
    });
  }

  /**
   * Reset all cover maps.
   */
  static _resetAllCover() {
    canvas.tokens.placeables.forEach(t =>  t.tokencover.coverFromMap.clear());
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
