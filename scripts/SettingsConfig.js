/* globals
game,
renderTemplate
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, DOCUMENTATION_URL, ISSUE_URL } from "./const.js";
import { SETTINGS, Settings } from "./settings.js";

// Patches for the VisionSource class
export const PATCHES = {};
PATCHES.BASIC = {};


// ----- NOTE: Hooks ----- //

/**
 * Settings manipulations to hide unneeded settings
 * Wipe the settings cache on update
 * @param {Application} application     The Application instance being rendered
 * @param {jQuery} html                 The inner HTML of the document that will be displayed and may be modified
 * @param {object} data                 The object of data used when rendering the application
 */
async function renderSettingsConfig(app, html, data) {
  const settings = html.find(`section[data-tab="${MODULE_ID}"]`);
  if ( !settings || !settings.length ) return;

  const template = `modules/${MODULE_ID}/templates/settings-buttons.html`;
  const myHTML = await renderTemplate(template, data);
  settings.last().children().last().after(myHTML);
  app.setPosition(app.position);

  activateListenersSettingsConfig(app, html);

  const TARGET = SETTINGS.LOS.TARGET;
  const centerOnly = Settings.get(TARGET.POINT_OPTIONS.NUM_POINTS) === SETTINGS.POINT_TYPES.CENTER
    && Settings.get(TARGET.ALGORITHM) === TARGET.TYPES.POINTS;
  app._coverAlgorithmChanged(centerOnly);
}

/**
 * Update setting hook.
 * Wipe cache on update.
 */
function updateSetting(setting, _changes, _options, _userId) {
  const [module, key] = setting.key.split(".");
  if ( module === MODULE_ID ) Settings.cache.delete(key);
}

PATCHES.BASIC.HOOKS = { renderSettingsConfig, updateSetting };

// ----- NOTE: Method ----- //
/**
 * Update visibility of cover percentages based on the current cover points and algorithm.
 * @param {string} coverAlgorithm
 * @param {string} numPoints
 */
function _coverAlgorithmChanged(centerOnly) {
  const COVER = SETTINGS.COVER;
  const [displayCoverTriggers, displayCenterCoverTrigger] = centerOnly
    ? ["none", "block"] : ["block", "none"];
  const inputCenter = document.getElementsByName(`${MODULE_ID}.${COVER.TRIGGER_CENTER}`);
  const inputLow = document.getElementsByName(`${MODULE_ID}.${COVER.TRIGGER_PERCENT.LOW}`);
  const inputMedium = document.getElementsByName(`${MODULE_ID}.${COVER.TRIGGER_PERCENT.MEDIUM}`);
  const inputHigh = document.getElementsByName(`${MODULE_ID}.${COVER.TRIGGER_PERCENT.HIGH}`);

  const divInputCenter = inputCenter[0].parentElement.parentElement;
  const divInputLow = inputLow[0].parentElement.parentElement;
  const divInputMedium = inputMedium[0].parentElement.parentElement;
  const divInputHigh = inputHigh[0].parentElement.parentElement;

  divInputCenter.style.display = displayCenterCoverTrigger;
  divInputLow.style.display = displayCoverTriggers;
  divInputMedium.style.display = displayCoverTriggers;
  divInputHigh.style.display = displayCoverTriggers;
}

PATCHES.BASIC.METHODS = { _coverAlgorithmChanged };

// ----- NOTE: Helper functions ----- //

function activateListenersSettingsConfig(app, html) {
  // Documentation button
  html.find(`[name="${MODULE_ID}-button-documentation"]`).click(openDocumentation.bind(app));
  html.find(`[name="${MODULE_ID}-button-issue"]`).click(openIssue.bind(app));
}

function openDocumentation(event) {
  event.preventDefault();
  event.stopPropagation();
  window.open(DOCUMENTATION_URL, "_blank");
}

function openIssue(event) {
  event.preventDefault();
  event.stopPropagation();
  window.open(ISSUE_URL, "_blank");
}
