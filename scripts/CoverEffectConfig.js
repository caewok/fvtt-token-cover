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
    // This.coverEffect = coverEffect;
    // this.object = coverEffect.createActiveEffect();
  }

  /**
   * Get data for template rendering
   * @param {*} options
   * @inheritdoc
   */
  getData(options) {
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
}
