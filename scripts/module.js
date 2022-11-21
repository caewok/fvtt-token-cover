/* globals
Hooks,
game,
Dialog
*/
"use strict";

import { MODULE_ID, COVER_TYPES } from "./const.js";

// Hooks and method registration
import { targetTokenHook, combatTurnHook, dnd5ePreRollAttackHook, midiqolPreambleCompleteHook, addDND5eCoverFeatFlags } from "./cover.js";
import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";
import { registerPIXIPolygonMethods } from "./geometry/PIXIPolygon.js";
import { registerPIXIRectangleMethods } from "./geometry/PIXIRectangle.js";
import { registerSettings, getSetting, setSetting, SETTINGS, updateConfigStatusEffects, settingsCache } from "./settings.js";
import { registerElevationAdditions } from "./elevation.js";
import { Point3d, registerPIXIPointMethods } from "./geometry/Point3d.js";

// Rendering configs
import { renderDrawingConfigHook } from "./renderDrawingConfig.js";

// For API
import * as bench from "./benchmark.js";
import * as drawing from "./drawing.js";
import * as util from "./util.js";

import { Area3d } from "./Area3d.js";
import { Area2d } from "./Area2d.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

import { Plane } from "./geometry/Plane.js";
import { ClipperPaths } from "./geometry/ClipperPaths.js";
import { Shadow } from "./geometry/Shadow.js";
import { Matrix } from "./geometry/Matrix.js";
import { PlanePoints3d } from "./geometry/PlanePoints3d.js";
import { TokenPoints3d } from "./geometry/TokenPoints3d.js";
import { DrawingPoints3d } from "./geometry/DrawingPoints3d.js";
import { WallPoints3d } from "./geometry/WallPoints3d.js";
import { TilePoints3d } from "./geometry/TilePoints3d.js";

import * as los from "./visibility_los.js";

Hooks.once("init", async function() {
  registerElevationAdditions();
  registerPIXIPointMethods();
  registerPIXIRectangleMethods();
  registerLibWrapperMethods();
  patchHelperMethods();
  registerPIXIPolygonMethods();
  addDND5eCoverFeatFlags();

  game.modules.get(MODULE_ID).api = {
    bench,
    drawing,
    Shadow,
    Matrix,
    Point3d,
    Area2d,
    Area3d,
    Plane,
    ClipperPaths,
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
    debug: {
      range: false,
      los: false,
      cover: false,
      area: false,
      once: false
    }
  };

  registerSystemHooks();
});

Hooks.once("setup", async function() {
  registerSettings();
  updateConfigStatusEffects();
});

Hooks.once("ready", async function() {
  if ( !getSetting(SETTINGS.WELCOME_DIALOG.v030) ) {
    Dialog.prompt({
      title: "Alt Token Visibility v0.3.0 Changes!",
      content: `
<p>
Version 0.3.0 of Alternative Token Visibility brings several improvements.
You can read more about the module and report any issues on the  <a href="https://github.com/caewok/fvtt-token-visibility">Git page</a>.
</p>

<p>
Settings allow the GM to permit live or dead tokens to provide cover, or, in the case of dead tokens, half-height cover.
You can also now have tokens ignore cover. For dnd5e, you can set the actor's special feat, just as you can
(and compatible with) <a href="https://github.com/vtt-lair/simbuls-cover-calculator">Simbul's Cover Calculator</a>. For non-dnd5e systems, the "token.ignoresCover" property
controls this.
</p>

<p>
If you want more information on what the Cover algorithm is doing, try the new Macro in the compendium,
"Cover Debug Tester." This will temporarily turn on debug visualization when running the Cover macro.
</p>

<p>
<a href="https://github.com/theripper93/Levels">Levels</a> users now get improved handling of tiles. For Points algorithms or the Area2d algorithm,
transparent tile pixels are ignored, to align with how Levels treats holes in tiles. For the
Area3d algorithm, you will need to use a rectangle, ellipse, or polygon drawing and set the drawing to be a hole
in the drawing configuration.
</p>

<p>
FYI, Area3d is probably the better algorithm choice for Levels users because it considers the 3d view of the scene
from the perspective of the viewing token.
</p>

<p>
<br>
<em>Clicking the button below will make this message no longer display when FoundryVTT loads. If you
want to keep seeing this message, please click the close button above.</em>
</p>
`,
      rejectClose: false,
      callback: () => setSetting(SETTINGS.WELCOME_DIALOG.v030, true)
    });
  }
});

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

    const debug = game.modules.get(MODULE_ID).api.debug;
    if ( debug.once || debug.range || debug.area || debug.cover || debug.los ) {
      drawing.clearDrawings();

      if ( debug.once ) {
        debug.range = false;
        debug.area = false;
        debug.cover = false;
        debug.los = false;
        debug.once = false;
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

  divInputCenter[0].style.display = displayCenterCoverTrigger;
  divInputLow[0].style.display = displayCoverTriggers;
  divInputMedium[0].style.display = displayCoverTriggers;
  divInputHigh[0].style.display = displayCoverTriggers;
}
