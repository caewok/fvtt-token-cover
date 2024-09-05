/* globals
FormApplication,
foundry,
game,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS, ICONS } from "./const.js";
import { UniqueActiveEffect } from "./unique_effects/UniqueActiveEffect.js";
import { UniqueItemEffect } from "./unique_effects/UniqueItemEffect.js";
import { UniqueFlagEffect } from "./unique_effects/UniqueFlagEffect.js";
import { CoverMixin } from "./UniqueEffectCoverMixin.js";

export class CoverActiveEffect extends CoverMixin(UniqueActiveEffect) {

  /** @type {object} */
  static get _storageMapData() {
    return {
      name: "Cover Effects",
      img: ICONS.MODULE,
      type: "base",
    };
  }
}

export class CoverItemEffect extends CoverMixin(UniqueItemEffect) {}

export class CoverFlagEffect extends CoverMixin(UniqueFlagEffect) {

  /** @type {object} */
  static get _storageMapData() {
    return {
      name: "Cover Effects",
      img: ICONS.MODULE,
      type: "base",
    };
  }
}

/**
 * Specialized handling of cover effect rules in dnd5e.
 */
export class CoverDND5E extends CoverActiveEffect {
  /**
   * Test if this cover effect could apply to a target token given an attacking token.
   * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
   * @param {Viewer} attackingToken        Token or other object from which cover is sought
   * @param {Token} targetToken           Token to which cover would apply
   * @param {object} [opts]               Options used to determine whether to ignore cover
   * @param {CONFIG.DND5E.itemActionTypes} [actionType="all"]   Attack action type
   * @returns {boolean}
   */
  _couldApply(attacker, targetToken, opts = {}) {
    const actionType = opts.actionType ?? "all";
    let ignoresCover = false;
    if ( attacker instanceof Token ) ignoresCover = attacker.tokencover.ignoresCover?.[actionType];
    if ( ignoresCover && ignoresCover >= this.document.percentThreshold ) return false;
    return super._couldApply(attacker, targetToken);
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
    if ( dFredsEffect.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID) ) return dFredsEffect;
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
      dFredsEffect = await game.dfreds.effectInterface.createNewCustomEffectsWith({ activeEffects: [ae] });
      dFredsEffect = dFredsEffect[0];
    }
    if ( !dFredsEffect ) return super._loadStorageDocument();

    // Don't use unless it has the correct flags.
    // TODO: Need to add all cover type flags
    await dFredsEffect.setFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID, this.id);
    return dFredsEffect;
  }

}

/**
 * Specialized handling of cover effect rules in dnd5e.
 */
export class CoverFlagsDND5E extends CoverFlagEffect {
  /**
   * Test if this cover effect could apply to a target token given an attacking token.
   * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
   * @param {Token} attackingToken        Token from which cover is sought
   * @param {Token} targetToken           Token to which cover would apply
   * @param {object} [opts]               Options used to determine whether to ignore cover
   * @param {CONFIG.DND5E.itemActionTypes} [actionType="all"]   Attack action type
   * @returns {boolean}
   */
  _couldApply(attacker, targetToken, opts = {}) {
    const actionType = opts.actionType ?? "all";
    let ignoresCover = false;
    if ( attacker instanceof Token ) ignoresCover = attacker.tokencover.ignoresCover?.[actionType];
    if ( ignoresCover && ignoresCover >= this.document.percentThreshold ) return false;
    return super._couldApply(attacker, targetToken);
  }
}

/**
 * Separate config that works with the CoverFlag, which doesn't have a document sheet.
 */
export class CoverFlagRulesConfig extends FormApplication {
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
    };
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
  }

}
