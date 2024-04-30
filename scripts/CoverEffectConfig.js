/* globals
ActiveEffectConfig,
CONST,
foundry,
game
*/

import { MODULE_ID, FLAGS } from "./const.js";

// Adapted from https://github.com/death-save/combat-utility-belt/blob/master/modules/enhanced-conditions/enhanced-effect-config.js
// @example
// effectConfig = new EnhancedEffectConfig(effect)
// effectConfig.render(true)

export class CoverEffectConfig extends ActiveEffectConfig {
  /** @type {CoverEffect} */
  coverEffect;

  /**
   * Force the constructor to use the cover setting.
   */
  constructor(coverEffect, opts = {}) {
    super(opts);
    this.object = coverEffect;
    // this.coverEffect = coverEffect;
    // this.object = coverEffect.createActiveEffect();
  }

  /**
   * Get data for template rendering
   * @param {*} options
   * @inheritdoc
   */
  getData(options) { // eslint-disable-line no-unused-vars
    const effect = this.object.toObject();

    return {
      effect: effect, // Backwards compatibility
      data: this.object.toObject(),
      // Manually set effect type
      isActorEffect: true,
      isItemEffect: false,
      submitText: "EFFECT.Submit",
      modes: Object.entries(CONST.ACTIVE_EFFECT_MODES).reduce((obj, e) => {
        obj[e[1]] = game.i18n.localize(`EFFECT.MODE_${e[0]}`);
        return obj;
      }, {})
    };
  }

  /**
   * Override default update object behaviour
   * @param {*} formData
   * @override
   */
  async _updateObject(event, formData) {
    // Record the checked cover types in the flags.
    formData.flags ??= {};
    formData.flags[MODULE_ID] ??= {};
    const coverTypes = formData.flags[MODULE_ID][FLAGS.COVER_TYPES] = [];
    for ( const [key, selected] of Object.entries(foundry.utils.flattenObject(formData.coverTypeCheckBoxes)) ) {
      if ( selected ) coverTypes.push(key);
    }
    delete formData.coverTypeCheckBoxes;

    // Update the object.
    this.object.updateSource(formData);
    if (this._state === 2) await this.render();
  }

  /**
   * Override default submission behavior to save the cover values.
   */
//   async _onSubmit(...args) {
//     await super._onSubmit(...args);

//     // Update the CoverEffect.
//     this.coverEffect.update(this.object.toJSON());
//
//     // Store to settings.
//     this.coverEffect.save();

//     const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
//     let systemId = game.system.id;
//     if ( (systemId === "dnd5e" || systemId === "sw5e")
//       && game.modules.get("midi-qol")?.active ) systemId = `${systemId}_midiqol`;
//
//     if ( !Object.hasOwn(allStatusEffects, systemId) ) allStatusEffects[systemId] = duplicate(allStatusEffects.generic);
//
//     const coverEffectId = this.options.coverEffectId
//     allStatusEffects[systemId][coverEffectId] = this.object.toJSON();;
//     await Settings.set(Settings.KEYS.COVER.EFFECTS, allStatusEffects);
//   }
}