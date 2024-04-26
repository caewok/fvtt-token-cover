/* globals
canvas,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the TokenDocument class

import { MODULE_ID } from "./const.js";

export const PATCHES = {};
PATCHES.BASIC = {};

/**
 * Wrap TokenDocument.prototype._initialize
 * Monitor for changes to the effects array.
 * Put back any tokencover icons after the reset.
 */
function _initialize(wrapped) {
  const coverTypeIcons = new Set(CONFIG[MODULE_ID].CoverType.coverObjectsMap.values().map(ct => ct.icon));
  const iconsToAdd = this.effects ? this.effects.filter(e => coverTypeIcons.has(e)) : [];
  wrapped();
  if ( iconsToAdd.length ) this.effects.push(...iconsToAdd);
}

PATCHES.BASIC.WRAPS = { _initialize };
