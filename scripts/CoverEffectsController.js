/* globals
canvas,
CONST,
Dialog,
game,
SearchFilter
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { Settings } from "./settings.js";
import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { log } from "./util.js";
import { coverTypes as dnd5eCoverTypes } from "./coverDefaults/dnd5e.js";
import { coverTypes as pf2eCoverTypes } from "./coverDefaults/pf2e.js";
import { coverTypes as sfrpgCoverTypes } from "./coverDefaults/sfrpg.js";
import { coverTypes as genericCoverTypes } from "./coverDefaults/generic.js";
import { CoverEffectConfig } from "./CoverEffectConfig.js";
import { CoverTypesListConfig } from "./CoverTypesListConfig.js";
import { CoverEffect } from "./CoverEffect.js";


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
  async onListCoverTypes() {
    log("CoverEffectsController|onListCoverTypes");
    new CoverTypesListConfig().render(true);
  }

  /**
   * Handles clicks on the create effect button
   * @param {MouseEvent} event
   */
  async onCreateCoverEffect(_event) {
    log("CoverEffectsController|onCreateCoverEffect");
    const ce = CONFIG[MODULE_ID].CoverEffect.create();
    await ce.initialize();
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
    await ce.importFromJSONDialog();
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
 * Import active effect for a specific cover effect data from settings.
 * @param {string} id     Id for that cover effect.
 * @returns {ActiveEffect} The active effect
 */
function importCoverEffect(id) {
  const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
  const statusEffects = allStatusEffects[game.system.id] || allStatusEffects.generic;
  const data = statusEffects[id];
  data._id = null;
  data.flags ??= {};
  data.flags[MODULE_ID] ??= {};
  data.flags[MODULE_ID][FLAGS.COVER_TYPE] ??= "";
  return new ActiveEffect(data);
}

function importAllCoverEffectData() {
//     api = game.modules.get("tokencover").api
//     Settings = api.Settings;
  const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
  const statusEffects = allStatusEffects[game.system.id] || allStatusEffects.generic;
  return Object.entries(statusEffects);
}

/**
 * Store to GM settings the cover effect value provided for the provided type for this game system.
 * @param {object} value  Status effect
 */
async function setCoverEffect(type, value) {
  const allStatusEffects = this.get(SETTINGS.COVER.EFFECTS);
  let systemId = game.system.id;
  if ( (systemId === "dnd5e" || systemId === "sw5e")
    && game.modules.get("midi-qol")?.active ) systemId = `${systemId}_midiqol`;

  if ( !Object.hasOwn(allStatusEffects, systemId) ) allStatusEffects[systemId] = duplicate(allStatusEffects.generic);

  allStatusEffects[systemId][type] = value;
  await this.set(SETTINGS.COVER.EFFECTS, allStatusEffects);
  this.updateConfigStatusEffects(type);
}

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
