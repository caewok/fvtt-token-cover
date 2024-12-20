/* globals
canvas,
CONFIG,
CONST,
game,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { MODULE_ID, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Settings } from "./settings.js";
import { log, NULL_SET } from "./util.js";
import { TokenIconMixin } from "./TokenIcon.js";

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
- refreshCoverEffects: Sets effects representing cover effects on this token,
                       given token.coverEffects and current display settings.
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

/**
 * @typedef Viewer    Token|MeasuredTemplate|AmbientLight|AmbientSound|Point3d
 * The object that is viewing / attacking.
 */

/**
 * @typedef {object} TokenIcon
 * Information about a token icon that may be displayed.
 * Each TokenIcon belongs to a category, such as "half cover".
 * @prop {string} id                    Unique id
 * @prop {string} category              A label to group the icon with others that are considered equivalent
 * @prop {string} src                   The file path for the icon to display on the token
 * @prop {Color} [tint]                 Color to use for tint, if any
 */

class TokenCoverBase {
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
    return CONFIG[MODULE_ID].CoverEffect.allOnToken(this.token);
  }

  constructor(token) {
    this.token = token;
    this.ignoresCover = new IGNORES_COVER_HANDLER(token);
    this.coverCalculator = new CoverCalculator(token);
  }

  /**
   * Get all cover regions for this token
   */
  get coverRegions() {
    const token = this.token;
    return canvas.regions.placeables.filter(region => region.document.behaviors.some(behavior => behavior.type === `${MODULE_ID}.setCover`)
      && region.testPoint(token.center, token.elevationE));
  }

  // ----- NOTE: Methods ----- //

  /**
   * Destroy this object, clearing its subobjects from memory.
   */
  destroy() {
    this.coverCalculator.destroy();
    this.iconMap.clear();
    delete this.token.tokencover;
  }

  /**
   * Returns the stored cover percent or calculates it, as necessary.
   * @param {Viewer} attacker   Other token or object from which this token may have cover
   * @returns {number}
   */
  coverPercentFromAttacker(attacker) {
    const { coverFromMap, token } = this;
    if ( !coverFromMap.has(attacker.id ?? attacker) ) {
      this.constructor.updateCoverFromToken(token, attacker);
    }
    return coverFromMap.get(attacker.id ?? attacker).percentCover;
  }

  /**
   * Returns the stored cover type or calculates it, as necessary.
   * @param {Viewer} attacker   Other token or object from which this token may have cover
   * @returns {CoverEffect[]}
   */
  coverFromAttacker(attacker) {
    const { coverFromMap, token } = this;
    if ( !coverFromMap.has(attacker.id ?? attacker) ) this.constructor.updateCoverFromToken(token, attacker);
    return coverFromMap.get(attacker.id ?? attacker).cover;
  }

  /**
   * Calculates the cover types for multiple attackers. Least cover wins.
   * @param {Token[]} attackers
   * @returns {Set<CoverEffect>}
   */
  coverFromAttackers(attackers) { return this.minimumCoverFromAttackers(attackers); }

  /**
   * Determine minimum cover types for a token from a group of attacking tokens or other objects.
   * @param {Viewer[]|Set<Viewer>} [attackingTokens]
   * @returns {Set<CoverEffect>}
   */
  minimumCoverFromAttackers(attackers = this.constructor.attackers) {
    if ( !attackers.length && !attackers.size ) return NULL_SET;

    // Track priority and overlapping covers for regions and attackers separately.
    let maxRegionPriorityCover;
    let minAttackerPriorityCover;
    let overlappingRegionCover = new Set();
    let overlappingAttackerCover = new Set();

    // Group the cover behaviors for regions containing the defending token or possibly the attacking tokens
    let coverBehaviors = [];
    let exclusiveCoverBehaviors = [];
    const defendingRegions = this.coverRegions;
    attackers.forEach(attacker => {
      const res = applicableRegionBehaviors(attacker, this.token, defendingRegions);
      coverBehaviors.push(...res.coverBehaviors);
      exclusiveCoverBehaviors.push(...res.exclusiveCoverBehaviors);
    });

    // TODO: Attacking behaviors should only apply cover to defending tokens if all attackers
    //       have that cover.

    // If exclusive cover behaviors, these override any non-exclusive behaviors and attacker cover.
    if ( exclusiveCoverBehaviors.length ) {
      // If a cover region is exclusive, set to that cover.
      // If 2+ exclusive, take highest priority.
      // If overlap, allow multiple.
      let maxScore = Number.NEGATIVE_INFINITY;
      const { maxRegionCover, otherRegionCover } = maximumRegionCover(exclusiveCoverBehaviors, maxScore);
      overlappingRegionCover = overlappingRegionCover.union(otherRegionCover);
      if ( maxRegionCover && (maxScore < maxRegionCover.priority) ) maxRegionPriorityCover = maxRegionCover;

    } else {
      // For priority cover, smallest priority wins.
      // For other cover, only if this token has that cover from all attackers.
      let maxScore = Number.NEGATIVE_INFINITY;
      let minScore = Number.POSITIVE_INFINITY;
      for ( const attacker of attackers ) {
        // Region cover.
        const { maxRegionCover, otherRegionCover } = maximumRegionCover(coverBehaviors, maxScore);
        overlappingRegionCover = overlappingRegionCover.intersection(otherRegionCover);
        if ( maxRegionCover && (maxScore < maxRegionCover.priority) ) {
          maxRegionPriorityCover = maxRegionCover;
          maxScore = maxRegionCover.priority;
        }

        // Cover from attackers.
        const coverEffects = this.coverFromAttacker(attacker);
        const { minAttackerCover, otherAttackerCover } = minimumAttackerCover(coverEffects, minScore);
        overlappingAttackerCover = overlappingAttackerCover.intersection(otherAttackerCover);
        if ( minAttackerCover && (minScore > minAttackerCover.priority) ) {
          minAttackerPriorityCover = minAttackerCover;
          maxScore = minAttackerCover.priority;
        }
      }
    }

    // If region cover is higher, use it.
    let priorityCover = maxRegionPriorityCover || minAttackerPriorityCover;
    if ( maxRegionPriorityCover && minAttackerPriorityCover ) {
      if ( maxRegionPriorityCover.priority >= minAttackerPriorityCover.priority ) {
        priorityCover = maxRegionPriorityCover;
      } else priorityCover = minAttackerPriorityCover;
    }

    // Combine all non-priority cover
    const overlappingCover = overlappingRegionCover.union(overlappingAttackerCover);

    // Return the combined set.
    if ( priorityCover ) overlappingCover.add(priorityCover);
    return overlappingCover;
  }

  /**
   * Update the cover icon display for this token.
   */
  updateCoverIconDisplay() {
    const coverEffects = CONFIG[MODULE_ID].CoverEffect.allOnToken(this.token);
    if ( !coverEffects.size ) return;
    const displayIcon = this.canDisplayCoverIcon;
    coverEffects.forEach(ce => {
      if ( displayIcon ) {
        if ( !ce.document.statuses.includes(ce.img) ) ce.document.statuses.push(ce.img);
      } else ce.document.statuses.findSplice(s => s === ce.img);
    });
  }

  /**
   * Should cover effect icons be displayed?
   * Does not account for whether cover can be applied.
   * @returns {boolean}
   */
  canDisplayCoverIcon() {
    if ( !this.token.isVisible ) return false;
    if ( !Settings.get(Settings.KEYS.DISPLAY_SECRET_COVER)
        && this.token.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET ) return false;
    return true;
  }

  /**
   * Can any cover effect be applied to this token?
   * For speed, a cover effect is not applied if the token is not visible and not targeted.
   * (Otherwise, all tokens on a map would need cover calculation every time an attacker updates.)
   * @returns {boolean}
   */
  canApplyCover() {
    const token = this.token;
    const { KEYS, ENUMS } = Settings;
    if ( !token.isTargeted ) {
      if ( !token.isVisible ) return false;
      if ( Settings.get(KEYS.COVER_EFFECTS.TARGETING) ) return false;
    }
    if ( this.isAttacker() ) return false;
    const CHOICES = ENUMS.USE_CHOICES;
    switch ( Settings.get(KEYS.COVER_EFFECTS.USE) ) {
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
    const CHOICES = Settings.ENUMS.USE_CHOICES;
    const token = this.token;
    switch ( Settings.get(Settings.KEYS.COVER_EFFECTS.USE) ) {
      case CHOICES.NEVER: return false;
      case CHOICES.COMBATANT: {
        return game.combat?.started
          && token.combatant
          && game.combat.combatants.has(token.combatant.id)
          && token.combatant.id === game.combat.current.combatantId;
      }
      case CHOICES.COMBAT: if ( !game.combat?.started ) return false;
      case CHOICES.ATTACK:
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
      const coverEffects = this.minimumCoverFromAttackers();
      changed = this._replaceCover(coverEffects);
    } else changed = this.#clearCover();
    return changed;
  }

  /**
   * Handles clearing all cover effects.
   * @returns {boolean} True if a change was made.
   */
  #clearCover() {
    log(`TokenCover##clearCover|Clearing cover for ${this.token.name}`);
    const coverEffects = this._currentCoverEffects;
    if ( !coverEffects.length ) return false;
    const token = this.token;
    return CONFIG[MODULE_ID].CoverEffect.removeFromTokenLocally(token, coverEffects);
  }

  /**
   * Handle adding and removing cover effects based on the current set.
   * Assumes that replacementCover only includes valid choices. (i.e., follows overlap rules).
   * @param {Set<CoverEffect>} replacementCover
   * @returns {boolean} True if a change was made.
   */
  _replaceCover(replacementCover = NULL_SET) {
    log(`TokenCover#_replacecover|Replacing cover for ${this.token.name}. ${[...replacementCover.values()].map(ce => ce.name).join(", ")}`);
    const coverEffects = new Set(this._currentCoverEffects);
    const toAdd = replacementCover.difference(coverEffects);
    const toRemove = coverEffects.difference(replacementCover);
    let change = false;
    const token = this.token;
    if ( toRemove.size ) {
      log(`TokenCover#_replacecover|Removing cover for ${this.token.name}. ${[...toRemove.values()].map(ce => ce.name).join(", ")}`);
      const res = CONFIG[MODULE_ID].CoverEffect.removeFromTokenLocally(token, toRemove, { refresh: false });
      change ||= res;
    }
    if ( toAdd.size ) {
      log(`TokenCover#_replacecover|Adding cover for ${this.token.name}. ${[...toAdd.values()].map(ce => ce.name).join(", ")}`);
      const res = CONFIG[MODULE_ID].CoverEffect.addToTokenLocally(token, toAdd, { refresh: false });
      change ||= res;
    }
    log(`TokenCover#_replacecover|Refreshing display for ${this.token.name}.`);
    if ( change ) CONFIG[MODULE_ID].CoverEffect.refreshTokenDisplay(token);
    return change;
  }


  // ----- NOTE: Static getters/setters/properties ----- //

  /**
   * Track attackers for this user.
   * @type {Set<Viewer>}
   */
  static attackers = new Set();


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
   * An attacker position was updated.
   * @param {Viewer} attacker
   */
  static attackerMoved(attacker) {
    if ( attacker instanceof Token ) return this.tokenMoved();
    if ( !this.attackers.has(attacker) ) return;

    // Clear cover calculations from tokens.
    const id = attacker.id ?? attacker;
    canvas.tokens.placeables.forEach(t => t.tokencover.coverFromMap.delete(id));

    // Tell all other tokens that their cover status may have changed.
    canvas.tokens.placeables.forEach(t => t.tokencover.attackerMoved());
  }

  /**
   * Add an attacker to the user's set.
   * @param {Viewer} token
   * @param {boolean} [force=false]   Should the attacker be added even if it fails "isAttacker"?
   * @param {boolean} [update=true]   Should the token display be updated? Can set to false if triggering later.
   * @return {boolean} True if results in addition.
   */
  static addAttacker(attacker, force = false, update = true) {
    if ( this.attackers.has(attacker) ) return false;
    if ( !force && (attacker instanceof Token) && !attacker.tokencover.isAttacker() ) return false;
    this.attackers.add(attacker);
    log(`TokenCover#addAttacker|Adding attacker ${attacker.name}.`);

    // Update each token's display.
    if ( update ) canvas.tokens.placeables.forEach(t => t.tokencover.attackersChanged());
  }

  /**
   * Remove an attacker from the user's set.
   * @param {Viewer} attacker
   * @param {boolean} [update=true]   Should the token display be updated? Can set to false if triggering later.
   * @return {boolean} True if results in removal.
   */
  static removeAttacker(attacker, update = true) {
    if ( !this.attackers.has(attacker) ) return false;
    this.attackers.delete(attacker);
    log(`TokenCover#removeAttacker|Removing attacker ${attacker.name}.`);

    // Update each token's display.
    if ( update ) canvas.tokens.placeables.forEach(t => t.tokencover.attackersChanged());
  }

  /**
   * Clear all attackers from the user's set.
   * @param {boolean} [update=true]   Should the token display be updated? Can set to false if triggering later.
   * @return {boolean} True if results in change.
   */
  static clearAttackers(update = true) {
    if ( !this.attackers.size ) return false;
    log(`TokenCover#clearAttackers|Removing ${this.attackers.size} attacker(s).`);
    this.attackers.clear();
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
   * @param {Viewer} attacker       Other token or object from which this token may have cover
   */
  static updateCoverFromToken(tokenToUpdate, attacker) {
    const cc = attacker.tokencover?.coverCalculator ?? new CoverCalculator(attacker);
    cc.calc.config.wallsBlock = true; // Some cover effects will measure percent cover without walls.
    const percentCover = cc.percentCover(tokenToUpdate);
    const cover = cc.coverEffects(tokenToUpdate);
    log(`updateCoverFromToken|${attacker.name} ⚔️ ${tokenToUpdate.name}: ${percentCover} ${[...cover].map(c => c.name).join(", ")}
    \t${attacker.name} ${attacker.document?.x},${attacker.document?.y} Center ${attacker.center?.x},${attacker.center?.y}
    \t${tokenToUpdate.name} ${tokenToUpdate.document.x},${tokenToUpdate.document.y} Center ${tokenToUpdate.center.x},${tokenToUpdate.center.y}`);
    tokenToUpdate.tokencover.coverFromMap.set(attacker.id ?? attacker, { cover, percentCover});
  }


  /**
   * Helper to force update cover types and effects for all tokens for the current user on the canvas.
   * Used when changing settings related to cover types or effects.
   */
  static _forceUpdateAllTokenCover() {
    this.updateAttackers();
    canvas.tokens.placeables.forEach(t => {
      log(`updateAllTokenCover|updating cover for ${t.name}.`);
      t.tokencover.updateCover();
    });
  }

  /**
   * Reset all cover maps.
   */
  static _resetAllCover() {
    canvas.tokens.placeables.forEach(t => t.tokencover.coverFromMap.clear());
  }

  /**
   * Helper to remove cover calculations for a given attacker.
   * The presumption here is that the attacker changed position or some other property meaning
   * that the previous cover calculation is no longer valid.
   * @param {Viewer} attacker
   */
  static resetTokenCoverFromAttacker(attacker) {
    // Clear all other token's cover calculations for this token.
    const id = attacker.id ?? attacker;
    canvas.tokens.placeables.forEach(t => {
      if ( t === attacker ) return;
      t.tokencover.coverFromMap.delete(id);
    });
  }
}

