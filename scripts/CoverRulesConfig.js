/* globals
DocumentSheetConfig,
foundry,
game,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";

/**
 * Submenu for viewing and editing cover rules defined for the system.
 */
export class CoverRulesConfig extends DocumentSheetConfig {
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

  getData(options={}) {
    const obj = super.getData(options);
    obj.data = this.object; // To match ActiveEffectConfig data params
    return obj;
  }

  /**
   * This method is called upon form submission after form data is validated
   * @param {Event} event       The initial triggering submission event
   * @param {object} formData   The object of validated form data with which to update the object
   * @returns {Promise}         A Promise which resolves once the update operation has completed
   * @abstract
   */
  //   async _updateObject(event, formData) {
  //
  //     throw new Error("A subclass of the FormApplication must implement the _updateObject method.");
  //   }

}
