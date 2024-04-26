/* globals
ActiveEffect,
Dialog
expandObject,
FormApplication,
foundry,
game,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, COVER } from "./const.js";
import { log } from "./util.js";

/**
 * Submenu for viewing and editing cover types defined for the system.
 */
export class CoverTypesListConfig extends FormApplication  {
  /** @type {CoverType[]} */
  allCoverTypes = [];

  /**
   * Set the default size and other basic options for the form.
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: `modules/${MODULE_ID}/templates/cover-types-list-config.html`,
      height: "auto",
      title: game.i18n.localize(`${MODULE_ID}.cover-types-list-config.title`),
      width: 700,
      classes: [MODULE_ID, "settings"],
      submitOnClose: true,
      closeOnSubmit: true
    });
  }

  /**
   * Fetch data for all cover types.
   */
  getData(options={}) {
    const data = super.getData(options);
    this.allCoverTypes.length = 0;
    COVER.TYPES.forEach(ct => this.allCoverTypes.push(ct));
    this.#sortCoverTypes();
    return foundry.utils.mergeObject(data, {
      allCoverTypes: this.allCoverTypes.map(ct => { return { ...ct.document }; })
    });
  }


  /**
   * Sort the cover types by priority.
   */
  #sortCoverTypes(coverTypes) {
    this.allCoverTypes.sort((a, b) => {
      switch ( ( (!a.document.priority) * 2) + (!b.document.priority) ) {
        case 0: return a.priority - b.priority;
        case 1: return 1; // b.priority is null
        case 2: return -1; // a.priority is null
        case 3: return a.name.toLowerCase() < b.name.toLowerCase ? -1 : 1;
      }
    });
  }

  /**
   * Handle changes to priority by resorting.
   * @param {Event} event  The initial change event
   * @protected
   */
  async _onChangeInput(event) {
    const el = event.target;
    if ( el.name.includes("priority") ) this.render();
    return super._onChangeInput(event);
  }

  /**
   * Update the cover types.
   */
  async _updateObject(_event, formData) {
    const expandedFormData = expandObject(formData);
    const promises = [];
    for ( const [idx, coverTypeData] of Object.entries(expandedFormData.allCoverTypes) ) {
      const storedCoverType = this.allCoverTypes[idx];
      if ( !storedCoverType ) continue;
      promises.add(storedCoverType.update(coverTypeData));
    }
    return Promise.allSettled(promises);
  }

  /**
   * Submit the form.
   */
  async _onSubmit(event, { updateData=null, preventClose=false, preventRender=false } = {}) {
    const formData = await super._onSubmit(event, { updateData, preventClose, preventRender });
    // CoverEffectsApp.rerender();
    if ( preventClose ) return formData;
  }

  /**
   * Activate listeners for buttons on the form.
   */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button.tm-add-coverType").click(this._onAddCoverType.bind(this));
    html.find("button.tm-remove-coverType").click(this._onRemoveCoverType.bind(this));
    html.find("button.tm-import-coverType").click(this._onImportCoverType.bind(this));
    html.find("button.tm-export-coverType").click(this._onExportAllCoverTypes.bind(this));
    html.find("button.tm-reset-defaults").click(this._onResetToDefaults.bind(this));
  }

  /**
   * User clicked button to add a new cover type.
   */
  async _onAddCoverType(event) {
    event.preventDefault();
    log("AddCoverType clicked!");
    await this._onSubmit(event, { preventClose: true });
    await CONFIG[MODULE_ID].CoverType.create();
    this.render();
  }

  /**
   * User clicked button to remove an existing cover type.
   */
  async _onRemoveCoverType(event) {
    event.preventDefault();
    log("RemoveCoverType clicked!");
    const idx = this._indexForEvent(event);
    const ct = this.allCoverTypes[idx];
    if ( !ct ) return;

    return Dialog.confirm({
      title: "Remove Cover Type",
      content:
        `<h4>Are You Sure?</h4><p>This will remove the cover type ${ct.name} from all scenes.`,
      yes: async () => {
        log("CoverTypesListConfig|_onRemoveCoverType yes");
        await ct.delete();
        this.render();
      }
    });
  }

  /**
   * User clicked button to reset to defaults.
   */
  async _onResetToDefaults(_event) {
    log("ResetToDefaults clicked!");
    await CONFIG[MODULE_ID].CoverType.resetToDefaultsDialog();
    this.render();
  }

  async _onImportCoverType(event) {
    event.stopPropagation();
    log("ImportCoverType clicked!");
    await this._onSubmit(event, { preventClose: true });
    await CONFIG[MODULE_ID].CoverType.importAllFromJSONDialog();
    this.render();
  }

  async _onExportAllCoverTypes(event) {
    event.stopPropagation();
    log("ExportAllCoverTypes clicked!");
    await this._onSubmit(event, { preventClose: true });
    CONFIG[MODULE_ID].CoverType.saveAllToJSON();
  }

  /**
   * Determine which index of the cover types array triggered the button push.
   */
  _indexForEvent(event) {
    // For reasons, the target is sometimes the button value and sometimes the button.
    const target = event.target;
    return Number(target.getAttribute("data-idx") || target.parentElement.getAttribute("data-idx"));
  }
}