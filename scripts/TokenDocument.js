/* globals
canvas,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { CoverType } from "./CoverType.js";

// Patches for the TokenDocument class

export const PATCHES = {};
PATCHES.BASIC = {};

/**
 * Wrap TokenDocument.prototype._initialize
 * Monitor for changes to the effects array.
 * Put back any tokencover icons after the reset.
 */
function _initialize(wrapped) {
  const coverTypeIcons = new Set(CoverType.coverObjectsMap.values().map(ct => ct.config.icon));
  const iconsToAdd = this.effects.filter(e => coverTypeIcons.has(e));
  wrapped();
  if ( iconsToAdd.length ) this.effects.push(...iconsToAdd);
}

PATCHES.BASIC.WRAPS = { _initialize };
