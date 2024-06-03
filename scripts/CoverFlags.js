/* globals
CONFIG,
CONST,
expandObject,
FormApplication,
foundry,
game,
saveDataToFile,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";
import { Settings } from "./settings.js";

export class CoverFlags extends CoverEffect {
  // ----- NOTE: Token/Actor methods ----- //

  /**
   * Internal method to add this cover image to the token locally.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _addToToken(token) {
    const doc = this.localDocumentData;
    token.document.updateSource(doc);

    // If token is secret, ignore
    if ( token.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET &&
      Settings.get(Settings.KEYS.DISPLAY_SECRET_COVER) ) return true;

    if ( token[MODULE_ID].iconMap.has(this.id) ) return true;

    // Add the status icon to the token.
    token[MODULE_ID].addIcon({
      id: this.id,
      category: this.id,
      src: this.img
    });
    return true;
  }

  /**
   * Internal method to remove this cover effect from the token.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _removeFromToken(token) {
    if ( Object.hasOwn(token.document.flags, MODULE_ID) ) {
      // Drop each flag.
      const tcDoc = foundry.utils.flattenObject(this.localDocumentData);
      for ( const key of Object.keys(tcDoc) ) {
        delete tcDoc[key];
        const idx = key.lastIndexOf(".")
        if ( !~idx ) continue;
        const deletionKey = key.slice(0, idx + 1).concat("-=", key.slice(idx + 1));
        tcDoc[deletionKey] = null;
      }
       token.document.updateSource(tcDoc);
    }

    // Remove the status icon
    token[MODULE_ID].removeIcon({
      id: this.id,
      category: this.id,
      src: this.img
    });
    return true;
  }

  // ----- NOTE: Document Methods ----- //

  /**
   * Get data used to construct a local cover effect document.
   * For CoverFlag, this strips down to just the flags.
   * @type {object}
   */
  get localDocumentData() {
    const { flags } = super.localDocumentData;
    return { flags };
  }

  /**
   * Find an existing local document to use for the storage.
   * For cover flags, this is an object with flags defined by
   * the stored setting.
   * @returns {Document|object|undefined}
   */
  _findStorageDocument() {
    return this.defaultDocumentData ?? this.constructor.newCoverObjectData;
  }

  /**
   * Load an async document to use for storage.
   * Async allows us to pull from compendiums or otherwise construct a default.
   * @returns {Document|object|undefined}
   */
  async _loadStorageDocument() { return this._findStorageDocument(); }

  /**
   * Create a storage document from scratch.
   * @returns {Document|object}
   */
  async _createStorageDocument() { return this._findStorageDocument(); }

  /**
   * Delete the underlying stored document.
   */
  async _deleteStorageDocument() {
    const allData = Settings.get(Settings.KEY.COVER_EFFECTS.RULES) ?? {};
    delete allData[this.id];
    return Settings.set(Settings.KEY.COVER_EFFECTS.RULES, allData);
  }

  /**
   * Render the cover effect configuration window.
   */
  async renderConfig() {
    ui.notifications.notify("Editing Cover Effect not applicable when 'display cover icons only' setting is enabled. Try right-clicking and selecting 'Edit Cover Rules' instead.");
  }

  /**
   * Render the cover effect rules configuration window.
   */
  async renderRulesConfig() {
    this.rulesConfig ??=  new CoverFlagRulesConfig(this.document);
    return this.rulesConfig.render(true);
  }

  // ----- NOTE: Static token methods ----- //

  /**
   * Get all documents for a give token/actor that could contain a cover effect.
   * Each document should be an object that has a "flags" property.
   * @param {Token} token
   * @returns {EmbeddedCollection|DocumentCollection|Map}
   */
  static _effectDocumentsOnToken(token) {
    const m = new Map();
    m.set(token.id, token.document);
    return m;
  }

  // ----- NOTE: Static document methods ----- //

  /**
   * Save a json file for this cover object.
   */
  exportToJSON() {
    const filename = `${MODULE_ID}_CoverFlag_${this.id}`;
    const data = this.toJSON();
    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      [`${MODULE_ID}Version`]: game.modules.get(MODULE_ID).version
    };
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
  }

  /**
   * Export this cover type data to JSON.
   * @returns {object}
   */
  toJSON() { return this.document; }

  /**
   * Transition all cover documents in a scene, when updating versions.
   */
  static async transitionDocuments() {
    return;
  }

  /**
   * Refresh the display of the cover effect on the token.
   * @param {Token} token
   */
  static refreshCoverDisplay(token) {
    // Drop refreshing the actor sheet as there is none for cover flags.
    token.renderFlags.set({ redrawEffects: true });
  }

}

/**
 * Specialized handling of cover effect rules in dnd5e.
 */
export class CoverFlagsDND5E extends CoverFlags {
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
    const newFlags = expandObject(formData)?.flags?.[MODULE_ID];
    if ( !newFlags ) return;
    foundry.utils.mergeObject(this.object.flags[MODULE_ID], newFlags, { inplace: true });

    // Update the settings.
    const id = this.object.flags[MODULE_ID].coverEffectId;
    const ce = CONFIG[MODULE_ID].CoverEffect.coverObjectsMap.get(id);
    if ( !ce ) return;
    return ce.updateCoverRuleSettings(newFlags); // Async
   }

}
