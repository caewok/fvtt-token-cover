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

import { MODULE_ID } from "./const.js";
import { COVER } from "./cover_types.js";

/**
 * Submenu for viewing and editing cover types defined for the system.
 */
export class CoverTypesListConfig extends FormApplication  {
  /** @type {CoverType[]} */
  allCoverTypes;

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
    const allCoverTypes = this.allCoverTypes = [...Object.values(COVER.TYPES)];
    this._sortCoverTypes(allCoverTypes);

    return foundry.utils.mergeObject(data, {
      allCoverTypes: COVER.TYPES
    });
  }

  /**
   * Sort the cover types by priority.
   */
  _sortCoverTypes(coverTypes) {
    coverTypes.sort((a, b) => {
      switch ( ( (a.priority == null) * 2) + (b.priority == null) ) {
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
//     const promises = [];
//     for ( const coverType of Object.values(expandedFormData.allCoverTypes) ) {
//       const storedCoverType = Object.values(COVER.TYPES).find(ct => ct.id === coverType.id);
//       if ( !storedCoverType ) continue;
//
//       const terrain = this.allTerrains[Number(idx)];
//       if ( !terrain ) continue;
//       for ( const [key, value] of Object.entries(terrainData) ) {
//         promises.push(terrain[`set${capitalizeFirstLetter(key)}`](value));
//       }
//     }
//     await Promise.allSettled(promises);
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
    html.find("button.tm-replace-coverType").click(this._onReplaceAllCoverTypes.bind(this));
    html.find("button.tm-export-coverType").click(this._onExportAllCoverTypes.bind(this));
  }

  /**
   * User clicked button to add a new cover type.
   */
  async _onAddCoverType(event) {
    event.preventDefault();
    log("addCoverType clicked!");

//     const terrain = new Terrain();
//     await terrain.initialize();
//     await this._onSubmit(event, { preventClose: true });
//     this.render();
//     TerrainEffectsApp.rerender();
  }

  /**
   * User clicked button to remove an existing cover type.
   */
  async _onRemoveCoverType(event) {
    event.preventDefault();
    log("removeCoverType clicked!");
    const idx = this._indexForEvent(event);
    const id = this.allCoverTypes[idx]?.id;
    if ( !id ) return;

    return Dialog.confirm({
      title: "Remove Cover Type",
      content:
        "<h4>Are You Sure?</h4><p>This will remove the cover type from all scenes.",
      yes: async () => {
        log("CoverTypesListConfig|_onRemoveCoverType yes");
        // await EffectHelper.deleteEffectById(effectId);
        // await this._onSubmit(event, { preventClose: true });
        // TerrainEffectsApp.rerender();
        this.render();
      }
    });
  }

  async _onImportCoverType(event) {
    event.stopPropagation();
    log("_onImportTerrains clicked!");
    await this._onSubmit(event, { preventClose: true });
    //await Terrain.importFromJSONDialog();
  }

  async _onReplaceAllCoverTypes(event) {
    event.stopPropagation();
    log("_onReplaceAllTerrains clicked!");
    await this._onSubmit(event, { preventClose: true });
    //await Terrain.replaceFromJSONDialog();
  }

  async _onExportAllCoverTypes(event) {
    event.stopPropagation();
    log("_onExportAllTerrains clicked!");
    await this._onSubmit(event, { preventClose: true });
    //Terrain.saveToJSON();
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