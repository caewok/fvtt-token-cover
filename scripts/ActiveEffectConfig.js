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
 * Rerender the terrain control app if it is open when the active effect configuration is closed.
 */
function closeActiveEffectConfig(app, _html) {
  if ( !app.object.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) ) return;
  CoverEffectsApp.rerender();
}

/**
 * On active effect render, add a dropdown to select the
 * @param {Application} application     The Application instance being rendered
 * @param {jQuery} html                 The inner HTML of the document that will be displayed and may be modified
 * @param {object} data                 The object of data used when rendering the application
 */
async function renderActiveEffectConfig(app, html, data) {
  if ( !app.object.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) ) return;

  // Need an array of all status effect names and ids.
  // Then determine from the ae flag which are checked.
  const coverTypes = [];
  const selected = [];
  const currCoverIds = new Set(app.object.getFlag(MODULE_ID, FLAGS.COVER_TYPES) ?? []);
  CONFIG[MODULE_ID].CoverType.coverObjectsMap.forEach(obj => {
     const checked = currCoverIds.has(obj.id);
     const ct = { id: `coverTypeCheckBoxes.${obj.id}`, name: obj.document.name, checked };
     if ( checked ) selected.push(`coverTypeCheckBoxes.${obj.id}`);
     coverTypes.push(ct);
  });

  const renderData = {};
  renderData[MODULE_ID] = { coverTypes, selected };
  foundry.utils.mergeObject(data, renderData, { inplace: true });

  // Insert the new configuration fields into the active effect config.
  const template = `modules/${MODULE_ID}/templates/active-effect-config.html`;
  const myHTML = await renderTemplate(template, data);
  html.find('.tab[data-tab="details"').children().last().after(myHTML);
  app.setPosition(app.position);
}

PATCHES.BASIC.HOOKS = { closeActiveEffectConfig, renderActiveEffectConfig };

/**
 * Update the cover types.
 */
// async function _updateObject(wrapper, _event, formData) {
//   console.log("ActiveEffectConfig#_updateObject");
//   return wrapper(_event, formData);
// }

/**
 * Update the cover types.
 */
function _getSubmitData(wrapper, updateData={}) {
  const data = wrapper(updateData);
  const fd = new FormDataExtended(this.form, {editors: this.editors});
  const coverTypeCheckboxes = Object.entries(fd.object)
    .filter(([key, _value]) => key.includes("coverTypeCheckBoxes"));
  if ( !coverTypeCheckboxes.length ) return data;

  // Add cover types to the flag array.
  data.flags ??= {};
  data.flags[MODULE_ID] ??= {};
  const coverTypes = data.flags[MODULE_ID][FLAGS.COVER_TYPES] ??= [];
  coverTypes.length = 0;
  for ( const [key, value] of coverTypeCheckboxes ) {
    if ( !value ) continue;
    // Strip out the lead name for the key.
    const typeId = key.replace("coverTypeCheckBoxes.", "");
    coverTypes.push(typeId);
  }
  return data;
}



PATCHES.BASIC.WRAPS = { _getSubmitData };