export class TokenCover extends TokenIconMixin(TokenCoverBase) {}

// ----- NOTE: Helper functions ----- //

/**
 * Locate all applicable region cover behaviors for a group of attacking tokens and defending token.
 * Regions with a distance limitation may be excluded, based on distance between attacker and defender.
 * @param {Viewer} attacker                   Token or other object attacking defender
 * @param {Token} defendingToken              Token to which cover may apply
 * @param {Region[]} [defendingRegions]       Optional array of regions containing the defender
 * @returns {object}
 * - @prop {RegionBehavior[]} coverBehaviors            Applicable cover region behaviors
 * - @prop {RegionBehavior[]} exclusiveCoverBehaviors   Applicable exclusive cover region behaviors
 */
function applicableRegionBehaviors(attacker, defendingToken, defendingRegions) {
  defendingRegions ??= defendingToken[MODULE_ID].coverRegions;
  let attackingCenter;
  let attackingRegions;
  if ( attacker instanceof Token ) {
    attackingCenter = attacker.center;
    attackingRegions = attacker[MODULE_ID].coverRegions;
  } else if ( attacker instanceof CONFIG.GeometryLib.threeD.Point3d ) {
    attackingCenter = attacker;
    attackingRegions = coverRegions(attacker, CONFIG.GeometryLib.utils.gridUnitsToPixels(attacker.z));
  } else {
    if ( typeof attacker.document.elevation === "undefined" ) console.warn(`applicableRegionBehaviors|elevation is undefined`);
    attackingCenter = attacker.document;
    attackingRegions = coverRegions(attacker.document, attacker.document?.elevation || 0 );
  }

  // Accumulate all the potential behaviors.
  const behaviors = [];
  for ( const defendingRegion of defendingRegions ) behaviors.push(...defendingRegion.document.behaviors);
  for ( const attackingRegion of attackingRegions ) {
    for ( const behavior of attackingRegion.document.behaviors ) {
      if ( !behavior.system.appliesToAttackers ) continue;
      behaviors.push(behavior);
    }
  }

  // Filter based on the set cover behavior settings.
  const coverBehaviors = [];
  const exclusiveCoverBehaviors = [];
  const defenderCenter = defendingToken.center;
  let dist;
  for ( const behavior of behaviors ) {
    if ( behavior.type !== `${MODULE_ID}.setCover` ) continue;
    if ( behavior.system.distance ) {
      // Cache the distance measurement
      dist ??= canvas.grid.measurePath([defenderCenter, attackingCenter]).distance;
      if ( dist < behavior.system.distance ) continue;
    }
    if ( behavior.system.exclusive ) exclusiveCoverBehaviors.push(behavior);
    else coverBehaviors.push(behavior);
  }
  return { coverBehaviors, exclusiveCoverBehaviors };
}

