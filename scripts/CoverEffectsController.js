/* globals
CONFIG,
CONST,
foundry,
game,
readTextFromFile,
renderTemplate,
saveDataToFile,
TextEditor,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

// Much of this is from
// https://github.com/DFreds/dfreds-convenient-effects/blob/main/scripts/app/convenient-effects-controller.js

import { Settings } from "./settings.js";
import { log } from "./util.js";
import { MODULE_ID } from "./const.js";

/**
 * Controller class to handle app events and manipulate underlying Foundry data.
 */
export class CoverEffectsController {

  /** @type {CoverEffectsApp} */
  #viewMvc;

  /**
   * Initializes the controller and its dependencies
   * @param {CoverEffectsApp} viewMvc - the app that the controller can interact with
   */
  constructor(viewMvc) {
    this.#viewMvc = viewMvc;
  }

  /**
   * Rerender the application for this controller.
   * Need only rerender the directory listing.
   */
  rerender() { this.#viewMvc.render({ parts: ["directory"], force: true }); }

  /**
   * Configure and return data specific for the header.
   * @returns {Object} the data to pass to the template
   */
  headerData(context) {
    context.isGM = game.user.isGM;
    context.hasDefaults = Boolean(CONFIG[MODULE_ID].CoverEffect._resetDefaultEffects);
    return context;
  }

  /**
   * Configure and return data specific for the directories.
   * @returns {Object} the data to pass to the template
   */
  directoryData(context) {
    const covers = [...CONFIG[MODULE_ID].CoverEffect._instances.values()];
    this._sortCovers(covers);

    Object.assign(context, {
      effects: covers,
      entryPartial: this.#viewMvc.constructor._entryPartial,
    });
  }

  _sortCovers(covers) {
    covers.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if ( nameA < nameB ) return -1;
      if ( nameA > nameB ) return 1;
      return 0;
    });
    return covers;
  }

  // ----- NOTE: Buttons ---- //

  /**
   * Handles clicks on the create effect button
   * @param {MouseEvent} event
   */
  async onCreateCover() {
    log("CoverEffectsController|onCreateCover");
    const cover = await CONFIG[MODULE_ID].CoverEffect.create();
    this.rerender();
    cover.document.sheet.render(true);
  }

  /**
   * Handles clicks on the create defaults button
   * @param {MouseEvent} event
   */
  async onCreateDefaults() {
    log("CoverEffectsController|onCreateDefaults");
    const confirmText = game.i18n.localize(`${MODULE_ID}.coverbook.are-you-sure`);
    const descriptionText = game.i18n.localize(`${MODULE_ID}.coverbook.create-defaults-description`);
    const proceed = await foundry.applications.api.DialogV2.confirm({
      title: "Replace Default Covers",
      content: `<h4>${confirmText}</h4><p>${descriptionText}`,
      rejectClose: false,
      modal: true,
    });
    if ( !proceed ) return;
    log("CoverEffectsController|onCreateDefaultsClick yes");
    await CONFIG[MODULE_ID].CoverEffect._resetDefaultEffects();
    this.rerender();
  }

  // ----- NOTE: Cover item management ----- //

  /**
   * Handle editing the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onEditCover(effectId) {
    log("CoverEffectsController|onEditEffectClick", { effectId });
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    cover.document.sheet.render(true);
  }

  /**
   * Handle deleting the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDeleteCover(effectId) {
    log("CoverEffectsController|onDeleteEffectClick", { effectId });
    const confirmText = game.i18n.localize(`${MODULE_ID}.coverbook.are-you-sure`);
    const descriptionText = game.i18n.localize(`${MODULE_ID}.coverbook.remove-cover-description`);
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(`${MODULE_ID}.coverbook.delete-cover`) },
      content: `<h4>${confirmText}</h4><p>${descriptionText}`,
      rejectClose: false,
      modal: true,
    });
    if ( !proceed ) return;
    log("CoverEffectsController|onDeleteEffectClick yes");
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    await cover.destroy(true);
    this.rerender();
  }

  /**
   * Handle clicks on the import cover menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onImportCover(effectId) {
    log("CoverEffectsController|onImportCover", { effectId });
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    const res = await this.importFromJSONDialog(cover);
    if ( !res || res.type === "error" || res === "cancel" ) return;
    await cover.fromJSON(res);
    this.rerender();
  }

  /**
   * Handle clicks on the export cover menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  onExportCover(effectId) {
    log("CoverEffectsController|onExportCover", { effectId });
    const cover = CONFIG[MODULE_ID].Cover._instances.get(effectId);
    const data = cover.toJSON();

    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      tokencoverVersion: game.modules.get(MODULE_ID).version
    };
    const filename = `${MODULE_ID}_${cover.name}`;
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
  }

  /**
   * Handle duplicating an effect.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDuplicateCover(effectId) {
    log("CoverEffectsController|onDuplicate", { effectId });
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    await cover.duplicate();
    this.rerender();
  }

  // ----- NOTE: Drag / Drop ----- //

  canDragStart(_event) {
    return game.user.role >= CONST.USER_ROLES.ASSISTANT;
  }

  canDragDrop(_event) {
    return game.user.role >= CONST.USER_ROLES.ASSISTANT;
  }


  /**
   * Handles starting the drag for effect items
   * For non-nested effects, populates the dataTransfer with Foundry's expected
   * ActiveEffect type and data to make non-nested effects behave as core does
   * @param {DragEvent} event - event that corresponds to the drag start
   */
  onDragStart(event) {
    log(`CoverEffectsController|onEffectDragStart for ${event.target.dataset.entryName}`);
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(event.target.dataset.entryId);
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify(cover.toDragData())
    );
  }


  /**
   * Callback actions which occur when a dragged element is dropped on a target.
   * @param {DragEvent} event       The originating DragEvent
   */
  async onEffectDrop(event) {
    log("CoverEffectsController|onEffectDrop");
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    await CONFIG[MODULE_ID].CoverEffect._processEffectDrop(data);
    this.rerender();
  }

  /**
   * Callback actions which occur when a dragged element is dragged over a target.
   * @param {DragEvent} event       The originating DragEvent
   */
  async onDragOver(_event) { return; } /* eslint-disable-line no-useless-return */

  // ----- NOTE: Sub-Dialogs ----- //

  /**
   * Open a dialog to import data into a cover.
   * @param {UniqueActiveEffect} cover    The cover for which to overwrite
   * @returns {string|"close"|null} The json from the imported text file. "close" if close button hit;
   *                                null if dialog closed.
   */
  async importFromJSONDialog(_cover) {
    // See https://github.com/DFreds/dfreds-convenient-effects/blob/c2d5e81eb1d28d4db3cb0889c22a775c765c24e3/scripts/effects/custom-effects-handler.js#L156
    const hint1 = game.i18n.localize(`${MODULE_ID}.coverbook.import-cover-description`);
    const content = await renderTemplate("templates/apps/import-data.hbs", { hint1 }); // Skip hint2.
    const dialogConfig = {
      window: { title: game.i18n.localize(`${MODULE_ID}.coverbook.import-cover`) },
      position: { width: 400 },
      content,
      buttons: [{
        action: "import",
        icon: '<i class="fas fa-file-import"></i>',
        label: game.i18n.localize("SIDEBAR.Import"),
        default: true,
        callback: async (event, button, _dialog) => {
          const form = button.form;
          if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
          const json = await readTextFromFile(form.data.files[0]);
          log("importFromJSONDialog|Read text");
          return json;
        }
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("Cancel"),
      }],
    };
    return foundry.applications.api.DialogV2.wait(dialogConfig);
  }
}
