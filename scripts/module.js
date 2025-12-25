/* globals
canvas,
CONFIG,
foundry,
game,
Hooks,
ui
*/
"use strict";

import { MODULE_ID, FLAGS, COVER, TEMPLATES, setCoverIgnoreHandler, FA_ICONS, OTHER_MODULES } from "./const.js";
import { LOS_CONFIG } from "./LOS/config.js";
import { log } from "./util.js";

// Hooks and method registration
import { registerGeometry } from "./geometry/registration.js";
import { initializePatching, PATCHER } from "./patching.js";
import { Settings } from "./settings.js";
import { getObjectProperty } from "./LOS/util.js";

// Trackers
import {
  TokenGeometryTracker,
  LitTokenGeometryTracker,
  BrightLitTokenGeometryTracker,
  SphericalTokenGeometryTracker, } from "./LOS/placeable_tracking/TokenGeometryTracker.js";
import { WallGeometryTracker } from "./LOS/placeable_tracking/WallGeometryTracker.js";
import { TileGeometryTracker } from "./LOS/placeable_tracking/TileGeometryTracker.js";
import { RegionGeometryTracker } from "./LOS/placeable_tracking/RegionGeometryTracker.js";

// Calculators
import { PercentVisibleCalculatorPoints, DebugVisibilityViewerPoints } from "./LOS/calculators/PointsCalculator.js";
import { PercentVisibleCalculatorGeometric, DebugVisibilityViewerGeometric } from "./LOS/calculators/GeometricCalculator.js";
import { PercentVisibleCalculatorPerPixel, DebugVisibilityViewerPerPixel } from "./LOS/calculators/PerPixelCalculator.js";
import { PercentVisibleCalculatorWebGL2, DebugVisibilityViewerWebGL2 } from "./LOS/calculators/WebGL2Calculator.js";


// Cover objects
import { CoverEffectsApp } from "./CoverEffectsApp.js";
import { defaultCover } from "./default_cover.js";
import {
  CoverActiveEffect,
  CoverItemEffect,
  CoverFlagEffect,
  CoverDND5E,
  CoverFlagsDND5E,
  CoverFlagsPF2E,
  CoverPF2E,
  CoverSFRPG } from "./cover_unique_effects.js";

// Regions
import { SetCoverRegionBehaviorType } from "./SetCoverRegionBehaviorType.js";

// For API
import { OPEN_POPOUTS } from "./LOS/Area3dPopout.js";
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
  foundry.applications.handlebars.loadTemplates(Object.values(TEMPLATES)).then(_value => log("Templates loaded."));
  foundry.applications.handlebars.loadTemplates(["templates/apps/import-data.hbs"]); // For settings dialog.
});

Hooks.once("setup", function() {
  Settings.registerAll();
  initializePatching();
  if ( Settings.get(Settings.KEYS.ONLY_COVER_ICONS) ) {
    switch ( game.system.id ) {
      case "dnd5e": CONFIG[MODULE_ID].CoverEffect = CoverFlagsDND5E; break;
      case "pf2e": CONFIG[MODULE_ID].CoverEffect = CoverFlagsPF2E; break;
      default: CONFIG[MODULE_ID].CoverEffect = CoverFlagEffect; break;
    }
  }
});

/**
 * A hook event that fires when the game is fully ready.
 */
Hooks.once("ready", async function(_canvas) {
  Settings.migrate(); // Cannot be set until world is ready.

  CONFIG[MODULE_ID].CoverEffect.initialize(); // Async. Must wait until ready hook to store Settings for UniqueEffectFlag

  // Only register geometry hooks if ATV is not present.
  if ( !OTHER_MODULES.ATV ) {
    WallGeometryTracker.registerPlaceableHooks();
    TileGeometryTracker.registerPlaceableHooks();
    TokenGeometryTracker.registerPlaceableHooks();
    SphericalTokenGeometryTracker.registerPlaceableHooks();
    LitTokenGeometryTracker.registerPlaceableHooks();
    BrightLitTokenGeometryTracker.registerPlaceableHooks();
    RegionGeometryTracker.registerPlaceableHooks();
  } else {
//     const getterFn = function() {
//       this.tokenvisibility ??= {};
//       return this.tokenvisibility;
//     };
//     const ATV = {};
//     ATV.GETTERS = { [MODULE_ID]: getterFn };
//     const PATCHES = {
//       "foundry.canvas.placeables.Token": ATV,
//       "foundry.canvas.placeables.Wall": ATV,
//       "foundry.canvas.placeables.Tile": ATV,
//       "foundry.canvas.placeables.Region": ATV,
//       "foundry.data.regionShapes.RegionCircleShape": ATV,
//       "foundry.data.regionShapes.RegionEllipseShape": ATV,
//       "foundry.data.regionShapes.RegionRectangleShape": ATV,
//       "foundry.data.regionShapes.RegionPolygonShape": ATV,
//     };
//     PATCHER.addPatchesFromRegistrationObject(PATCHES);
  }

});

/**
 * A hook event that fires when the Canvas is ready.
 * @param {Canvas} canvas The Canvas which is now ready for use
 */
