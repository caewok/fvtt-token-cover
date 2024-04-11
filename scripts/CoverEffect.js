/* globals
*/
"use strict";

import { MODULE_ID, FLAGS } from "./const.js";
import { CoverType } from "./CoverType.js";
import { Settings } from "./settings.js";


// See https://stackoverflow.com/questions/42599560/how-can-i-conditionally-choose-a-base-class-for-my-subclass
// Extend the class chosen once the game system is instantiated.
// Otherwise, CoverEffect would always extend the base Foundry ActiveEffect class.

export function ExtendActiveEffect() {

  /**
   * Class to manage cover effects.
   * These are active effects with a few additional properties and methods.
   * Namely, they can be linked to a specific CoverType.
   */
  class CoverEffect extends CONFIG.ActiveEffect.documentClass {
    // ----- NOTE: Static methods ----- //

    /** @type {string} */
    static get systemId() {
      const id = game.system.id;
      if ( (id === "dnd5e" || id === "sw5e")
        && game.modules.get("midi-qol")?.active ) id += "_midiqol";
      return id;
    }

    // ----- NOTE: Getters and other properties ----- //

    /**
     * Identifier used to store this active effect in settings.
     * @type {string}
     */
    get coverIdentifier() { return this.getFlag(MODULE_ID, COVER_EFFECT_ID) ?? foundry.utils.randomID(); }

    /**
     * Retrieve the cover type for this CoverEffect.
     */
    get coverType() {
      const type = this.getFlag(MODULE_ID, FLAGS.COVER_TYPE);
      return CoverType.coverTypesMap.get(type);
    }

    // ----- NOTE: Methods ----- //



    /**
     * Save to the stored setting.
     */
    async saveToSettings() {
      const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
      const systemId = this.constructor.systemId;
      allStatusEffects[systemId] ??= {};
      allStatusEffects[systemId][this.coverIdentifier] = this.toJSON();
    }




  }



  return CoverEffect;
}