/**
 * Determine minimum cover for a given defender from an attacker.
 * @param {Token} attackingToken              Token attacking defender
 * @param {Token} defendingToken              Token to which cover may apply
 * @param {CoverEffect[]} [coverEffects=[]]                       Covers from this attacker
 * @param {number} [minCoverPriority=Number.POSITIVE_INFINITY]    Min cover priority seen thus far
 * @returns {object}
 * - @prop {CoverEffect} minAttackerCover           Minimum cover applied to the defender from the attacker
 * - @prop {Set<CoverEffect>} otherAttackerCover    Other non-priority covers applied to the defender by the attacker
 */
function minimumAttackerCover(coverEffects = [], minCoverPriority = Number.POSITIVE_INFINITY) {
  let minAttackerCover;
  let otherAttackerCover = new Set();
  for ( const coverEffect of coverEffects ) {
    if ( coverEffect.canOverlap ) otherAttackerCover.add(coverEffect);
    else if ( minCoverPriority > coverEffect.priority ) {
      minCoverPriority = coverEffect.priority;
      minAttackerCover = coverEffect;
    }
  }
  return { minAttackerCover, otherAttackerCover };
}

/**
 * Determine maximum region cover from an array of applicable cover behaviors.
 * @param {RegionBehavior[]} [coverBehaviors=[]]                  Behaviors that apply to the defending token
 * @param {number} [maxCoverPriority=Number.NEGATIVE_INFINITY]    Max cover priority seen thus far
 * @returns {object}
 * - @prop {CoverEffect} maxRegionCover         Maximum cover applied to the defender by the region(s)
 * - @prop {Set<CoverEffect>} otherRegionCover  Other non-priority covers applied to the defender by the region(s)
 */
function maximumRegionCover(coverBehaviors = [], maxCoverPriority = Number.NEGATIVE_INFINITY) {
  let maxRegionCover;
  const otherRegionCover = new Set();
  for ( const coverBehavior of coverBehaviors ) {
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(coverBehavior.system.cover);
    if ( !cover ) continue;
    if ( cover.canOverlap ) otherRegionCover.add(cover);
    else if ( maxCoverPriority < cover.priority ) {
      maxCoverPriority = cover.priority;
      maxRegionCover = cover;
    }
  }
  return { maxRegionCover, otherRegionCover };
}

/**
 * Cover regions for a given point
 * @param {Point3d} pt
 * @returns {Region[]}
 */
function coverRegions(pt, elevation) {
  return canvas.regions.placeables.filter(region => region.document.behaviors.some(behavior => behavior.type === `${MODULE_ID}.setCover`)
      && region.testPoint(pt, elevation));
}
