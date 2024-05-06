/* globals
CONFIG,
CONST,
Dialog,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { log, dialogPromise } from "./util.js";
import { CoverTypesListConfig } from "./CoverTypesListConfig.js";


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
    CONFIG[MODULE_ID].CoverEffect.coverObjectsMap.forEach(ce => effects.push({ name: ce.name, id: ce.id, icon: ce.icon }));
    return {
      isGM: game.user.isGM,
      effects
    };
  }

  /**
   * Handles clicks on the list cover types button.
   * Displays a mini-configuration that lists all cover types, allows for quick editing.
   */
  async onListCoverTypes(_event) {
    log("CoverEffectsController|onListCoverTypes");
    new CoverTypesListConfig().render(true);
  }

  /**
   * Handles clicks on the reset cover types button.
   * Displays a confirmation and then resets.
   */
  async onResetToDefaults(_event) {
    log("CoverEffectsController|onResetToDefaults");
    const view = this._viewMvc;
    return Dialog.confirm({
      title: "Reset Cover Effects",
      content:
        "<h4>Are You Sure?</h4><p>This will reset all cover effects to system defaults. This cannot be undone.",
      yes: async () => {
        log("CoverEffectsController|onResetToDefaults yes");
        await CONFIG[MODULE_ID].CoverEffect.resetToDefaults();
        view.render();
      }
    });
  }

  /**
   * Handles clicks on the create effect button
   * @param {MouseEvent} event
   */
  async onCreateCoverEffect(_event) {
    log("CoverEffectsController|onCreateCoverEffect");
    const ce = await CONFIG[MODULE_ID].CoverEffect.create();
    this._viewMvc.render();
    ce.renderConfig();
  }

  /**
   * Handle editing the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onEditCoverEffect(effectItem) {
    log("CoverEffectsController|onEditCoverEffect");
    const ce = coverEffectForListItem(effectItem);
    if ( !ce ) return;
    return ce.renderConfig();
  }

  /**
   * Handle deleting the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDeleteCoverEffect(effectItem) {
    log("CoverEffectsController|onDeleteCoverEffect");
    const ce = coverEffectForListItem(effectItem);
    if ( !ce ) return;

    const view = this._viewMvc;
    return Dialog.confirm({
      title: "Remove Terrain",
      content:
        "<h4>Are You Sure?</h4><p>This will remove the cover effect from all scenes.",
      yes: async () => {
        log("CoverEffectsController|onDeleteCoverEffect yes");
        await ce.delete(true);
        view.render();
      }
    });
  }

  /**
   * Locate the nearest effect in the menu to the click event.
   * @returns {string|undefined} Id of the nearest effect
   */
//   _findNearestEffectId(event) {
//     return $(event.target)
//       .closest("[data-effect-id], .tokencover-effect")
//       .data()?.effectId;
//   }

  /**
   * Handle clicks on the import terrain menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onImportCoverEffect(effectItem) {
    log("CoverEffectsController|onImportCoverEffect");
    const ce = coverEffectForListItem(effectItem);
    if ( !ce ) return;

    // Construct a dialog to enable data import for the item.
    const dialogData = {
      title: "Import Cover Objects",
      content: await renderTemplate("templates/apps/import-data.html", {
        hint1: "You may import a cover object from an exported JSON file.",
        hint2: `This operation will update the cover object ${this.name} and cannot be undone.`
      }),
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import"
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "import"
    };
    const dialogOpts = { width: 400 };
    const res = await dialogPromise(dialogData, dialogOpts);
    if ( res === "Close" || res.buttonKey === "no" ) return;

    // Upload and retrieve the data for the effect.
    const form = res.html.find("form")[0];
    if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
    const json = await readTextFromFile(form.data.files[0]);
    if ( !json ) return;

    // Update the effect and then rerender.
    await ce.fromJSON(json);
    this._viewMvc.render();
  }

  /**
   * Handle clicks on the export terrain menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  onExportCoverEffect(effectItem) {
    log("CoverEffectsController|onExportCoverEffect");
    const ce = coverEffectForListItem(effectItem);
    if ( !ce ) return;
    ce.exportToJSON();
  }

  /**
   * Handle duplicating an effect.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDuplicateCoverEffect(effectItem) {
    log("CoverEffectsController|onDuplicateCoverEffect");
    const ce = coverEffectForListItem(effectItem);
    if ( !ce ) return;

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
    const coverEffectId = event.target.dataset.effectId;
    const ce = CONFIG[MODULE_ID].CoverEffect.coverObjectsMap.get(coverEffectId);

    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify(ce.dragData)
    );
  }

  canDragStart() {
    return game.user.role >= CONST.USER_ROLES.ASSISTANT;
  }
}

// ----- NOTE: Helper functions ----- //

/**
 * Helper to retrieve an effect from an effect item.
 * Throw an error if the effect is not found.
 * @param {jQuery} effectItem - jQuery element representing the effect list item
 * @returns {CoverEffect|undefined}
 */
function coverEffectForListItem(effectItem) {
  const effectId = effectItem.data ? effectItem.data().effectId : effectItem.currentTarget.dataset.effectId;
  const ce = CONFIG[MODULE_ID].CoverEffect.coverObjectsMap.get(effectId);
  if ( !ce ) {
    console.error(`CoverEffectsController#onDeleteCoverEffect|Cover Effect ${effectId} not found.`);
    return;
  }
  return ce;
}
