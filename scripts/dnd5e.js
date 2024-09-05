/* globals
canvas,
CONFIG,
PIXI,
renderTemplate
*/
"use strict";

import { log } from "./util.js";
import { MODULE_ID, FLAGS, LABELS, TEMPLATES } from "./const.js";

export const PATCHES_dnd5e = {};
PATCHES_dnd5e.dnd5e = {};

// ----- NOTE: Hooks ----- //

/**
 * Hook renderItemSheet5e to add cover configuration options for spells.
 * @param {ItemSheet5e} sheet
 * @param {Object} html
 * @param {Object} data
 */
function renderItemSheet5e(app, html, data) {
  const type = data.item?.type;
  if ( !(type === "spell" || type === "feat") ) return;
  render5eSpellTemplateConfig(app, html, data);
}

/**
 * Inject html to add controls to the measured template configuration:
 * 1. Switch to have the template be blocked by walls.
 *
 * templates/scene/template-config.html
 */
async function render5eSpellTemplateConfig(app, html, data) {
  const detailsTab = html.find(".tab.details");
  if ( !detailsTab || !detailsTab.length ) return;
  const CONFIG = FLAGS.DND5E.SPELL_CONFIG;

  // Add the default flag and localized selections.
  if (typeof data.document.getFlag(MODULE_ID, CONFIG.USE_COVER) === "undefined") {
    data.document.setFlag(MODULE_ID, CONFIG.USE_COVER, CONFIG.CHOICES.NO);
  }
  data[MODULE_ID] ??= {};
  data[MODULE_ID].useCoverOptions = LABELS.DND5E.SPELL_CONFIG.USE_COVER;

  // Insert the html.
  const myHTML = await renderTemplate(TEMPLATES.SPELL_CONFIG_DND5E, data);
  const div = document.createElement("div");
  div.innerHTML = myHTML;
  detailsTab[0].appendChild(div);
}

PATCHES_dnd5e.dnd5e.HOOKS = { renderItemSheet5e };
