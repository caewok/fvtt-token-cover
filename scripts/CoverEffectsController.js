/* globals
CONFIG,
CONST,
Dialog,
game,
readTextFromFile,
renderTemplate,
saveDataToFile,
TextEditor,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { log } from "./util.js";


// Much of this is from
// https://github.com/DFreds/dfreds-convenient-effects/blob/main/scripts/app/convenient-effects-controller.js

export class CoverEffectsController {
  /**
   * Initializes the controller and its dependencies
   * @param {TerrainEffectsApp} viewMvc - the app that the controller can interact with
   */
  constructor(viewMvc) { this._viewMvc = viewMvc; }

  /**
   * Configures and returns the data that the app will send to the template
   * @returns {Object} the data to pass to the template
   */
  get data() {
    const effects = [];
    CONFIG[MODULE_ID].CoverEffect._instances.forEach(ce => effects.push({ name: ce.name, id: ce.id, icon: ce.img }));
    return {
      isGM: game.user.isGM,
      effects,
      hasDefaults: Boolean(CONFIG[MODULE_ID].CoverEffect._resetDefaultEffects)
    };
  }

  /**
   * Handles clicks on the create defaults button.
   * Displays a confirmation and then resets.
   */
  async onCreateDefaults(_event) {
    log("CoverEffectsController|onCreateDefaults");
    const view = this._viewMvc;
    return Dialog.confirm({
      title: "Replace Default Cover",
      content:
        "<h4>Are You Sure?</h4><p>This will reset any existing default cover and otherwise add new default cover.",
      yes: async () => {
        log("CoverEffectsController|onCreateDefaultsClick yes");
        await CONFIG[MODULE_ID].CoverEffect._resetDefaultEffects();
        view.render();
      }
    });
  }

  /**
   * Handles clicks on the create effect button
   * @param {MouseEvent} event
   */
  async onCreateEffect(_event) {
    log("CoverEffectsController|onCreate");
    const ce = await CONFIG[MODULE_ID].CoverEffect.create();
    this._viewMvc.render();
    ce.document.sheet.render(true);
  }

  /**
   * Handle editing the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onEdit(effectItem) {
    log("CoverEffectsController|onEdit");
    const effectId = effectItem.data().effectId;
    const ce = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    ce.document.sheet.render(true);
  }

  /**
   * Open a window that allows editing of the flags used on the cover document.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onEditCoverRules(effectItem) {
    log("CoverEffectsController|onEdit");
    const effectId = effectItem.data().effectId;
    const ce = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    ce.renderRulesConfig();
  }

  /**
   * Handle deleting the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDelete(effectItem) {
    log("CoverEffectsController|onDelete");
    const effectId = effectItem.data().effectId;
    const view = this._viewMvc;

    return Dialog.confirm({
      title: "Remove Cover",
      content:
        "<h4>Are You Sure?</h4><p>This will remove the cover effect from all scenes.",
      yes: async () => {
        log("CoverEffectsController|onDeleteCoverEffect yes");
        const ce = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
        await ce.destroy(true);
        view.render();
      }
    });
  }

  /**
   * Handle clicks on the import terrain menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onImport(effectItem) {
    log("CoverEffectsController|onImport");
    const effectId = effectItem.data().effectId;
    const ce = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    await this.importFromJSONDialog(ce, this);
    this._viewMvc.render();
  }

  /**
   * Handle clicks on the export terrain menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  onExport(effectItem) {
    log("CoverEffectsController|onExport");
    const effectId = effectItem.data().effectId;
    const ce = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    const data = ce.toJSON();

    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      terrainMapperVersion: game.modules.get(MODULE_ID).version
    };
    const filename = `${MODULE_ID}_${ce.name}`;
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);

  }

  /**
   * Handle duplicating an effect.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDuplicate(effectItem) {
    log("CoverEffectsController|onDuplicateCoverEffect");
    const effectId = effectItem.data().effectId;
    const ce = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    await ce.duplicate();
    this._viewMvc.render();
  }

  /**
   * Handles starting the drag for effect items
   * For non-nested effects, populates the dataTransfer with Foundry's expected
   * ActiveEffect type and data to make non-nested effects behave as core does
   * @param {DragEvent} event - event that corresponds to the drag start
   */
  onEffectDragStart(event) {
    log(`CoverEffectsController|onEffectDragStart for ${event.target.dataset.effectName}`);
    const ce = CONFIG[MODULE_ID].CoverEffect._instances.get(event.target.dataset.effectId);
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify(ce.toDragData())
    );
  }

  canDragStart() {
    return game.user.role >= CONST.USER_ROLES.ASSISTANT;
  }

  /**
   * Callback actions which occur when a dragged element is dropped on a target.
   * @param {DragEvent} event       The originating DragEvent
   */
  async onEffectDrop(event) {
    log(`TerrainEffectsController|onEffectDrop`);
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    await CONFIG[MODULE_ID].CoverEffect._processEffectDrop(data);
    this._viewMvc.render();
  }


  /**
   * Open a dialog to import data into a terrain.
   * @param {UniqueActiveEffect} terrain    The terrain for which to overwrite
   */
  async importFromJSONDialog(coverEffect, app) {
    // See https://github.com/DFreds/dfreds-convenient-effects/blob/c2d5e81eb1d28d4db3cb0889c22a775c765c24e3/scripts/effects/custom-effects-handler.js#L156
    const content = await renderTemplate("templates/apps/import-data.html", {
      hint1: "You may import cover settings data from an exported JSON file.",
      hint2: "This operation will overwrite this cover effect."
    });

    const importPromise = new Promise((resolve, _reject) => {
      new Dialog({
        title: "Import Cover Setting Data",
        content,
        buttons: {
          import: {
            icon: '<i class="fas fa-file-import"></i>',
            label: "Import",
            callback: async html => {
              const form = html.find("form")[0];
              if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
              const json = await readTextFromFile(form.data.files[0]);
              log("importFromJSONDialog|Read text");
              await coverEffect.fromJSON(json);
              app._viewMvc.render();
              log("importFromJSONDialog|Finished rerender");
              resolve(true);
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "import"
      }, {
        width: 400
      }).render(true);
    });

    return importPromise;
  }

}
