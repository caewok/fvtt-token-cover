/* globals
game,
renderTemplate
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
async function renderSettingsConfig(app, html, data) {
  if ( !game.user.isGM ) return;

  const settings = html.find(`section[data-tab="${MODULE_ID}"]`);
  if ( !settings || !settings.length ) return;

  const template = `modules/${MODULE_ID}/templates/settings-buttons.html`;
  const myHTML = await renderTemplate(template, data);
  settings.last().after(myHTML);
  app.setPosition(app.position);

  activateListenersSettingsConfig(app, html);

  const LOS = SETTINGS.LOS;
  const algorithm = getSetting(LOS.ALGORITHM);
  const viewerPoints = getSetting(LOS.VIEWER.NUM_POINTS);
  const targetPoints = getSetting(LOS.POINT_OPTIONS.NUM_POINTS);

  updatePointOptionDisplay(algorithm);
  updateViewerInsetDisplay(viewerPoints);
  updateTargetInsetDisplay(targetPoints, algorithm);
  updateCoverPercentageDisplay(targetPoints, algorithm);
}

PATCHES.BASIC.HOOKS = { renderSettingsConfig };

// ----- NOTE: Helper functions ----- //

function activateListenersSettingsConfig(app, html) {
  html.find(`[name="${MODULE_ID}.${SETTINGS.LOS.ALGORITHM}"]`).change(losAlgorithmChanged.bind(app));
  html.find(`[name="${MODULE_ID}.${SETTINGS.LOS.VIEWER.NUM_POINTS}"]`).change(losViewerPointsChanged.bind(app));
  html.find(`[name="${MODULE_ID}.${SETTINGS.LOS.POINT_OPTIONS.NUM_POINTS}"]`).change(losTargetPointsChanged.bind(app));

  // Reset settings buttons
  html.find(`[name="${MODULE_ID}-${SETTINGS.BUTTONS.PF2E}"]`).click(pf2eSettings.bind(app));
  html.find(`[name="${MODULE_ID}-${SETTINGS.BUTTONS.DND_5E_DMG}"]`).click(dnd5eDMGSettings.bind(app));
  html.find(`[name="${MODULE_ID}-${SETTINGS.BUTTONS.THREE_D}"]`).click(threeDSettings.bind(app));

  // Documentation button
  html.find(`[name="${MODULE_ID}-${SETTINGS.BUTTONS.DOCUMENTATION}"]`).click(documentation.bind(app));
}

function losViewerPointsChanged(event) {
  const viewerPoints = event.target.value;
  updateViewerInsetDisplay(viewerPoints);
}

function updateViewerInsetDisplay(numPoints) {
  const displayInsetOpts = numPoints !== SETTINGS.POINT_TYPES.CENTER ? "block" : "none";
  const elem = document.getElementsByName(`${MODULE_ID}.${SETTINGS.LOS.VIEWER.INSET}`);
  const div = elem[0].parentElement.parentElement;
  div.style.display = displayInsetOpts;
}

function losAlgorithmChanged(event) {
  const losAlgorithm = event.target.value;
  const elem = document.getElementsByName(`${MODULE_ID}.${SETTINGS.LOS.POINT_OPTIONS.NUM_POINTS}`);
  const targetNumPoints = elem[0].value;
  updatePointOptionDisplay(losAlgorithm);
  updateCoverPercentageDisplay(targetNumPoints, losAlgorithm);
}

function updatePointOptionDisplay(losAlgorithm) {
  const displayPointOpts = losAlgorithm === SETTINGS.LOS.TYPES.POINTS ? "block" : "none";
  const PT_OPTS = SETTINGS.LOS.POINT_OPTIONS;
  for ( const opt of Object.values(PT_OPTS) ) {
    const elem = document.getElementsByName(`${MODULE_ID}.${opt}`);
    const div = elem[0].parentElement.parentElement;
    div.style.display = displayPointOpts;
  }

  const numPointsTarget = getSetting(SETTINGS.LOS.POINT_OPTIONS.NUM_POINTS);
  updateTargetInsetDisplay(numPointsTarget, losAlgorithm);
}

function updateCoverPercentageDisplay(targetNumPoints, coverAlgorithm) {
  const targetSinglePoint = coverAlgorithm === SETTINGS.LOS.TYPES.POINTS && targetNumPoints === SETTINGS.POINT_TYPES.CENTER;
  const [displayCoverTriggers, displayCenterCoverTrigger] = targetSinglePoint ? ["none", "block"] : ["block", "none"];

  const inputCenter = document.getElementsByName(`${MODULE_ID}.${SETTINGS.COVER.TRIGGER_CENTER}`)[0];
  const inputLow = document.getElementsByName(`${MODULE_ID}.${SETTINGS.COVER.TRIGGER_PERCENT.LOW}`)[0];
  const inputMedium = document.getElementsByName(`${MODULE_ID}.${SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM}`)[0];
  const inputHigh = document.getElementsByName(`${MODULE_ID}.${SETTINGS.COVER.TRIGGER_PERCENT.HIGH}`)[0];

  const divInputCenter = inputCenter.parentElement.parentElement;
  const divInputLow = inputLow.parentElement.parentElement;
  const divInputMedium = inputMedium.parentElement.parentElement;
  const divInputHigh = inputHigh.parentElement.parentElement;

  if ( divInputCenter.length ) divInputCenter.style.display = displayCenterCoverTrigger;
  if ( divInputLow.length ) divInputLow.style.display = displayCoverTriggers;
  if ( divInputMedium.length ) divInputMedium.style.display = displayCoverTriggers;
  if ( divInputHigh.length ) divInputHigh.style.display = displayCoverTriggers;
}

function losTargetPointsChanged(event) {
  const targetPoints = event.target.value;

  const elem = document.getElementsByName(`${MODULE_ID}.${SETTINGS.LOS.ALGORITHM}`);
  const losAlgorithm = elem[0].value;
  updateTargetInsetDisplay(targetPoints, losAlgorithm);
}

function updateTargetInsetDisplay(numPoints, losAlgorithm) {
  const hasMultiplePoints = losAlgorithm === SETTINGS.LOS.TYPES.POINTS
    && numPoints !== SETTINGS.POINT_TYPES.CENTER;
  const displayInsetOpts = hasMultiplePoints ? "block" : "none";
  const elem = document.getElementsByName(`${MODULE_ID}.${SETTINGS.LOS.POINT_OPTIONS.INSET}`);
  const div = elem[0].parentElement.parentElement;
  div.style.display = displayInsetOpts;
}

function submitSettingUpdates(settings) {
  const formElements = [...this.form.elements];
  for ( const [settingName, settingValue] of Object.entries(settings) ) {
    const key = `${MODULE_ID}.${settingName}`;
    // The following does not work alone but is useful for updating the display options..
    const elem = document.getElementsByName(key);
    elem.value = settingValue;

    const formElem = formElements.find(elem => elem.name === key);
    formElem.value = settingValue;
  }

  const losAlgorithm = document.getElementsByName(`${MODULE_ID}.${SETTINGS.LOS.ALGORITHM}`).value;
  const viewerPoints = document.getElementsByName(`${MODULE_ID}.${SETTINGS.LOS.VIEWER.NUM_POINTS}`);
  const targetPoints = document.getElementsByName(`${MODULE_ID}.${SETTINGS.LOS.POINT_OPTIONS.NUM_POINTS}`);
  updatePointOptionDisplay(losAlgorithm);
  updateViewerInsetDisplay(viewerPoints);
  updateTargetInsetDisplay(targetPoints, losAlgorithm);
}

function pf2eSettings(event) {
  event.preventDefault();
  event.stopPropagation();
  ui.notifications.notify(game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.BUTTONS.PF2E}.Notification`));

  const PT_OPTS = SETTINGS.LOS.POINT_OPTIONS;
  const settings = {
    // Range
    [SETTINGS.RANGE.ALGORITHM]: SETTINGS.POINT_TYPES.NINE,
    [SETTINGS.RANGE.POINTS3D]: false,
    [SETTINGS.RANGE.DISTANCE3D]: false,

    // LOS Viewer
    [SETTINGS.LOS.VIEWER.NUM_POINTS]: SETTINGS.POINT_TYPES.CENTER,
    // Unused: [SETTINGS.LOS.VIEWER.INSET]: 0

    // LOS Target
    [SETTINGS.LOS.ALGORITHM]: SETTINGS.LOS.TYPES.POINTS,
    [SETTINGS.LOS.PERCENT]: 0,
    [SETTINGS.LOS.LARGE_TARGET]: false,

    // LOS Point options
    [PT_OPTS.NUM_POINTS]: SETTINGS.POINT_TYPES.NINE,
    [PT_OPTS.INSET]: 0.75,
    [PT_OPTS.POINTS3D]: false
  };

  submitSettingUpdates.call(this, settings);
}

function dnd5eDMGSettings(event) {
  event.preventDefault();
  event.stopPropagation();
  ui.notifications.notify(game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.BUTTONS.DND_5E_DMG}.Notification`));

  const PT_OPTS = SETTINGS.LOS.POINT_OPTIONS;
  const settings = {
    // Range
    [SETTINGS.RANGE.ALGORITHM]: SETTINGS.POINT_TYPES.NINE,
    [SETTINGS.RANGE.POINTS3D]: false,
    [SETTINGS.RANGE.DISTANCE3D]: false,

    // LOS Viewer
    [SETTINGS.LOS.VIEWER.NUM_POINTS]: SETTINGS.POINT_TYPES.FOUR,
    [SETTINGS.LOS.VIEWER.INSET]: 0,

    // LOS Target
    [SETTINGS.LOS.ALGORITHM]: SETTINGS.LOS.TYPES.POINTS,
    [SETTINGS.LOS.PERCENT]: 0,
    [SETTINGS.LOS.LARGE_TARGET]: true,

    // LOS Point options
    [PT_OPTS.NUM_POINTS]: SETTINGS.POINT_TYPES.FOUR,
    [PT_OPTS.INSET]: 0,
    [PT_OPTS.POINTS3D]: false
  };

  submitSettingUpdates.call(this, settings);
}

function threeDSettings(event) {
  event.preventDefault();
  event.stopPropagation();
  ui.notifications.notify(game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.BUTTONS.THREE_D}.Notification`));

  const settings = {
    // Range
    [SETTINGS.RANGE.ALGORITHM]: SETTINGS.POINT_TYPES.NINE,
    [SETTINGS.RANGE.POINTS3D]: true,
    [SETTINGS.RANGE.DISTANCE3D]: true,

    // LOS Viewer
    [SETTINGS.LOS.VIEWER.NUM_POINTS]: SETTINGS.POINT_TYPES.CENTER,
    // Unused: [SETTINGS.LOS.VIEWER.INSET]: 0,

    // LOS Target
    [SETTINGS.LOS.ALGORITHM]: SETTINGS.LOS.TYPES.AREA3D,
    [SETTINGS.LOS.PERCENT]: 0.2,
    [SETTINGS.LOS.LARGE_TARGET]: true

    // LOS Point options
    // Unused: [PT_OPTS.NUM_POINTS]: SETTINGS.POINT_TYPES.FOUR,
    // Unused: [PT_OPTS.INSET]: 0,
    // Unused: [PT_OPTS.POINTS3D]: false
  };

  submitSettingUpdates.call(this, settings);
}

function documentation(event) {
  window.open(DOCUMENTATION_URL, "_blank");
}

