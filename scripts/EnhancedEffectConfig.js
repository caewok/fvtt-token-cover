/* globals
ActiveEffectConfig,
CONST,
game,
ActiveEffect
*/

import { Settings } from "./Settings.js";

// Adapted from https://github.com/death-save/combat-utility-belt/blob/master/modules/enhanced-conditions/enhanced-effect-config.js
// @example
// effectConfig = new EnhancedEffectConfig(effect)
// effectConfig.render(true)

class EnhancedEffectConfig extends ActiveEffectConfig {
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
}

export class LowCoverEffectConfig extends EnhancedEffectConfig {
  /**
   * Force the constructor to use the low cover setting.
   */
  constructor() {
    super();

    const data = Settings.getCoverEffect("LOW");
    this.object = new ActiveEffect(data);
  }

  /**
   * Override default submission behavior to save the low cover values.
   */
  async _onSubmit(...args) {
    await super._onSubmit(...args);
    const data = this.object.toJSON();
    await Settings.setCoverEffect("LOW", data);
  }
}

export class MediumCoverEffectConfig extends EnhancedEffectConfig {
  /**
   * Force the constructor to use the low cover setting.
   */
  constructor() {
    super();

    const data = Settings.getCoverEffect("MEDIUM");
    this.object = new ActiveEffect(data);
  }

  /**
   * Override default submission behavior to save the low cover values.
   */
  async _onSubmit(...args) {
    await super._onSubmit(...args);
    const data = this.object.toJSON();
    await Settings.setCoverEffect("MEDIUM", data);
  }
}

export class HighCoverEffectConfig extends EnhancedEffectConfig {
  /**
   * Force the constructor to use the low cover setting.
   */
  constructor() {
    super();

    const data = Settings.getCoverEffect("HIGH");
    this.object = new ActiveEffect(data);
  }

  /**
   * Override default submission behavior to save the low cover values.
   */
  async _onSubmit(...args) {
    await super._onSubmit(...args);
    const data = this.object.toJSON();
    await Settings.setCoverEffect("HIGH", data);
  }
}
