/* globals
CONFIG,
FormApplication,
foundry,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { Settings } from "./settings.js";
import { MODULE_ID, FLAGS } from "./const.js";
import { UniqueActiveEffect } from "./unique_effects/UniqueActiveEffect.js";
import { UniqueItemEffect } from "./unique_effects/UniqueItemEffect.js";
import { UniqueFlagEffect } from "./unique_effects/UniqueFlagEffect.js";
import { CoverMixin } from "./UniqueEffectCoverMixin.js";
import { loadDefaultCoverJSONs } from "./default_cover.js";

export class CoverActiveEffect extends CoverMixin(UniqueActiveEffect) {

  /**
   * Search documents for all stored effects.
   * Child class may also include default effects not yet created.
   * This should not require anything to be loaded, so it can be run at canvas.init.
   * @returns {Object<string, string>} Effect id keyed to effect name
   */
  static _mapStoredEffectNames() {
    const map = {}
    const storageData = this._storageMapData;
    const items = game.items ?? game.data.items;
    const item = items.find(item => item.name === storageData.name);
    if ( !item ) return map;
    item.effects.forEach(effect => {
      const id = effect.flags?.[MODULE_ID]?.[FLAGS.UNIQUE_EFFECT.ID];
      if ( id ) map[id] = effect.name;
    });
    // Currently no default names, otherwise those would be valid as well.
    return map;
  }

  /**
   * Initialize default effects by adding the document(s) to the storage map.
   */
  static async _initializeDefaultEffects() {
    if ( !CONFIG[MODULE_ID].defaultCoverJSONs.length ) return;
    const defaultMap = await loadDefaultCoverJSONs(CONFIG[MODULE_ID].defaultCoverJSONs);
    const promises = [];
    defaultMap.forEach(data => {
      data.name = game.i18n.localize(data.name);
      promises.push(this._createNewDocument(data));
    });
    await Promise.allSettled(promises);
  }

  /**
   * Reset default effects by removing the existing ids and re-adding.
   */
  static async _resetDefaultEffects() {
    if ( !CONFIG[MODULE_ID].defaultCoverJSONs.length ) return;
    const defaultMap = await loadDefaultCoverJSONs(CONFIG[MODULE_ID].defaultCoverJSONs);

    // Delete existing.
    for ( const key of defaultMap.keys() ) {
      const cover = this._instances.get(key);
      if ( !cover ) continue;
      await cover._deleteDocument();
    }

    const promises = [];
    defaultMap.forEach(data => {
      data.name = game.i18n.localize(data.name);
      promises.push(this._createNewDocument(data));
    });
    await Promise.allSettled(promises);

    // Re-create the terrains as necessary.
    for ( const key of defaultMap.keys() ) { await CONFIG[MODULE_ID].CoverEffect.create(key); }
  }

}

export class CoverItemEffect extends CoverMixin(UniqueItemEffect) {
  /**
   * Search documents for all stored effects.
   * Child class may also include default effects not yet created.
   * This should not require anything to be loaded, so it can be run at canvas.init.
   * @returns {Object<string, string>} Effect id keyed to effect name
   */
  static _mapStoredEffectNames() {
    const map = {}
    const items = game.items ?? game.data.items;
    items.forEach(item => {
      const id = item.flags?.[MODULE_ID]?.[FLAGS.UNIQUE_EFFECT.ID];
      if ( id ) map[id] = item.name;
    });

    // Currently no default names, otherwise those would be valid as well.
    return map;
  }
}

export class CoverFlagEffect extends CoverMixin(UniqueFlagEffect) {
  /**
   * Search documents for all stored effects.
   * Child class may also include default effects not yet created.
   * This should not require anything to be loaded, so it can be run at canvas.init.
   * @returns {Object<string, string>} Effect id keyed to effect name
   */
  static _mapStoredEffectNames() {
    const map = {}
    const items = Settings._getStorageValue(this.settingsKey);
    items.forEach(item => {
      const id = item.flags?.[MODULE_ID]?.[FLAGS.UNIQUE_EFFECT.ID];
      if ( id ) map[id] = item.name;
    });

    // Currently no default names, otherwise those would be valid as well.
    return map;
  }
}

/**
 * Specialized handling of cover effect rules in dnd5e.
 */
export class CoverDND5E extends CoverActiveEffect {
  /**
   * Test if this cover effect could apply to a target token given an attacking token.
   * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
   * @param {Token} attackingToken        Token from which cover is sought
   * @param {Token} targetToken           Token to which cover would apply
   * @param {object} [opts]               Options used to determine whether to ignore cover
   * @param {CONFIG.DND5E.itemActionTypes} [actionType="all"]   Attack action type
   * @returns {boolean}
   */
  _couldApply(attackingToken, targetToken,  opts = {}) {
    const actionType = opts.actionType ?? "all";
    const ignoresCover = attackingToken.tokencover.ignoresCover?.[actionType];
    if ( ignoresCover && ignoresCover >= this.document.percentThreshold ) return false;
    return super._couldApply(attackingToken, targetToken);
  }
}

/**
 * Specialized handling of cover effect rules in PF2e
 */
