/* globals
CONFIG,
FormDataExtended,
foundry,
renderTemplate
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "./const.js";
import { CoverEffectsApp } from "./CoverEffectsApp.js";

export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * Rerender the cover control app if it is open when the active effect configuration is closed.
 */
function closeActiveEffectConfig(_app, _html) {
  CoverEffectsApp.rerender();
}

/**
 * On active effect render, add a dropdown to select the
 * @param {Application} application     The Application instance being rendered
 * @param {jQuery} html                 The inner HTML of the document that will be displayed and may be modified
 * @param {object} data                 The object of data used when rendering the application
 */
async function renderActiveEffectConfig(app, html, data) {
  if ( app.object.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.TYPE) !== "Cover" ) return;

  // Insert the new configuration fields into the active effect config.
  const template = `modules/${MODULE_ID}/templates/active-effect-config.html`;
  const myHTML = await renderTemplate(template, data);
  html.find('.tab[data-tab="details"').children().last().after(myHTML);
  app.setPosition(app.position);
}

PATCHES.BASIC.HOOKS = { closeActiveEffectConfig, renderActiveEffectConfig };
