/* globals
game
*/

"use strict";

import { log } from "./util.js";
import { MODULE_ID } from "./const.js";

export function getSetting(settingName) { return game.settings.get(MODULE_ID, settingName); }
export async function setSetting(settingName, value) {
  return await game.settings.set(MODULE_ID, settingName, value);
}

export const SETTINGS = {
  PERCENT_AREA: "percent-area",
  BOUNDS_SCALE: "bounds-scale",
  USE_MODULE: "use-module",
};

export function registerSettings() {
  log("Registering token visibility settings.");

  game.settings.register(MODULE_ID, SETTINGS.PERCENT_AREA, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.PERCENT_AREA}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.PERCENT_AREA}.Hint`),
    range: {
      max: 1,
      min: 0,
      step: 0.1
    },
    scope: "world",
    config: true,
    default: 0,
    type: Number
  });

  game.settings.register(MODULE_ID, SETTINGS.BOUNDS_SCALE, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.BOUNDS_SCALE}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.BOUNDS_SCALE}.Hint`),
    range: {
      max: 2,
      min: 0.1,
      step: 0.1
    },
    scope: "world",
    config: true,
    default: 1,
    type: Number
  });

  game.settings.register(MODULE_ID, SETTINGS.USE_MODULE, {
    scope: "world",
    config: false,
    default: true,
    type: Boolean
  });

  log("Done registering settings.");
}