export class CoverPF2E extends CoverItemEffect {

  /**
   * Default data required to be present in the base effect document.
   * @param {string} [activeEffectId]   The id to use
   * @returns {object}
   */
  static newDocumentData(activeEffectId) {
    const data = CoverItemEffect.newDocumentData.call(this, activeEffectId);
    data.type = "effect";
    return data;
  }
}

/**
 * Specialized handling of cover effect rules in SFRPG
 */
export class CoverSFRPG extends CoverItemEffect {

  /**
   * Default data required to be present in the base effect document.
   * @param {string} [activeEffectId]   The id to use
   * @returns {object}
   */
  static newDocumentData(activeEffectId) {
    const data = CoverItemEffect.newDocumentData.call(this, activeEffectId);
    data.type = "effect";
    return data;
  }
}

/**
 * Use DFred's instead of AEs in dnd5e
 */
export class CoverDFreds extends CoverDND5E {
  /**
   * Find the storage document for given cover effect id.
   * If id corresponds to DFred's effect, use that.
   * @param {string} uniqueEffectId
   * @returns {Document|object|undefined}
   */
  _findLocalDocument(_uniqueEffectId) {
    const defaultData = this.defaultCoverObjectData;
    if ( !defaultData ) return super._findStorageDocument();

    const dFredsEffect = game.dfreds.effectInterface.findCustomEffectByName(defaultData.dFredsName);
    if ( !dFredsEffect ) return undefined;

    // Don't use unless it has the correct flags.
    if ( dFredsEffect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID) ) return dFredsEffect;
    return undefined;
  }

  /**
   * Load an async effect document to use for storage.
   * Async allows us to pull from compendiums or otherwise construct a default.
   * If id corresponds to DFred's effect, use that after adding the necessary flags.
   * @param {string} uniqueEffectId
   * @returns {Document|object|undefined}
   */
   async _loadDocument(_uniqueEffectId) {
    const defaultData = this.defaultCoverObjectData;
    if ( !defaultData ) return super._loadStorageDocument();

    let dFredsEffect = game.dfreds.effectInterface.findCustomEffectByName(defaultData.dFredsName);
    if ( !dFredsEffect ) {
      const ae = game.dfreds.effectInterface.findEffectByName(defaultData.dFredsName);
      if ( !ae ) return super._loadStorageDocument();
      dFredsEffect = await game.dfreds.effectInterface.createNewCustomEffectsWith({ activeEffects: [ae] })
      dFredsEffect = dFredsEffect[0];
    }
    if ( !dFredsEffect ) return super._loadStorageDocument();

    // Don't use unless it has the correct flags.
    // TODO: Need to add all cover type flags
    await dFredsEffect.setFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID, this.id);
    return dFredsEffect;
  }

}

/**
 * Specialized handling of cover effect rules in dnd5e.
 */
export class CoverFlagsDND5E extends UniqueFlagEffect {
  /**
   * Test if this cover effect could apply to a target token given an attacking token.
   * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
   * @param {Token} attackingToken        Token from which cover is sought
   * @param {Token} targetToken           Token to which cover would apply
   * @param {object} [opts]               Options used to determine whether to ignore cover
   * @param {CONFIG.DND5E.itemActionTypes} [actionType="all"]   Attack action type
   * @returns {boolean}
   */
  _couldApply(attackingToken, targetToken,  opts = {}) {
    const actionType = opts.actionType ?? "all";
    const ignoresCover = attackingToken.tokencover.ignoresCover?.[actionType];
    if ( ignoresCover && ignoresCover >= this.document.percentThreshold ) return false;
    return super._couldApply(attackingToken, targetToken);
  }
}

/**
 * Separate config that works with the CoverFlag, which doesn't have a document sheet.
 */
export class CoverFlagRulesConfig extends FormApplication  {
  /**
   * Set the default size and other basic options for the form.
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: `modules/${MODULE_ID}/templates/cover-rules-config.html`,
      height: "auto",
      title: game.i18n.localize(`${MODULE_ID}.cover-rules-config.title`),
      width: 500,
      classes: [MODULE_ID, "settings"],
      submitOnClose: true,
      closeOnSubmit: true
    });
  }

  /**
   * Data is the cover flag document.
   */
  getData(_options = {}) {
    return {
      isGM: game.user.isGM,
      object: this.object
    }
  }

  /**
   * This method is called upon form submission after form data is validated
   * @param {Event} event       The initial triggering submission event
   * @param {object} formData   The object of validated form data with which to update the object
   * @returns {Promise}         A Promise which resolves once the update operation has completed
   * @abstract
   */
  async _updateObject(event, formData) {
    const newFlags = foundry.utils.expandObject(formData)?.flags?.[MODULE_ID];
    if ( !newFlags ) return;
    foundry.utils.mergeObject(this.object.flags[MODULE_ID], newFlags, { inplace: true });

    // Update the settings.
    const id = this.object.flags[MODULE_ID].coverEffectId;
    const ce = CONFIG[MODULE_ID].CoverEffect.coverObjectsMap.get(id);
    if ( !ce ) return;
    return ce.updateCoverRuleSettings(newFlags); // Async
   }

}