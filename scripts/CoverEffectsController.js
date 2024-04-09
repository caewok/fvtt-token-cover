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
import { MODULE_ID } from "./const.js";
import { COVER } from "./cover_types.js";
import { log } from "./util.js";
import { coverTypes as dnd5eCoverTypes } from "./coverDefaults/dnd5e.js";
import { coverTypes as pf2eCoverTypes } from "./coverDefaults/pf2e.js";
import { coverTypes as sfrpgCoverTypes } from "./coverDefaults/sfrpg.js";
import { coverTypes as genericCoverTypes } from "./coverDefaults/generic.js";


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
    const effects = importCoverEffectData();
    return {
      isGM: game.user.isGM,
      effects: effects.map(e => {
        return {
          name: e.name,
          id: e.id ?? e.name,
          icon: e.icon
        }
      })
    };
  }

  /**
   * Handles clicks on the list cover types button.
   * Displays a mini-configuration that lists all cover types, allows for quick editing.
   */
  async onListCoverTypes() {
    log("CoverEffectsController|onListCoverTypes");
    //new CoverTypesListConfig().render(true);
  }

  /**
   * Handles clicks on the create effect button
   * @param {MouseEvent} event
   */
  async onCreateEffectClick(_event) {
    log("CoverEffectsController|onCreateEffectClick");
    const terrain = new Terrain();
    await terrain.initialize();
    this._viewMvc.render();
    terrain.activeEffect.sheet.render(true);
  }


}



function importCoverEffectData() {
//     api = game.modules.get("tokencover").api
//     Settings = api.Settings;
  const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
  const statusEffects = allStatusEffects[game.system.id] || allStatusEffects.generic;
  return Object.values(statusEffects);
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


