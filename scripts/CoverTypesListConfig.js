/* globals
CONFIG,
Dialog
expandObject,
FormApplication,
foundry,
game,
readTextFromFile,
renderTemplate,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, COVER } from "./const.js";
import { log, dialogPromise } from "./util.js";

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
  #sortCoverTypes() {
    this.allCoverTypes.sort((a, b) => {
      switch ( ( (!a.document.priority) * 2) + (!b.document.priority) ) {
        case 0: return a.priority - b.priority;
        case 1: return 1; // b.priority is null
        case 2: return -1; // a.priority is null
        case 3: return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
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
      promises.push(storedCoverType.update(coverTypeData));
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

    return Dialog.confirm({
      title: "Remove Cover Type",
      content:
        `<h4>Are You Sure?</h4><p>Reset cover objects to defaults? This cannot be undone.`,
      yes: async () => {
        log("CoverTypesListConfig|_onRemoveCoverType yes");
        await CONFIG[MODULE_ID].CoverType.resetToDefaults();
        this.render();
      }
    });
  }

  async _onImportCoverType(event) {
    event.stopPropagation();
    log("ImportCoverType clicked!");
    await this._onSubmit(event, { preventClose: true });

    // Construct dialog so user can select import file and warn about this being a permanent change.
    const dialogData = {
      title: "Import Cover Objects",
      content: await renderTemplate("templates/apps/import-data.html", {
        hint1: "You may import cover objects from an exported JSON file.",
        hint2: "This operation will update all the cover objects and cannot be undone."
      }),
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: html => {
            const form = html.find("form")[0];
            if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
            readTextFromFile(form.data.files[0]).then(json => this.importAllFromJSON(json));
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "import"
    };
    const dialogOpts = { width: 400 };
    const { html, buttonKey } = await dialogPromise(dialogData, dialogOpts);
    if ( buttonKey === "Close" || buttonKey === "no" ) return;

    // Upload and retrieve the data for the effect.
    const form = html.find("form")[0];
    if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
    const json = await readTextFromFile(form.data.files[0]);
    if ( !json ) return;

    // Update the effect and then rerender.
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