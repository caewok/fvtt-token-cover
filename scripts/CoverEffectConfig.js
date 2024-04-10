/* globals
ActiveEffectConfig,
CONST,
game,
ActiveEffect
*/

import { Settings } from "./settings.js";

// Adapted from https://github.com/death-save/combat-utility-belt/blob/master/modules/enhanced-conditions/enhanced-effect-config.js
// @example
// effectConfig = new EnhancedEffectConfig(effect)
// effectConfig.render(true)

export class CoverEffectConfig extends ActiveEffectConfig {
  /**
   * Force the constructor to use the cover setting.
   */
  constructor() {
    super();

    let data = { name: "New Cover Effect" };
    const id = this.options.coverEffectId;
    if ( id ) {
      const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
      const statusEffects = allStatusEffects[game.system.id] || allStatusEffects.generic;
      if ( Object.hasOwn(statusEffects, id) ) data = { ...statusEffects[id] };
    }
    this.object = new ActiveEffect(data);
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
    this.object.updateSource(formData);
    if (this._state === 2) await this.render();
  }

  /**
   * Override default submission behavior to save the cover values.
   */
  async _onSubmit(...args) {
    await super._onSubmit(...args);
    const data = this.object.toJSON();
    const allStatusEffects = Settings.get(Settings.KEYS.COVER.EFFECTS);
    let systemId = game.system.id;
    if ( (systemId === "dnd5e" || systemId === "sw5e")
      && game.modules.get("midi-qol")?.active ) systemId = `${systemId}_midiqol`;

    if ( !Object.hasOwn(allStatusEffects, systemId) ) allStatusEffects[systemId] = duplicate(allStatusEffects.generic);

    allStatusEffects[systemId][type] = value;
    await this.set(SETTINGS.COVER.EFFECTS, allStatusEffects);

    await Settings.setCoverEffect("MEDIUM", data);
  }
}