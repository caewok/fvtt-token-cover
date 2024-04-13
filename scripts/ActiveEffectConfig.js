/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverEffectsApp } from "./CoverEffectsApp.js";
import { CoverType } from "./CoverType.js";

export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * Rerender the terrain control app if it is open when the active effect configuration is closed.
 */
function closeActiveEffectConfig(app, _html) {
  if ( !app.object.getFlag(MODULE_ID, FLAGS.COVER_TYPE) ) return;
  CoverEffectsApp.rerender();
}

/**
 * On active effect render, add a dropdown to select the
 * @param {Application} application     The Application instance being rendered
 * @param {jQuery} html                 The inner HTML of the document that will be displayed and may be modified
 * @param {object} data                 The object of data used when rendering the application
 */
async function renderActiveEffectConfig(app, html, data) {
  if ( !app.object.getFlag(MODULE_ID, FLAGS.COVER_TYPES) ) return;

  // Need an array of all status effect names and ids.
  // Then determine from the ae flag which are checked.
  const coverTypes = [];
  const selected = [];
  const currCoverIds = new Set(app.object.getFlag(MODULE_ID, FLAGS.COVER_TYPES) ?? []);
  CoverType.coverObjectsMap.forEach(obj => {
     const checked = currCoverIds.has(obj.id);
     const ct = { id: `coverTypeCheckBoxes.${obj.id}`, name: obj.config.name, checked };
     if ( checked ) selected.push(`coverTypeCheckBoxes.${obj.id}`);
     coverTypes.push(ct);
  });

//   let coverTypes = Object.values(COVER.TYPES).map(ct => {
//     return { key: ct.id, label: ct.name }
//   });
//   coverTypes.unshift({ key: "none", label: "None" });

  const renderData = {};
  renderData[MODULE_ID] = { coverTypes, selected };
  foundry.utils.mergeObject(data, renderData, { inplace: true });

  // Insert the new configuration fields into the active effect config.
  const template = `modules/${MODULE_ID}/templates/active-effect-config.html`;
  const myHTML = await renderTemplate(template, data);
  html.find('.tab[data-tab="details"').last().after(myHTML);
  app.setPosition(app.position);
}

PATCHES.BASIC.HOOKS = { closeActiveEffectConfig, renderActiveEffectConfig };
