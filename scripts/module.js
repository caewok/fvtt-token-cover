/* globals
canvas,
CONFIG,
foundry,
game,
Hooks,
loadTemplates,
ui
*/
"use strict";

import { MODULE_ID, FLAGS, COVER, TEMPLATES, setCoverIgnoreHandler, FA_ICONS } from "./const.js";
import { log } from "./util.js";

// Hooks and method registration
import { registerGeometry } from "./geometry/registration.js";
import { initializePatching, PATCHER } from "./patching.js";
import { Settings } from "./settings.js";

// Cover objects
import { CoverEffectsApp } from "./CoverEffectsApp.js";
import { defaultCover } from "./default_cover.js";
import {
  CoverActiveEffect,
  CoverItemEffect,
  CoverFlagEffect,
  CoverDND5E,
  CoverFlagsDND5E,
  CoverPF2E,
  CoverSFRPG } from "./cover_unique_effects.js";

// Regions
import { SetCoverRegionBehaviorType } from "./SetCoverRegionBehaviorType.js";

// For API
import { AlternativeLOS } from "./LOS/AlternativeLOS.js";
import { PointsLOS } from "./LOS/PointsLOS.js";
import { Area2dLOS } from "./LOS/Area2dLOS.js";
import { Area3dLOSGeometric } from "./LOS/Area3dLOSGeometric.js";
import { Area3dLOSWebGL } from "./LOS/Area3dLOSWebGL1.js";
import { Area3dLOSWebGL2 } from "./LOS/Area3dLOSWebGL2.js";
import { Area3dLOSHybrid } from "./LOS/Area3dLOSHybrid.js";
import { OPEN_POPOUTS } from "./LOS/Area3dPopout.js";
import { Token3dGeometry, Wall3dGeometry, DirectionalWall3dGeometry, ConstrainedToken3dGeometry } from "./LOS/Placeable3dGeometry.js";
import { Placeable3dShader, Tile3dShader, Placeable3dDebugShader, Tile3dDebugShader } from "./LOS/Placeable3dShader.js";

import { CoverCalculator } from "./CoverCalculator.js";
import { CoverDialog } from "./CoverDialog.js";

// Ignores Cover
import {
  IgnoresCover,
  IgnoresCoverSimbuls,
  IgnoresCoverDND5e,
  addDND5eCoverFeatFlags } from "./IgnoresCover.js";

// Other self-executing hooks
import "./changelog.js";

Hooks.once("init", function() {
  registerGeometry();
  initializeConfig();
  initializeAPI();
  addDND5eCoverFeatFlags();

  if ( game.system.id === "dnd5e" ) {
    setCoverIgnoreHandler(game.modules.get("simbuls-cover-calculator")?.active ? IgnoresCoverSimbuls : IgnoresCoverDND5e);
  }

  Object.assign(CONFIG.RegionBehavior.dataModels, {
    [`${MODULE_ID}.setCover`]: SetCoverRegionBehaviorType
  });

  CONFIG.RegionBehavior.typeIcons[`${MODULE_ID}.setCover`] = FA_ICONS.MODULE;

  // Must go at end?
  loadTemplates(Object.values(TEMPLATES)).then(_value => log("Templates loaded."));
  loadTemplates(["templates/apps/import-data.html"]); // For settings dialog.
});

Hooks.once("setup", function() {
  Settings.registerAll();
  initializePatching();
  if ( Settings.get(Settings.KEYS.ONLY_COVER_ICONS) ) {
    switch ( game.system.id ) {
      case "dnd5e": CONFIG[MODULE_ID].CoverEffect = CoverFlagsDND5E; break;
      default: CONFIG[MODULE_ID].CoverEffect = CoverFlagEffect; break;
    }
  }
});

/**
 * A hook event that fires when the game is fully ready.
 */
Hooks.on("ready", async function(_canvas) {
  CONFIG[MODULE_ID].CoverEffect.initialize(); // Async. Must wait until ready hook to store Settings for UniqueEffectFlag
});


/**
 * A hook event that fires when the Canvas is ready.
 * @param {Canvas} canvas The Canvas which is now ready for use
 */
Hooks.once("canvasReady", function() {
  transitionTokenMaximumCoverFlags();
  CONFIG[MODULE_ID].CoverEffect.transitionTokens(); // Async
});


// ----- NOTE: Token Controls ----- //

// Add pathfinding button to token controls.
const COVER_EFFECTS_CONTROL = {
  name: Settings.CONTROLS.COVER_EFFECTS,
  title: `${MODULE_ID}.controls.${Settings.CONTROLS.COVER_EFFECTS}.name`,
  icon: FA_ICONS.MODULE,
  button: true,
  onClick: () => { new CoverEffectsApp().render(true); },
  visible: false
};

