/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS, TEMPLATES, FA_ICONS } from "./const.js";
import { CoverEffectsApp } from "./CoverEffectsApp.js";
import { renderTemplateSync } from "./util.js";

export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

// Hook init to update the PARTS of the light config.
Hooks.once("init", function() {
  const AEConfig = foundry.applications.sheets.ActiveEffectConfig;
  const { footer, ...other } = AEConfig.PARTS;
  AEConfig.PARTS = {
    ...other,
    [MODULE_ID]: {
      template: TEMPLATES.ACTIVE_EFFECT,
      scrollable: [''],
    },
    footer,
  }
  AEConfig.TABS.sheet.tabs.push({
    id: MODULE_ID,
    group: "sheet",
    icon: FA_ICONS.MODULE,
    label: `${MODULE_ID}.name`,
  });
});

/**
 * Rerender the cover control app if it is open when the active effect configuration is closed.
 */
function closeActiveEffectConfig(_app, _html) {
  CoverEffectsApp.rerender();
}

PATCHES.BASIC.HOOKS = { closeActiveEffectConfig };
