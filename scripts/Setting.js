/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { settingsCache } from "./settings.js";

// Patches for the Setting class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * Wipe the settings cache on update
 */
function updateSetting(document, change, options, userId) {  // eslint-disable-line no-unused-vars
  const [module, ...arr] = document.key.split(".");
  const key = arr.join("."); // If the key has periods, multiple will be returned by split.
  if ( module === MODULE_ID && settingsCache.has(key) ) settingsCache.delete(key);
}

PATCHES.BASIC.HOOKS = { updateSetting };
