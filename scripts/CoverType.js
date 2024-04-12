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
to be applied when a token has a certain cover type. Active effects are saved to the
server database and thus are async and seen by all users. This somewhat limits their usefulness,
although they can be used in attack/damage workflows.
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
    super._configure(coverTypeData);

    // Set reasonable defaults.
    this.config.id ??= `${MODULE_ID}.${game.system.id}.${foundry.utils.randomID()}`;
    this.config.name ??= "New Cover Type";
    this.config.percentThreshold ??= 1;
    this.config.system = game.system.id;
    this.config.includeWalls ??= true;    // Walls almost always provide cover.
    this.config.includeTokens ??= false;  // Tokens less likely to provide cover.

    if ( !(this.config.tint instanceof Color) ) this.config.tint = new Color(this.config.tint ?? 0);
    // priority, icon can be null or undefined.
  }

  // ----- NOTE: Getters, setters, related properties ----- //

  /** @type {string} */
  get id() { return this.config.id ?? super.id; }

  // ----- NOTE: Methods ----- //

  /**
   * Test if this cover type applies to a target token given an attacking token.
   * Use the static coverTypesForToken for more efficient tests for all cover types at once.
   */
  coverTypeApplies(attackingToken, targetToken) {
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
    const calc = attackingToken.coverCalculator;
    calc.target = targetToken;
    return calc.percentCover({ includeWalls, includeTokens });
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
  static #coverTypesModified = false;

  static coverTypesUpdated() { this.#coverTypesModified ||= true;  }

  static #updateCoverTypesOrder() {
    this.#coverTypesOrdered.length = 0;
    this.#coverTypesUnordered.length = 0;
    for ( const coverType of this.coverObjectsMap ) {
      if ( coverType.priority == null ) this.#coverTypesUnordered.push(coverType);
      else this.#coverTypesOrdered.push(coverType);
    }
    this.#coverTypesOrdered.sort((a, b) => b.priority - a.priority);
    this.#coverTypesModified = false;
  }

  // ----- NOTE: Static getter, setters, related properties ----- //

  /** @type {string} */
  static get settingsKey() { return Settings.KEYS.COVER.TYPES; }

  // ----- NOTE: Static methods ----- //

  /**
   * Update the cover types from settings.
   */
  static _updateFromSettings = AbstractCoverObject._updateFromSettings.bind(this);

  /**
   * Save cover types to settings.
   */
  static _saveToSettings = AbstractCoverObject._saveToSettings.bind(this);

  /**
   * Save all cover types to a json file.
   */
  static saveToJSON = AbstractCoverObject.saveToJSON.bind(this);

  /**
   * Import all cover types from a json file.
   * @param {JSON} json   Data to import
   */
  static importFromJSON = AbstractCoverObject.importFromJSON.bind(this);

  /**
   * Create default effects and store in the map. Resets anything already in the map.
   * Typically used on game load.
   */
  static _constructDefaultCoverObjects = AbstractCoverObject._constructDefaultCoverObjects.bind(this);

  static _defaultCoverTypeData() {
    switch ( game.system.id ) {
      case "dnd5e": return dnd5eCoverTypes; break;
      case "pf2e": return pf2eCoverTypesForToken; break;
      case "sfrpg": return sfrpgCoverTypesForToken; break;
      default: return genericCoverTypes;
    }
  }

  /**
   * Determine what cover types apply to a target token given an attacking token.
   * @param {Token} attackingToken
   * @param {Token} targetToken
   * @returns {coverType[]}
   */
  static coverTypesForToken(attackingToken, targetToken) {
    const calc = attackingToken.coverCalculator;
    const coverTypeAppliesTest = coverTypeAppliesTestFn(attackingToken, targetToken);
    calc.target = targetToken;
    const types = [];

    // Test cover types in priority order.
    for ( const type of this.coverTypesOrdered ) {
      if ( coverTypeAppliesTest(type) ) types.push(type);
    }

    // Test cover types without a set priority.
    for ( const type of this.coverTypesUnordered ) {
      // If there is already a type, cannot use a non-overlapping type.
      if ( !type.config.canOverlap && types.length ) continue;
      if ( coverTypeAppliesTest(type) ) types.push(type);
    }
    return types;
  }
}


COVER.TYPES = CoverType.coverObjectsMap;

// ----- NOTE: Helper functions ----- //
/**
 * Helper that tests for percent cover, caching it for the combinations of
 * including walls and tokens.
 * @param {CoverCalculator} calc    Cover calculator to use; must have target set
 * @returns {function}
 *   - @param {CoverType} coverType       Cover type to test
 *   - @returns {boolean} Whether this cover type applies.
 */
function coverTypeAppliesTestFn(attackingToken, targetToken) {
  const coverCategories = Array(4);
  return type => {
    const { includeWalls, includeTokens } = type.config;
    const option = (includeWalls * 2) + includeTokens;
    return coverCategories[option] ??= type.coverTypeApplies(attackingToken, targetToken);
  }
}