// Render the cover effects book control if setting enabled.
Hooks.on("getSceneControlButtons", controls => {
  if ( !canvas.scene || !ui.controls.activeControl === "token" ) return;
  const tokenTools = controls.find(c => c.name === "token");
  COVER_EFFECTS_CONTROL.visible = game.user.isGM && Settings.get(Settings.KEYS.DISPLAY_COVER_BOOK);
  if ( game.user.isGM ) tokenTools.tools.push(COVER_EFFECTS_CONTROL);
});


// ----- NOTE: Helper Functions ----- //

/**
 * Initialize the CONFIG for this module, at CONFIG[MODULE_ID].
 * Dynamic settings that may be changed by users or other modules or set by system type.
 */
function initializeConfig() {
  CONFIG[MODULE_ID] = {
    /**
     * Turn on debug logging.
     */
    debug: false,

    /**
     * The percent threshold under which a tile should be considered transparent at that pixel.
     * @type {number}
     */
    alphaThreshold: 0.75,

    /**
     * Size of the render texture (width and height) used in the webGL LOS algorithms.
     * @type {number}
     */
    renderTextureSize: 100,

    /**
     * Resolution of the render texture used in the webZGL LOS algorithm.
     * Should be between (0, 1).
     * @type {number}
     */
    renderTextureResolution: 1,

    /**
     * What cover effect class to use for this system.
     * @type {AbstractUniqueEffect}
     */
    CoverEffect: CoverActiveEffect,

    /**
     * Default terrain jsons
     * @type {string} File path
     */
    defaultCoverJSONs: defaultCover()
  };

  Object.defineProperty(CONFIG[MODULE_ID], "UniqueEffect", {
    get: function() { return this.CoverEffect; }
  });

  switch ( game.system.id ) {
    case "sfrpg":
      CONFIG[MODULE_ID].CoverEffect = CoverSFRPG; break;
    case "pf2e":
      CONFIG[MODULE_ID].CoverEffect = CoverPF2E; break;
  }
}

/**
 * Initialize the API for this module. At game.modules.get(MODULE_ID).api.
 * Provides access to certain classes and functions for debugging and other modules.
 */
function initializeAPI() {
  game.modules.get(MODULE_ID).api = {
    losCalcMethods: {
      AlternativeLOS,
      PointsLOS,
      Area2dLOS,
      Area3dLOSGeometric,
      Area3dLOSWebGL,
      Area3dLOSWebGL2,
      Area3dLOSHybrid
    },

    OPEN_POPOUTS,

    webgl: {
      Token3dGeometry, Wall3dGeometry, DirectionalWall3dGeometry, ConstrainedToken3dGeometry,
      Placeable3dShader, Tile3dShader,
      Placeable3dDebugShader, Tile3dDebugShader
    },

    CoverCalculator,
    CoverDialog,
    COVER,

    // UniqueEffects
    CoverActiveEffect,
    CoverItemEffect,
    CoverFlagEffect,
    CoverDND5E,
    CoverPF2E,
    CoverSFRPG,

    setCoverIgnoreHandler,
    Settings,

    IgnoresCoverClasses: {
      IgnoresCover,
      IgnoresCoverDND5e,
      IgnoresCoverSimbuls
    },

    PATCHER
  };
}


/**
 * Transition token maximum cover flags.
 * Previously was stored by cover type (0 – 4).
 * Now will be a percentage blocked.
 */
function transitionTokenMaximumCoverFlags() {
  const sceneVersion = canvas.scene.getFlag(MODULE_ID, FLAGS.VERSION);
  if ( sceneVersion && !foundry.utils.isNewerVersion("0.6.6", sceneVersion) ) return;
  const v = game.modules.get("tokencover").version;
  canvas.tokens.placeables.forEach(t => {
    const currCoverMax = t.document.getFlag(MODULE_ID, FLAGS.COVER.MAX_GRANT);
    if ( !currCoverMax ) return; // Either 0 or undefined; either is fine.
    let newMax = 1;
    switch ( currCoverMax ) {
      case 1: newMax = 0.5; break;
      case 2: newMax = 0.75; break;
      case 3: newMax = 0.90; break;
      case 4: newMax = 1; break;
    }
    t.document.setFlag(MODULE_ID, FLAGS.COVER.MAX_GRANT, newMax);
    t.document.setFlag(MODULE_ID, FLAGS.VERSION, v);
  });
  canvas.scene.setFlag(MODULE_ID, FLAGS.VERSION, v);
}
