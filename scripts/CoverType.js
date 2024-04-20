/* globals
*/
"use strict";

import { coverTypes as dnd5eCoverTypes } from "./coverDefaults/dnd5e.js";
import { coverTypes as pf2eCoverTypes } from "./coverDefaults/pf2e.js";
import { coverTypes as sfrpgCoverTypes } from "./coverDefaults/sfrpg.js";
import { coverTypes as genericCoverTypes } from "./coverDefaults/generic.js";
import { Settings } from "./settings.js";
import { MODULE_ID, COVER } from "./const.js";
import { AbstractCoverObject } from "./AbstractCoverObject.js";
import { findSpliceAll, log } from "./util.js";

const NULL_SET = new Set(); // Set intended to signify no items, as a placeholder.

/**
 * @typedef {object} CoverTypeData
 *
 * Object that stores properties for a given cover type.
 * Custom properties are permitted.
 *
 * @prop {string} name                          Name of the category. Will be localized.
 * @prop {string} id                            Id for the category. Must be unique.
 * @prop {number} percentThreshold              A token has cover from an attacker if the attacker cannot
 *                                              see more than this percentage of the token.
 *                                              How visibility is measured is controlled by the Cover Settings.
 * @prop {string} icon                          Icon that represents this category. Displayed on the token.
 * @prop {number|null} tint                     Optional tint applied to the icon
 * @prop {boolean} canOverlap                   If true, this cover can be applied *in addition to* other cover types
 * @prop {ActiveEffect|null} activeEffectData   Data used to create an active effect associated with this cover type
 * @prop {number|null} priority                 When evaluating the percent threshold, higher-priority cover types
 *                                              are evaluated first.
 * @prop {boolean} includeWalls                 Should walls be considered blocking for this category?
 * @prop {boolean} includeTokens                Should tokens be considered blocking for this category?
 */

/* Cover handling

A CoverType represents a defined cover that may apply to tokens. It has an icon that can be
displayed on the token locally. So if a player selects a token, that player only sees a cover
icon for all other tokens that the player can view. (Other tokens on the canvas have the
defined cover but the icon is not viewable.)

A CoverType with priority is evaluated from highest to lowest priority. So if "high cover"
requires that the covered token is ≥ 75% covered from an attacking token, and "medium cover"
requires ≥ 50%, then if "high cover" has higher priority, it will be applied for cover of 60%.
If "medium cover" has priority, then it will be applied for cover of 60%.

If a CoverType has `canOverlap=true`, it can be applied in addition to other cover types. Otherwise,
the highest priority that meets its threshold will be applied. Cover types without priority are
evaluated last, in no particular order.

An active effect ("Cover Effect") can be associated with a CoverType. This allows active effects
to be applied when a token has a certain cover type. Cover Effects are applied locally per-user,
although a Cover Effect in most systems is an ActiveEffect that could be applied to a database.
Applying an active effect via the database is less useful for cover, as it applies to all
tokens equally regardless of user/attacker.
*/


/**
 * Class to manage the cover types.
 * Each instantiation takes CoverTypeData and constructs the cover type.
 * Loading and saving controlled here.
 */
export class CoverType extends AbstractCoverObject {
  /**
   * Configure the object using the default provided data.
   * @param {CoverTypeData} [CoverTypeData]
   */
  _configure(coverTypeData = {}) {
    delete coverTypeData.id;
    foundry.utils.mergeObject(this.config, coverTypeData);

    // Make changes that cannot be handled by defaults.
    if ( !(this.config.tint instanceof Color) ) this.config.tint = new Color(this.config.tint ?? 0);
    // priority, icon can be null or undefined.
  }

  // ----- NOTE: Getters, setters, related properties ----- //

