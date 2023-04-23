/* globals
Hooks,
game,
Dialog
*/
"use strict";

import { MODULE_ID, MODULES_ACTIVE, COVER_TYPES, DEBUG, IGNORES_COVER_HANDLER, setCoverIgnoreHandler } from "./const.js";

// Hooks and method registration
import { registerGeometry } from "./geometry/registration.js";

import { targetTokenHook, combatTurnHook, dnd5ePreRollAttackHook, midiqolPreambleCompleteHook } from "./cover.js";
import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";
import { registerSettings, getSetting, setSetting, SETTINGS, updateConfigStatusEffects, settingsCache } from "./settings.js";
import { registerElevationAdditions } from "./elevation.js";

// Rendering configs
import { renderDrawingConfigHook } from "./renderDrawingConfig.js";

// Debugging
import { Draw } from "./geometry/Draw.js";

// For API
import * as bench from "./benchmark.js";
import * as util from "./util.js";

import { PlanePoints3d } from "./PlaceablesPoints/PlanePoints3d.js";
import { TokenPoints3d } from "./PlaceablesPoints/TokenPoints3d.js";
import { DrawingPoints3d } from "./PlaceablesPoints/DrawingPoints3d.js";
import { WallPoints3d } from "./PlaceablesPoints/WallPoints3d.js";
import { TilePoints3d } from "./PlaceablesPoints/TilePoints3d.js";
import { VerticalPoints3d } from "./PlaceablesPoints/VerticalPoints3d.js";
import { HorizontalPoints3d } from "./PlaceablesPoints/HorizontalPoints3d.js";

import { Area3d } from "./Area3d.js";
import { Area2d } from "./Area2d.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

import * as los from "./visibility_los.js";

// Ignores Cover
import {
  IgnoresCover,
  IgnoresCoverSimbuls,
  IgnoresCoverDND5e,
  addDND5eCoverFeatFlags } from "./IgnoresCover.js";

// Other self-executing hooks
import "./changelog.js";

Hooks.once("init", async function() {
  registerGeometry();

  registerElevationAdditions();
  registerLibWrapperMethods();
  patchHelperMethods();
  addDND5eCoverFeatFlags();

  game.modules.get(MODULE_ID).api = {
    bench,
    Area2d,
    Area3d,
    util,
    CoverCalculator,
    COVER_TYPES,
    ConstrainedTokenBorder,
    los,
    PlanePoints3d,
    TokenPoints3d,
    DrawingPoints3d,
    WallPoints3d,
    TilePoints3d,
    VerticalPoints3d,
    HorizontalPoints3d,
    IGNORES_COVER_HANDLER,
    setCoverIgnoreHandler,

    IgnoresCoverClasses: {
      IgnoresCover,
      IgnoresCoverDND5e,
      IgnoresCoverSimbuls
    },

    debug: DEBUG
  };

  registerSystemHooks();
});

Hooks.once("setup", async function() {
  registerSettings();
  updateConfigStatusEffects();

  // Replace topZ method for tokens
  // Do this here so that it can override method from other modules, like EV.
  Object.defineProperty(Token.prototype, "topE", {
      get: tokenTopElevation,
      configurable: true
  });
});


/**
 * Top elevation of a token.
 * @returns {number} In grid units.
 * If Wall Height is active, use the losHeight. Otherwise, use bottomE.
 * Returns half the height if the token is prone.
 */
function tokenTopElevation() {
  const e = this.bottomE;
  if ( !MODULES_ACTIVE.WALL_HEIGHT ) return e;

  const proneStatusId = getSetting(SETTINGS.COVER.LIVE_TOKENS.ATTRIBUTE);
  const isProne = (proneStatusId !== "" && this.actor)
    ? this.actor.effects.some(e => e.getFlag("core", "statusId") === proneStatusId) : false;

  const height = this.losHeight - e;
  return isProne ? e + (height * 0.5) : this.losHeight;
}

