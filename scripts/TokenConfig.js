/* globals
foundry
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for Token configuration rendering.

import { MODULE_ID, TEMPLATES, FLAGS, COVER } from "./const.js";
import { injectConfiguration } from "./util.js";

export const PATCHES = {};
PATCHES.BASIC = {};

async function renderTokenConfigHook(app, html, data) {
  const template = TEMPLATES.TOKEN_CONFIG;
  const findString = "div[data-tab='character']:last";
  addTokenConfigData(app, data);
  await injectConfiguration(app, html, data, template, findString);
}

function addTokenConfigData(app, data) {
  data.object.flags ??= {};
  data.object.flags[MODULE_ID] ??= {};
  data.object.flags[MODULE_ID][FLAGS.COVER.MAX_GRANT] ??= COVER.MAX;

  const renderData = {};
  renderData[MODULE_ID] = {
    coverChoices: {
      0: "tokencover.cover.None",
      1: "tokencover.cover.Low",
      2: "tokencover.cover.Medium",
      3: "tokencover.cover.High",
      4: "tokencover.cover.Total"
    }
  };
  foundry.utils.mergeObject(data, renderData, {inplace: true});
}

PATCHES.BASIC.HOOKS = {
  renderTokenConfig: renderTokenConfigHook
};
