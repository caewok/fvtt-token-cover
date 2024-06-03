/* globals
CONFIG
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
  // Avoid potential error if the objects map has not been created.
//   const coMap = CONFIG[MODULE_ID]?.CoverEffect?.coverObjectsMap;
//   if ( !coMap ) return wrapped();
//   const coverTypeIcons = new Set([...coMap.values()].map(ct => ct.img));
//   const iconsToAdd = this.effects ? this.effects.filter(e => coverTypeIcons.has(e)) : [];
  wrapped();
//   if ( iconsToAdd.length ) this.effects.push(...iconsToAdd);
}

PATCHES.BASIC.WRAPS = { _initialize };
