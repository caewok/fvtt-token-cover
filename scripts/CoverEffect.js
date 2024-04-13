/* globals
*/
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverType } from "./CoverType.js";
import { Settings } from "./settings.js";
import { AbstractCoverObject } from "./AbstractCoverObject.js";
import { CoverEffectConfig } from "./CoverEffectConfig.js";
import { coverEffects as dnd5eCoverEffects, coverEffects_midiqol } from "./coverDefaults/dnd5e.js";
import { coverEffects as genericCoverEffects } from "./coverDefaults/generic.js";

/**
 * Handles active effects that should be treated as cover.
 * Applies the cover effect to tokens.
 * Imports/exports effect data.
 * Stores/retrieves effect data.
 * Sets up default effects.
 * Does not extend ActiveEffect class primarily b/c adding an effect to a token creates a new effect.
 * So it would be unhelpful to also instantiate the active effect here.
 */
export class CoverEffect extends AbstractCoverObject {

  /**
   * Configure the object using the default provided data.
   * @param {ActiveEffectData} [coverEffectData={}]
   */
  _configure(coverEffectData = {}) {
    super._configure(coverEffectData);

    // Ensure the necessary flags are present.
    this.config.flags ??= {};
    this.config.flags[MODULE_ID] ??= {};
    this.config.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ??= coverEffectData.id
      ?? `${MODULE_ID}.${game.system.id}.${foundry.utils.randomID()}`;
    const coverTypes = this.config.flags[MODULE_ID][FLAGS.COVER_TYPES] ??= [];

    // Move cover types to flags.
    if ( coverEffectData.coverTypes ) {
      coverEffectData.coverTypes.forEach(id => coverTypes.push(id));
      delete coverEffectData.coverTypes;
    }

    // Remove id from the main config.
    delete coverEffectData.id;

    // Name is required to instantiate an ActiveEffect.
    this.config.name ??= "tokencover.phrases.newEffect";
  }

  // ----- NOTE: Getters, setters, and related properties ----- //

  /** @type {string} */
  get id() {
    return this.config.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ?? super.id;
  }

  /** @type {string[]} */
  get #coverTypesArray() { return this.config.flags[MODULE_ID][FLAGS.COVER_TYPES]; }

  /** @type {CoverType|COVER.NONE} */
  get coverTypes() {
    return this.#coverTypesArray.map(typeId => CoverType.coverTypesMap.get(typeId));
  }

  set coverType(value) {
    if ( typeof value === "string" ) value = CoverType.coverTypesMap.get(value);
    if ( !(value instanceof CoverType) ) {
      console.error("CoverEffect#coverType must be a CoverType or CoverType id.");
      return;
    }
    this.config.flags[MODULE_ID][FLAGS.COVER_TYPE] = value.config.id;
  }

  /**
   * Get data for an active effect.
   */
  get #activeEffectData() {
    const data = { ...this.config };
    delete data.id;
    data.name = game.i18n.localize(data.name);
    return data;
  }

  // ----- NOTE: Methods ----- //

  /**
   * Add a single cover type to this effect.
   * @param {CoverType|string} coverType      CoverType object or its id.
   */
  _addCoverType(coverType) {
    if ( typeof coverType === "string" ) coverType = CoverType.coverTypesMap.get(coverType);
    if ( !(coverType instanceof CoverType) ) {
      console.error("CoverEffect#coverType must be a CoverType or CoverType id.");
      return;
    }
    this.#coverTypesArray.push(coverType.id);
  }

  /**
   * Remove a single cover type.
   * @param {CoverType|string} coverType      CoverType object or its id.
   */
  _removeCoverType(coverType) {
    if ( typeof coverType === "string" ) coverType = CoverType.coverTypesMap.get(coverType);
    if ( !(coverType instanceof CoverType) ) {
      console.error("CoverEffect#coverType must be a CoverType or CoverType id.");
      return;
    }
    const idx = this.#coverTypesArray.findIndex(ct => ct.id === coverType.id);
    if ( ~idx ) this.#coverTypesArray.splice(idx, 1);
  }

  /**
   * Clear all cover types
   */
  _removeAllCoverTypes() { this.#coverTypesArray.length = 0; }



  /**
   * Create a new ActiveEffect from this configuration.
   */
  createActiveEffect() { return new CONFIG.ActiveEffect.documentClass(this.#activeEffectData); }

  /**
   * Render the AE configuration window.
   */
  async renderConfig() {
    const app = new CoverEffectConfig(this)
    app.render(true);
  }

  // ----- NOTE: Methods to apply this active effect to a token ----- //

  /**
   * Add this cover effect (the underlying active effect) to a token.
   * @param {Token} token
   */
  async addToToken(token) {
    return token.actor.createEmbeddedDocuments("ActiveEffect", [this.#activeEffectData])
  }

  /**
   * Remove this cover effect (the underlying active effect) from a token.
   * @param {Token} token
   */
  async removeFromToken(token) {
    // Find all instances of this effect on the token (almost always singular effect).
    const ids = [];
    token.actor.effects.forEach(ae => {
      if ( this.constructor.idFromData(ae) === this.id ) ids.push(ae.id);
    });
    return token.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  // ----- NOTE: Static: Track Cover effects ----- //
  /** @type {Map<string,CoverType>} */
  static coverObjectsMap = new Map();

  // ----- NOTE: Other static getters, setters, related properties ----- //

  /**
   * Retrieve an id from cover data.
   * @param {object} coverEffectData
   */
  static idFromData(coverEffectData) { return coverEffectData?.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT_ID] ?? coverEffectData.id; }

  /** @type {string} */
  static get settingsKey() { return Settings.KEYS.COVER.EFFECTS; }


  /** @type {string} */
  static get systemId() {
    const id = game.system.id;
    if ( (id === "dnd5e" || id === "sw5e")
      && game.modules.get("midi-qol")?.active ) id += "_midiqol";
    return id;
  }

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
    switch ( this.systemId ) {
      case "dnd5e": return dnd5eCoverEffects; break;
      case "dnd5e_midiqol": return coverEffects_midiqol; break;
      case "pf2e": return {}; break;
      case "sfrpg": return {}; break;
      default: return genericCoverTypes;
    }
  }
}

COVER.EFFECTS = CoverEffect.coverObjectsMap;
