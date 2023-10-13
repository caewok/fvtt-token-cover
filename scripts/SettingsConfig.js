/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { SETTINGS, getSetting } from "./settings.js";

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
export function renderSettingsConfig(app, html, _data) {
  const tvSettings = html.find(`section[data-tab="${MODULE_ID}"]`);
  if ( !tvSettings || !tvSettings.length ) return;

  const coverAlgorithm = getSetting(SETTINGS.COVER.ALGORITHM);
  const [displayCoverTriggers, displayCenterCoverTrigger] = coverAlgorithm === SETTINGS.COVER.TYPES.CENTER_CENTER
    ? ["none", "block"] : ["block", "none"];

  const inputCenter = tvSettings.find(`select[name="${MODULE_ID}.${SETTINGS.COVER.TRIGGER_CENTER}"]`);
  const inputLow = tvSettings.find(`input[name="${MODULE_ID}.${SETTINGS.COVER.TRIGGER_PERCENT.LOW}"]`);
  const inputMedium = tvSettings.find(`input[name="${MODULE_ID}.${SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM}"]`);
  const inputHigh = tvSettings.find(`input[name="${MODULE_ID}.${SETTINGS.COVER.TRIGGER_PERCENT.HIGH}"]`);

  const divInputCenter = inputCenter.parent().parent();
  const divInputLow = inputLow.parent().parent();
  const divInputMedium = inputMedium.parent().parent();
  const divInputHigh = inputHigh.parent().parent();

  if ( divInputCenter.length ) divInputCenter[0].style.display = displayCenterCoverTrigger;
  if ( divInputLow.length ) divInputLow[0].style.display = displayCoverTriggers;
  if ( divInputMedium.length ) divInputMedium[0].style.display = displayCoverTriggers;
  if ( divInputHigh.length ) divInputHigh[0].style.display = displayCoverTriggers;
}

PATCHES.BASIC.HOOKS = { renderSettingsConfig };
