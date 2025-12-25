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

/**
 * Add in status effect choices.
 * @param {string} partId                         The part being rendered
 * @param {ApplicationRenderContext} context      Shared context provided by _prepareContext
 * @param {HandlebarsRenderOptions} options       Options which configure application rendering behavior
 * @returns {Promise<ApplicationRenderContext>}   Context data for a specific part
 */
async function _preparePartContext(wrapper, partId, context, options) {
  context = await wrapper(partId, context, options);
  if ( partId !== MODULE_ID ) return context;

  // Add in status effect choices
  context[MODULE_ID] = {
    linkStatusChoices: {},
  };

  // Only allow status to be chosen if it is not already selected by another cover effect.
  const existingStatuses = new Set();
  CONFIG[MODULE_ID].CoverEffect._instances.forEach(ce => {
    if ( ce.document === context.document ) return;
    existingStatuses.add(ce.document.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.LINKED_STATUS));
  })
  CONFIG.statusEffects.forEach(status => {
    if ( existingStatuses.has(status.id) ) return;
    context[MODULE_ID].linkStatusChoices[status.id] = status.name;
  });
  return context;
}


PATCHES.BASIC.WRAPS = { _preparePartContext };