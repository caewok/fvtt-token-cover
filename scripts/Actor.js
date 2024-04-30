/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { MODULE_ID, FLAGS } from "./const.js";
import { log } from "./util.js";

// Patches for the TokenDocument class

export const PATCHES = {};
PATCHES.BASIC = {};

/**
 * Wrap Actor.prototype._initialize
 * Monitor for changes to the effects array.
 * Put back any tokeneffects after the reset.
 */
function _initialize(wrapped) {
  const coverEffects = this.effects
    ? [...this.effects.values()
      .filter(ae => ae.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID))] : [];
  log(`Actor#_initialize|${this.name} ${coverEffects.length} cover effects`);
  wrapped();
//   coverEffects.forEach(ce => this.effects.set(ce.id, ce));
}

PATCHES.BASIC.WRAPS = { _initialize };
