/* globals
canvas,
CONFIG,
CONST,
foundry,
game,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { MODULE_ID, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Settings } from "./settings.js";
import { log } from "./util.js";
import { TokenEffects } from "./TokenEffects.js";
import { UniqueEffectDefinition } from "./UniqueEffectDefinition.js";

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

export class TokenCover {
  /** @type {Token} */
  token;

  /** @type {IgnoresCover} */
  ignoresCover;

  /** @type {CoverCalculator} */
  coverCalculator;

  /**
   * Map of cached token ids and percent cover for each.
   * Defines the percent cover between each attacker (the map key) and this token as defender.
   * Does not include region cover.
   * @type {WeakMap<Token|number>}
   */
  coverFromMap = new WeakMap();

  constructor(token) {
    this.token = token;
    this.ignoresCover = new IGNORES_COVER_HANDLER(token);
    this.coverCalculator = new CoverCalculator(token);
  }

  // ----- NOTE: Lifecycle ----- //

  /**
   * Destroy this object, clearing its subobjects from memory.
   */
  destroy() {
    this.iconMap.clear();
    delete this.token.tokencover;
  }

  // ----- NOTE: Updating ----- //

  /**
   * Something about this token position was updated.
   */
  tokenMoved() {
    this.coverFromMap = new WeakMap();
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


  // ----- NOTE: Cover Effects ----- //

  /**
   * Current cover effects applied to the token.
   * Should always be equal to the cover effects on the token.
   * It is an error to have the same cover effect applied twice on the token.
   * Not modifiable b/c it reflects actual effects on the actor.
   * @type {UniqueEffectDefinition[]}
   */
  get _currentCovers() { return TokenEffects.all(this.token, "cover"); }

  /**
   * Single best cover on token.
   * @type {UniqueEffectDefinition}
   */
  get currentCover() {
    return UniqueEffectDefinition.bestCover(this._currentCovers);
  }

  /**
   * Best cover definition for a given percent cover.
   * @param {number} percent
   * @returns {UniqueEffectDefinition}
   */
  static coverAtPercent(percent) { return UniqueEffectDefinition.forCoverPercent(percent); }

  // ----- NOTE: Cover Regions ----- //

  /**
   * Get all cover regions for this token
   */
  get coverRegions() {
    const token = this.token;
    return canvas.regions.placeables.filter(region => region.document.behaviors.some(behavior => behavior.type === `${MODULE_ID}.setCover`)
      && region.testPoint(token.center, token.elevationE));
  }

  // ----- NOTE: Attackers ----- //

  /**
   * Returns the stored cover percent or calculates it, as necessary.
   * @param {Viewer} attacker   Other token or object from which this token may have cover
   * @returns {number}
   */
  percentCoverFromAttacker(attacker) {
    const { coverFromMap, token } = this;
    if ( !coverFromMap.has(attacker) ) this.constructor.updateCoverFromToken(token, attacker);
    return coverFromMap.get(attacker);
  }

  /**
   * Determine minimum percent cover for a token from a group of attacking tokens or other objects.
   * @param {Viewer[]|Set<Viewer>} [attackingTokens]
   * @returns {number}
   */
  minimumPercentCoverFromAttackers(attackers = this.constructor.attackers) {
    if ( !attackers.length && !attackers.size ) return 0;

    let minCover = 1;

    // Group the cover behaviors for regions containing the defending token or possibly the attacking tokens
    let coverBehaviors = [];
    let exclusiveCoverBehaviors = [];
    const defendingRegions = this.coverRegions;
    attackers.forEach(attacker => {
      const res = applicableRegionBehaviors(attacker, this.token, defendingRegions);
      coverBehaviors.push(...res.coverBehaviors);
      exclusiveCoverBehaviors.push(...res.exclusiveCoverBehaviors);
    });


    // If exclusive cover behaviors, these override any non-exclusive behaviors and attacker cover.
    if ( exclusiveCoverBehaviors.length ) minCover = UniqueEffectDefinition.bestCover(exclusiveCoverBehaviors);
    else {
      // The region cover provides the floor.
      const regionCover = UniqueEffectDefinition.bestCover(coverBehaviors);

      // Attacker covers may exceed it, if defender has greater cover from every attacker.
      const attackerCovers = Math.min(...attackers.map(attacker => this.percentCoverFromAttacker(attacker)));

      // Final cover is the best of either the region covers or the lowest attacker cover.
      minCover = Math.max(regionCover, attackerCovers);
    }

    return minCover;
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
    if ( this.constructor.attackers.has(this.token) ) this.clearCover();
    else this.updateCover();
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
   * An attacker position was updated.
   * @param {Viewer} attacker
   */
  static attackerMoved(attacker) {
    if ( attacker instanceof foundry.canvas.placeables.Token ) return this.tokenMoved();
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
    if ( !force
      && (attacker instanceof foundry.canvas.placeables.Token)
      && !attacker.tokencover.isAttacker() ) return false;
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

  // ----- NOTE: Cover icon display ----- //

  /**
   * Update the cover icon display for this token.
   */
  updateCoverIconDisplay() {
    TokenEffects.refreshTokenDisplay(this.token);
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
   * Remove all cover effects from this token.
   * @returns {boolean} True if a change occurred
   */
  clearCover() { return TokenEffects.clear(this.token); }

  /**
   * Add applicable cover effects to this token.
   * @returns {boolean} True if a change occurred
   */
  updateCover() {
    if ( this.canApplyCover() ) {
      const percent = this.minimumPercentCoverFromAttackers();
      const coverEffect = this.constructor.coverAtPercent(percent);
      if ( coverEffect ) return this.replaceCover([coverEffect]);
    }
    return this.clearCover();
  }

  /**
   * Handle adding and removing cover effect.
   * @param {Set<CoverEffect>} replacementCover
   * @returns {boolean} True if a change was made.
   */
  replaceCover(replacementCover) {
    log(`TokenCover#replacecover|Replacing cover for ${this.token.name}. ${replacementCover.name}`);
    return TokenEffects.add(this.token, replacementCover, { exclusive: true });
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


  // ----- NOTE: Static helper functions ----- //

  /**
   * Helper to update whether this token has cover from another token.
   * @param {Token} tokenToUpdate   Token whose cover should be calculated
   * @param {Viewer} attacker       Other token or object from which this token may have cover
   */
  static updateCoverFromToken(tokenToUpdate, attacker) {
    const cc = attacker.tokencover?.coverCalculator ?? new CoverCalculator(attacker);
    const percentCover = cc.percentCover(tokenToUpdate);
    log(`updateCoverFromToken|${attacker.name} ⚔️ ${tokenToUpdate.name}: ${percentCover}}
    \t${attacker.name} ${attacker.document?.x},${attacker.document?.y} Center ${attacker.center?.x},${attacker.center?.y}
    \t${tokenToUpdate.name} ${tokenToUpdate.document.x},${tokenToUpdate.document.y} Center ${tokenToUpdate.center.x},${tokenToUpdate.center.y}`);
    tokenToUpdate.tokencover.coverFromMap.set(attacker, percentCover);
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
    canvas.tokens.placeables.forEach(t => {
      if ( t === attacker ) return;
      t.tokencover.coverFromMap.delete(attacker);
    });
  }
}


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
  if ( attacker instanceof foundry.canvas.placeables.Token ) {
    attackingCenter = attacker.center;
    attackingRegions = attacker[MODULE_ID].coverRegions;
  } else if ( attacker instanceof CONFIG.GeometryLib.threeD.Point3d ) {
    attackingCenter = attacker;
    attackingRegions = coverRegions(attacker, CONFIG.GeometryLib.utils.gridUnitsToPixels(attacker.z));
  } else {
    if ( typeof attacker.document.elevation === "undefined" ) console.warn("applicableRegionBehaviors|elevation is undefined");
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
 * Cover regions for a given point
 * @param {Point3d} pt
 * @returns {Region[]}
 */
function coverRegions(pt, elevation) {
  return canvas.regions.placeables.filter(region => region.document.behaviors.some(behavior => behavior.type === `${MODULE_ID}.setCover`)
      && region.testPoint(pt, elevation));
}