Hooks.once("canvasReady", function() {
  WallGeometryTracker.registerExistingPlaceables();
  TileGeometryTracker.registerExistingPlaceables();
  TokenGeometryTracker.registerExistingPlaceables();
  SphericalTokenGeometryTracker.registerExistingPlaceables();
  LitTokenGeometryTracker.registerExistingPlaceables();
  BrightLitTokenGeometryTracker.registerExistingPlaceables();
  RegionGeometryTracker.registerExistingPlaceables();

  if ( Settings.get(Settings.KEYS.DEBUG.LOS) ) Settings.toggleLOSDebugGraphics(true);

  transitionTokenMaximumCoverFlags();
  CONFIG[MODULE_ID].CoverEffect.transitionTokens(); // Async
});


// ----- NOTE: Token Controls ----- //

// Add cover book button to token controls
const COVER_EFFECTS_CONTROL = {
  name: Settings.CONTROLS.COVER_EFFECTS,
  title: `${MODULE_ID}.controls.${Settings.CONTROLS.COVER_EFFECTS}.name`,
  icon: FA_ICONS.MODULE,
  toggle: false,
  button: true,
  onClick: () => { new CoverEffectsApp().render(true); },
  visible: false,
  order: 0,
};

// Render the cover effects book control if setting enabled.
/**
 * Hook getSceneControlButtons
 * Render the cover effects book control if setting enabled.
 */
Hooks.on("getSceneControlButtons", (controls, _html, _data) => {
  if ( !canvas.scene || !ui.controls.activeControl === "token" || !game.user.isGM ) return;
  COVER_EFFECTS_CONTROL.visible = game.user.isGM && Settings.get(Settings.KEYS.DISPLAY_COVER_BOOK);
  COVER_EFFECTS_CONTROL.order = 0;
  Object.values(controls.tokens.tools).forEach(tool => COVER_EFFECTS_CONTROL.order = Math.max(tool.order + 1, COVER_EFFECTS_CONTROL.order));
  controls.tokens.tools[COVER_EFFECTS_CONTROL.name] = COVER_EFFECTS_CONTROL;
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
     * What cover effect class to use for this system.
     * @type {AbstractUniqueEffect}
     */
    CoverEffect: CoverActiveEffect,

    /**
     * Default terrain jsons
     * @type {string} File path
     */
    defaultCoverJSONs: defaultCover(),

    /**
     * The following statuses will cause the token to be ignored for purposes of granting cover.
     * I.e., a token with "dead" status will not contribute cover if inbetween an attacker and a defender.
     * Effectively overrides the "Maximum Cover" setting in the token config.
     * Should be ids from `CONFIG.statusEffects`.
     */
    statusesGrantNoCover: new Set(),

    /**
     * Classes and associated calculators that can determine percent visibility.
     * Created and initialized at canvasReady hook
     * Each calculator can calculate visibility based on viewer, target, and optional viewer/target locations.
     */
    calculatorClasses: {
      points: PercentVisibleCalculatorPoints,
      geometric: PercentVisibleCalculatorGeometric,
      webgl2: PercentVisibleCalculatorWebGL2,
      // Unused. webgpu: PercentVisibleCalculatorWebGPU,
      // Unused. "webgpu-async": PercentVisibleCalculatorWebGPUAsync,
      "per-pixel": PercentVisibleCalculatorPerPixel,
    },

    losCalculators: {
      points: null,
      geometric: null,
      webgl2: null,
      // webgpu: null,
      // "webgpu-async": null,
      "per-pixel": null,
    },

    /**
     * Classes used to view the debugger for different algorithms.
     */
    debugViewerClasses: {
      points: DebugVisibilityViewerPoints,
      geometric: DebugVisibilityViewerGeometric,
      webgl2: DebugVisibilityViewerWebGL2,
      // Unused. webgpu: DebugVisibilityViewerWebGPU,
      // Unused. "webgpu-async": DebugVisibilityViewerWebGPUAsync,
      "per-pixel": DebugVisibilityViewerPerPixel,
    },

    ...LOS_CONFIG,

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
    OPEN_POPOUTS,

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

    PATCHER,
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

/**
 * Test if a token is dead. Usually, but not necessarily, the opposite of tokenIsDead.
 * @param {Token} token
 * @returns {boolean} True if dead.
 */
function tokenIsAlive(token) { return !tokenIsDead(token); }

/**
 * Test if a token is dead. Usually, but not necessarily, the opposite of tokenIsAlive.
 * @param {Token} token
 * @returns {boolean} True if dead.
 */
function tokenIsDead(token) {
  const deadStatus = CONFIG.statusEffects.find(status => status.id === "dead");
  if ( deadStatus && token.actor.statuses.has(deadStatus.id) ) return true;

  const tokenHPAttribute = Settings.get(Settings.KEYS.TOKEN_HP_ATTRIBUTE);
  const hp = getObjectProperty(token.actor, tokenHPAttribute);
  if ( typeof hp !== "number" ) return false;
  return hp <= 0;
}