  /** @type {object} */
  #config = {
    name: "New Cover Type",
    percentThreshold: 1,
    includeWalls: true,
    includeTokens: true,
    tint: new Color(0),
    system: game.system.id
  };

  get config() { return this.#config; }

  // ----- NOTE: Methods ----- //

  /**
   * Test if this cover type applies to a target token given an attacking token.
   * Use the static coverTypesForToken for more efficient tests for all cover types at once.
   */
  coverTypeApplies(attackingToken, targetToken, opts = {}) {
    return this.percentCover(attackingToken, targetToken) >= this.config.percentThreshold;
  }

  /**
   * Percent cover given this cover type's settings for a pair of tokens.
   * @param {Token} attackingToken
   * @param {Token} targetToken
   * @returns {number}
   */
  percentCover(attackingToken, targetToken) {
    const { includeWalls, includeTokens } = this.config;
    return attackingToken.coverCalculator.percentCover(targetToken, { includeWalls, includeTokens });
  }


  /**
   * Update the cover type with a new full or partial config object.
   * @param {object} [config={}]
   */
  update(config = {}) {
    super.update(config);

    // Fix tint to always be a Color class.
    const tint = this.config.tint;
    if ( !(tint instanceof Color) ) this.config.tint = typeof tint === "string"
      ? Color.fromString(tint) : new Color(tint);
    this.config.tint = new Color(this.config.tint);

    // Mark that cover types may have been updated.
    this.constructor.coverTypesUpdated();
  }

  /**
   * Add this cover type to the token.
   * Adds unless already present.
   * Removes others unless canOverlap is true
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  addToToken(token) {
    log(`CoverType#addToToken|${token.name}`);
    const icon = this.config.icon;

    // If already present, we are done.
    if ( token.document.effects.some(e => e === icon) ) return false;

    // If this type can overlap, it can be added b/c it is not already present.
    if ( this.config.canOverlap ) {
      log(`CoverType#addToToken|${token.name} adding ${this.config.name}`);
      token.document.effects.push(icon);
      return true;
    }

    // If this type cannot overlap, then any non-overlapping icons must be removed first.
    const tokenEffectIcons = new Set(token.document.effects);
    const otherCoverTypes = CoverType.coverObjectsMap.values().filter(ct => ct.config.icon !== icon && !ct.config.canOverlap);
    for ( const otherCoverType of otherCoverTypes ) {
      if ( tokenEffectIcons.has(otherCoverType.config.icon) ) otherCoverType.removeFromToken(token);
    }

    // Add the new cover type icon to the token.
    log(`CoverType#addToToken|${token.name} adding ${this.config.name}`);
    token.document.effects.push(icon);
    return true;
  }

  /**
   * Remove this cover type from the token.
   * @param {Token} token
   * @returns {boolean} True if change was made
   */
  removeFromToken(token) {
    const change = token.document.effects.some(e => e === this.config.icon);
    if ( change ) {
      log(`CoverType#addToToken|${token.name} removing ${this.config.name}`);
      findSpliceAll(token.document.effects, e => e == this.config.icon);
    }
    return change;
  }

  /**
   * Add cover effects linked to this type to token.
   * @param {Token} token
   */
  addCoverEffectsToToken(token, update = true) {
    CONFIG[MODULE_ID].CoverEffect.coverObjectsMap
      .filter(ce => ce.coverTypes.some(ct => ct === this))
      .forEach(ce => ce.addToActorLocally(token, update));
  }

  // ----- NOTE: Static: Track Cover types ----- //
  /** @type {Map<string,CoverType>} */
  static coverObjectsMap = new Map();

  /** @type {CoverType[]} */
  static #coverTypesOrdered = [];

  static get coverTypesOrdered() {
    if ( this.#coverTypesModified ) this.#updateCoverTypesOrder();
    return this.#coverTypesOrdered;
  }

  /** @type {CoverType[]} */
  static #coverTypesUnordered = [];

  static get coverTypesUnordered() {
    if ( this.#coverTypesModified ) this.#updateCoverTypesOrder();
    return this.#coverTypesUnordered;
  }

  /**
   * Track if cover types are updated and re-order accordingly.
   * @type {boolean}
   */
  static #coverTypesModified = true;

  static coverTypesUpdated() { this.#coverTypesModified ||= true;  }

  static #updateCoverTypesOrder() {
    this.#coverTypesOrdered.length = 0;
    this.#coverTypesUnordered.length = 0;
    for ( const coverType of this.coverObjectsMap.values() ) {
      if ( coverType.config.priority == null ) this.#coverTypesUnordered.push(coverType);
      else this.#coverTypesOrdered.push(coverType);
    }
    this.#coverTypesOrdered.sort((a, b) => b.config.priority - a.config.priority);
    this.#coverTypesModified = false;
  }

  // ----- NOTE: Static getter, setters, related properties ----- //

  /** @type {string} */
  static get settingsKey() { return Settings.KEYS.COVER_TYPES.DATA; }

  // ----- NOTE: Static methods ----- //

  /**
   * Replace cover types on token with these.
   * @param {Token} token
   * @param {CoverType[]|Set<CoverType>} coverTypes
   * @returns {boolean} True if a change was made.
   */
  static replaceCoverTypes(token, coverTypes = []) {
    if ( !(coverTypes instanceof Set) ) coverTypes = new Set(coverTypes);

    if ( !coverTypes.size ) {
      if ( !token.document.effects.length ) return false;
      token.document.effects.length = 0;
      return true;
    }

    // Remove all cover types in the array that are not the wanted cover types.
    const tokenEffectIcons = new Set(token.document.effects);
    const toKeep = coverTypes.map(ct => ct.config.icon);
    const toRemove = tokenEffectIcons.difference(toKeep);
    const changed = toRemove.size
    if ( changed ) findSpliceAll(token.document.effects, e => toRemove.has(e));

    // Add each of the cover types.
    const res = coverTypes.values().reduce((acc, ct) => {
      const out = ct.addToToken(token);
      return acc || out;
    }, false);
    return res || changed;
  }

  /**
   * Determine minimum cover types for a token from a group of attacking tokens.
   * @param {Token} targetToken
   * @param {Token[]} attackingTokens
   * @returns {Set<CoverType>}
   */
  static minimumCoverFromAttackers(targetToken, attackingTokens = []) {
    if ( !attackingTokens.length ) return NULL_SET;

    // For priority cover, smallest priority wins.
    // For other cover, only if this token has that cover from all attackers.
    let minCoverType;
    let otherCoverTypes;
    for ( const attackingToken of attackingTokens ) {
      const coverTypes = targetToken.coverTypesFromAttacker(attackingToken);
      const otherTypes = new Set();
      coverTypes.forEach(ct => {
        if ( ct.priority == null ) otherTypes.add(ct);
        else if ( typeof minCoverType === undefined || minCoverType.priority > ct.priority ) minCoverType = ct;
      })

      if ( !otherCoverTypes ) otherCoverTypes = otherTypes;
      else otherCoverTypes = otherCoverTypes.intersection(otherTypes);
    }

    minCoverType = new Set(minCoverType ? [minCoverType] : []);
    otherCoverTypes ||= Set.NULL_SET;
    return minCoverType.union(otherCoverTypes);
  }

  static _defaultCoverTypeData() {
    switch ( game.system.id ) {
      case "dnd5e": return dnd5eCoverTypes; break;
      case "pf2e": return pf2eCoverTypes; break;
      case "sfrpg": return sfrpgCoverTypes; break;
      default: return genericCoverTypes;
    }
  }

  /**
   * Determine what cover types apply to a target token given an attacking token.
   * @param {Token} attackingToken
   * @param {Token} targetToken
   * @returns {coverType[]}
   */
  static coverTypesForToken(attackingToken, targetToken, opts) {
    const types = [];

    // Test cover types in priority order.
    for ( const type of this.coverTypesOrdered ) {
      const typeApplies = type.coverTypeApplies(attackingToken, targetToken, opts);
      if ( typeApplies ) {
        types.push(type);
        break;
      }
    }

    // Test cover types without a set priority.
    for ( const type of this.coverTypesUnordered ) {
      // If there is already a type, cannot use a non-overlapping type.
      if ( !type.config.canOverlap && types.length ) continue;
      if ( type.coverTypeApplies(attackingToken, targetToken, opts) ) types.push(type);
    }
    return types;
  }
}


COVER.TYPES = CoverType.coverObjectsMap;

// ----- NOTE: Helper functions ----- //