/**
 * Tell DevMode that we want a flag for debugging this module.
 * https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
 */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});

function registerSystemHooks() {
  util.log(`Game system is ${game.system.id}`);
  if ( game.system.id !== "pf2e" ) {
    /**
     * Hook whenever a token is targeted or un-targeted.
     */
    Hooks.on("targetToken", targetTokenHook);

    /**
     * Hook any change in combat turn.
     */
    Hooks.on("combatTurn", combatTurnHook);
  }

  if ( game.system.id === "dnd5e" ) {
    /**
     * For dnd5e, hook the attack roll to set cover.
     */
    Hooks.on("dnd5e.preRollAttack", dnd5ePreRollAttackHook);

    /**
     * For midi, let GM or user decide on cover options. Or automatic.
     */
    Hooks.on("midi-qol.preambleComplete", midiqolPreambleCompleteHook);
  }
}

/**
 * A hook event that fires for every Document type after conclusion of an update workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "updateActor".
 * This hook fires for all connected clients after the update has been processed.
 *
 * @event updateDocument
 * @category Document
 * @param {Document} document                       The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
Hooks.on("updateToken", updateTokenHook);

/**
 * If the token moves, clear all debug drawings.
 */
function updateTokenHook(document, change, options, userId) { // eslint-disable-line no-unused-vars
  if ( Object.hasOwn(change, "x")
    || Object.hasOwn(change, "y")
    || Object.hasOwn(change, "elevation") ) {

    if ( DEBUG.once || DEBUG.range || DEBUG.area || DEBUG.cover || DEBUG.los ) {
      Draw.clearDrawings();

      if ( DEBUG.once ) {
        DEBUG.range = false;
        DEBUG.area = false;
        DEBUG.cover = false;
        DEBUG.los = false;
        DEBUG.once = false;
      }
    }
  }
}

/**
 * Add controls to the measured template configuration
 */
Hooks.on("renderDrawingConfig", renderDrawingConfigHook);


/**
 * Wipe the settings cache on update
 */
Hooks.on("updateSetting", updateSettingHook);

function updateSettingHook(document, change, options, userId) {  // eslint-disable-line no-unused-vars
  const [module, ...arr] = document.key.split(".");
  const key = arr.join("."); // If the key has periods, multiple will be returned by split.
  if ( module === MODULE_ID && settingsCache.has(key) ) settingsCache.delete(key);
}

/**
 * A hook event that fires whenever an Application is rendered. Substitute the
 * Application name in the hook event to target a specific Application type, for example "renderMyApplication".
 * Each Application class in the inheritance chain will also fire this hook, i.e. "renderApplication" will also fire.
 * The hook provides the pending application HTML which will be added to the DOM.
 * Hooked functions may modify that HTML or attach interactive listeners to it.
 *
 * @event renderApplication
 * @category Application
 * @param {Application} application     The Application instance being rendered
 * @param {jQuery} html                 The inner HTML of the document that will be displayed and may be modified
 * @param {object} data                 The object of data used when rendering the application
 */
Hooks.on("renderSettingsConfig", renderSettingsConfigHook);

/**
 * Register listeners when the settings config is opened.
 */
function renderSettingsConfigHook(application, html, data) {
  util.log("SettingsConfig", application, html, data);

  const tvSettings = html.find(`section[data-tab="${MODULE_ID}"]`);
  if ( !tvSettings || !tvSettings.length ) return;

  const losAlgorithm = getSetting(SETTINGS.LOS.ALGORITHM);
  const coverAlgorithm = getSetting(SETTINGS.COVER.ALGORITHM);

  const displayArea = losAlgorithm === SETTINGS.LOS.TYPES.POINTS ? "none" : "block";
  const inputLOSArea = tvSettings.find(`input[name="${MODULE_ID}.${SETTINGS.LOS.PERCENT_AREA}"]`);
  const divLOSArea = inputLOSArea.parent().parent();
  divLOSArea[0].style.display = displayArea;

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
