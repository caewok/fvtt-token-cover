/* globals
*/
"use strict";

import { MODULE_ID, FLAGS } from "./const.js";
import { CoverType } from "./CoverType.js";
import { Settings } from "./settings.js";
import { AbstractCoverObject } from "./AbstractCoverObject.js";


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
   * A cover effect, representing rules for displaying the given icon on the token and
   * optionally triggering active effects.
   * @param {ActiveEffectData} [coverEffectData={}]
   */
//   constructor(coverEffectData = {}) {
//     // Enforce singleton.
//     const id = coverEffectData?.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT_ID];
//     const coverObjectsMap = CoverEffect.coverObjectsMap;
//     if ( coverObjectsMap.has(id) ) return coverObjectsMap.get(id);
//
//     // Construct the object
//     super(coverEffectData);
//
//     // Unique cover type per id.
//     coverObjectsMap.set(id, this);
//   }

  /**
   * Configure the object using the default provided data.
   * @param {ActiveEffectData} [coverEffectData={}]
   */
  _configure(coverEffectData = {}) {
    super._configure(coverTypeData);

    // Ensure the necessary flags are present.
    this.config.flags ??= {};
    this.config.flags[MODULE_ID] ??= {};
    this.config.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ??= `${MODULE_ID}.${game.system.id}.${foundry.utils.randomID()}`;
    this.config.flags[MODULE_ID][FLAGS.COVER_TYPE] ??= "none";

    // Name is required to instantiate an ActiveEffect.
    this.config.name ??= "New Cover Effect";
  }

  // ----- NOTE: Getters, setters, and related properties ----- //

  /** @type {string} */
  get id() {
    return this.config.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ?? super.id;
  }

  /** @type {CoverType|COVER.NONE} */
  get coverType() {
    const typeId = this.config.flags[MODULE_ID][FLAGS.COVER_TYPE];
    if ( !typeId || typeId === "none" ) return COVER.NONE;
    return CoverType.coverTypesMap.get(typeId) ?? COVER.NONE;
  }

  set coverType(value) {
    if ( typeof value === "string" ) value = CoverType.coverTypesMap.get(value);
    if ( !(value instanceof CoverType) ) {
      console.error("CoverEffect#coverType must be a CoverType or CoverType id.");
      return;
    }
    this.config.flags[MODULE_ID][FLAGS.COVER_TYPE] = value.config.id;
  }

  // ----- NOTE: Methods ----- //

  /**
   * Create a new ActiveEffect from this configuration.
   */


  // ----- NOTE: Static: Track Cover effects ----- //
  /** @type {Map<string,CoverType>} */
  static coverObjectsMap = new Map();

  // ----- NOTE: Other static getters, setters, related properties ----- //

  /**
   * Retrieve an id from cover data.
   * @param {object} coverEffectData
   */
  static idFromData(coverEffectData) { return coverEffectData?.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT_ID]; }


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
  static _updateCoverTypesFromSettings = AbstractCoverObject._updateCoverTypesFromSettings.bind(this);

  /**
   * Save cover types to settings.
   */
  static _saveCoverTypesToSettings = AbstractCoverObject._saveCoverTypesToSettings.bind(this);

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

}


export function ExtendActiveEffect() {

  /**
   * Class to manage cover effects.
   * These are active effects with a few additional properties and methods.
   * Namely, they can be linked to a specific CoverType.
   */
  class CoverEffect extends CONFIG.ActiveEffect.documentClass {
    // ----- NOTE: Static methods ----- //

    /** @type {string} */
    static get systemId() {
      const id = game.system.id;
      if ( (id === "dnd5e" || id === "sw5e")
        && game.modules.get("midi-qol")?.active ) id += "_midiqol";
      return id;
    }

    // ----- NOTE: Getters and other properties ----- //

    /**
     * Identifier used to store this active effect in settings.
     * @type {string}
     */
    get coverIdentifier() { return this.getFlag(MODULE_ID, COVER_EFFECT_ID) ?? foundry.utils.randomID(); }

    /**
     * Retrieve the cover type for this CoverEffect.
     */
    get coverType() {
      const type = this.getFlag(MODULE_ID, FLAGS.COVER_TYPE);
      return CoverType.coverTypesMap.get(type);
    }

    // ----- NOTE: Methods ----- //



    /**
     * Save to the stored setting.
     */
    async saveToSettings() {
      const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
      const systemId = this.constructor.systemId;
      allStatusEffects[systemId] ??= {};
      allStatusEffects[systemId][this.coverIdentifier] = this.toJSON();
    }




  }



  return CoverEffect;
}
