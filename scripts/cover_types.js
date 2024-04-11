/* globals
*/
"use strict";

import { coverTypes as dnd5eCoverTypes } from "./coverDefaults/dnd5e.js";
import { coverTypes as pf2eCoverTypes } from "./coverDefaults/pf2e.js";
import { coverTypes as sfrpgCoverTypes } from "./coverDefaults/sfrpg.js";
import { coverTypes as genericCoverTypes } from "./coverDefaults/generic.js";
import { Settings } from "./settings.js";

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

Default CoverTypes are defined for given systems but can be modified by the GM by changing
variables in `CONFIG.tokencover`.

Cover types are stored in an array in `CONFIG.tokencover.COVER.TYPES.` By default, these are tested
in order from left to right in the array. If a token's percent cover is less than or equal to the percentThreshold
for that cover type, it is considered to have that cover type. This can be modified by changing
`COVER.typeFromPercentFn`.

There are also two preset values:
`CONFIG.tokencover.COVER.NONE = 0`          No cover applies.
`CONFIG.tokencover.COVER.EXCLUDE = -1`      The token cannot be attacked, and thus no cover applies.

`CONFIG.tokencover.COVER.typeFromPercentFn` can be modified to determine cover given system-specific rules.
It returns a cover type, or no cover, for a given
   This function determines cover type given a percent cover between 0 and 1.
   If coverToken and attackingToken is provided, this function can adjust the cover for system-specific,
   token-specific rules.
   - @param {number} percentCover     A percent cover from a given token
   - @param {Token} [coverToken]      Optional token for which cover should be measured
   - @param {Token} [attackingToken]  Optional token from which cover should be measured
   - @returns {CoverType|COVER.NONE}  The cover type for that percentage.

// TODO: This is probably not correct if walls and tokens block. Ideally, this function could
// be passed blocking objects.

*/

/* TODO:
- percentCover should take an option to include walls, include tokens.
- percentCover should take a flag to not clear the blocked objects, for expert use.
- CoverCalculator should have a method to test if an array of tokens block.
  - run cover calculator as normal.
  - if no tokens in blocking objects, return 0
  - otherwise, remove blocking tokens not in the array and re-run
  - take a flag to avoid running cover calc as normal first
- When running CoverCalculator on limited set, it should always reset to the full objects after
*/


export const COVER = {};
COVER.NONE = 0;
COVER.EXCLUDE = -1;

/**
 * Class to manage the cover types.
 * Each instantiation takes CoverTypeData and constructs the cover type.
 * Loading and saving controlled here.
 */
export class CoverType {
  /** @type {CoverTypeData} */
  config = {};

  /**
   * A cover type, representing rules for displaying the given icon on the token and
   * optionally triggering active effects.
   * @param {CoverTypeData} [coverTypeData]
   */
  constructor(coverTypeData) {
    // Unique cover type per id.
    const coverTypes = this.constructor.coverTypesMap;
    if ( coverTypes.has(coverTypeData.id) ) return coverTypes.get(coverTypeData.id);

    // Create and cache the new type
    this._configure(coverTypeData);
    coverTypes.set(this.config.id, this);
  }

  /**
   * Delete the setting associated with this cover type.
   * Typically used if destroying the cover type or resetting to defaults.
   */
  async deleteSetting() {
    const allStatusEffects = Settings.get(Settings.KEYS.COVER.TYPES);
    allStatusEffects[game.system.id] ??= {};
    delete allStatusEffects[game.system.id][this.config.id];
    return Settings.set(Settings.KEYS.COVER.TYPES, allStatusEffects);
  }

  /**
   * Configure the object using the default provided data.
   * @param {CoverTypeData} [CoverTypeData]
   */
  _configure(coverTypeData = {}) {
    this.config = coverTypeData;

    // Set reasonable defaults.
    this.config.id ??= `${MODULE_ID}.${game.system.id}.${foundry.utils.randomID()}`;
    this.config.name ??= "New Cover Type";
    this.config.percentThreshold ??= 1;
    this.config.system = game.system.id;
    this.config.includeWalls ??= true;    // Walls almost always provide cover.
    this.config.includeTokens ??= false;  // Tokens less likely to provide cover.

    // priority, tint, icon can all be null or undefined.
  }

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
   * Export this cover type data to JSON.
   * @returns {object}
   */
  toJSON() { return this.config.toJSON(); }

  /**
   * Save this cover type data to a JSON file.
   */
  saveToJSON() {
    const data = this.toJSON();
    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      [`${MODULE_ID}Version`]: game.modules.get(MODULE_ID).version
    };
    const filename = `${MODULE_ID}_${this.name}_CoverEffect`;
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
  }

  /**
   * Import data from JSON and overwrite.
   */
  fromJSON(json) {
    json = JSON.parse(json);
    delete json.id;
    for ( const [key, value] of Object.entries(json) ) this.config[key] = value;
    this.constructor.coverTypesUpdated();
  }

  /**
   * Sync from the stored setting, if any.
   */
  fromSettings() {
    const allStatusEffects = Settings.get(Settings.KEYS.COVER.TYPES);
    const json = allStatusEffects[game.system.id]?.[this.id];
    if ( json ) this.fromJSON(json);
  }

  /**
   * Save to the stored setting.
   */
  async saveToSettings() {
    const allStatusEffects = Settings.get(Settings.KEYS.COVER.TYPES);
    allStatusEffects[game.system.id] ??= {};
    allStatusEffects[game.system.id][this.id] = this.toJSON();
    await Settings.set(Settings.KEYS.COVER.TYPES, allStatusEffects);
  }

  // ----- NOTE: Static: Track Cover types ----- //
  /** @type {Map<string,CoverType>} */
  static coverTypesMap = new Map();

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
    for ( const coverType of this.coverTypesMap ) {
      if ( coverType.priority == null ) this.#coverTypesUnordered.push(coverType);
      else this.#coverTypesOrdered.push(coverType);
    }
    this.#coverTypesOrdered.sort((a, b) => b.priority - a.priority);
    this.#coverTypesModified = false;
  }

  // ----- NOTE: Static other properties ----- //


  // ----- NOTE: Static methods ----- //

  /**
   * Update the cover types from settings.
   */
  static _updateCoverTypesFromSettings() {
    this.coverTypesMap.forEach(ct => ct.fromSettings());
    this.#coverTypesModified ||= true;
  }

  /**
   * Save cover types to settings.
   */
  static async _saveCoverTypesToSettings() {
    const promises = [];
    for ( const coverType of this.coverTypesMap ) promises.push(ct.saveToSettings());
    return Promises.allSettled(promises);
  }

  /**
   * Create default effects and store in the map. Resets anything already in the map.
   * Typically used on game load.
   */
  static _constructDefaultCoverTypes() {
    const data = this._defaultCoverTypeData();
    this.coverTypesMap.clear();
    Object.values(data).forEach(d => new CoverType(d));
    this.#coverTypesModified ||= true;
  }

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

COVER.CoverType = CoverType;
COVER.TYPES = CoverType.coverTypesMap;

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
