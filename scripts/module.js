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
import { log, fastFlag } from "./util.js";

// Hooks and method registration
import { initializePatching, PATCHER } from "./patching.js";
import { Settings } from "./settings.js";
import { getObjectProperty } from "./LOS/util.js";

// Calculators
import { PercentVisibleCalculatorPoints, DebugVisibilityViewerPoints } from "./LOS/calculators/PointsCalculator.js";
import { PercentVisibleCalculatorGeometric, DebugVisibilityViewerGeometric } from "./LOS/calculators/GeometricCalculator.js";
import { PercentVisibleCalculatorPerPixel, DebugVisibilityViewerPerPixel } from "./LOS/calculators/PerPixelCalculator.js";
import { PercentVisibleCalculatorWebGL2, DebugVisibilityViewerWebGL2 } from "./LOS/calculators/WebGL2Calculator.js";

// Cover objects
import { defaultCover } from "./default_cover.js";
import { getBackend, EFFECT_BACKENDS } from "./effect_backends.js";
import { TokenEffects } from "./TokenEffects.js";
import { UniqueEffectDefinition } from "./UniqueEffectDefinition.js";

// Regions
import { SetCoverRegionBehaviorType } from "./SetCoverRegionBehaviorType.js";

// For API
import { OPEN_POPOUTS } from "./LOS/Area3dPopout.js";
import { CoverCalculator, buildOcclusionTester, buildLOSCalculator } from "./CoverCalculator.js";
import { CoverDialog } from "./CoverDialog.js";

// Ignores Cover
import {
  IgnoresCover,
  IgnoresCoverSimbuls,
  IgnoresCoverDND5e,
  addDND5eCoverFeatFlags } from "./IgnoresCover.js";

// Load the geometry library.
import { GEOMETRY_LIB_ID } from "./geometry/const.js";
import "./geometry/registration.js";

// Other self-executing hooks
import "./changelog.js";

Hooks.once("init", function() {
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
  UniqueEffectDefinition.initialize(); // Async
  initializePatching();

  // Opacity values for tokens, walls, regions for cover.
  CONFIG[GEOMETRY_LIB_ID].CONFIG.opacity.register("move", {
    Token: tokenOpacity,
    Region: regionOpacity,
    Wall: wallOpacity,
  });
});

/**
 * A hook event that fires when the game is fully ready.
 */
Hooks.once("ready", async function(_canvas) {
  Settings.migrate(); // Cannot be set until world is ready.
});

/**
 * A hook event that fires when the Canvas is ready.
 * @param {Canvas} canvas The Canvas which is now ready for use
 */
Hooks.once("canvasReady", function() {
  transitionTokenMaximumCoverFlags();

  // Destroy any old calculator.
  if ( CONFIG[MODULE_ID].coverCalculator ) {
    CONFIG[MODULE_ID].coverCalculator.destroy();
    CONFIG[MODULE_ID].coverCalculator = null;
  }

  // Create a shared occlusion tester.
  CONFIG[MODULE_ID].occlusionTester = buildOcclusionTester();

  // Create a shared los calculator.
  const calc = CONFIG[MODULE_ID].losCalculator = buildLOSCalculator();

  // Replace for any tokens already in the scene.
  canvas.tokens.placeables.forEach(token => {
    const losViewer = token[MODULE_ID]?.coverCalculator.losViewer;
    if ( !losViewer ) return;
    losViewer.calculator = calc;
  });
});

// ----- NOTE: Helper Functions ----- //

/**
 * Transparency for cover obstacle tokens.
 * @param {TokenDocument} tokenD
 * @returns {number}
 */
function tokenOpacity(tokenD) {
  const statusesGrantNoCover = CONFIG[MODULE_ID].statusesGrantNoCover;
  const actor = tokenD.object?.actor;
  if ( actor && actor.statuses.intersects(statusesGrantNoCover) ) return 0; // Fully transparent.
  return Number(1 - (fastFlag(tokenD, FLAGS.COVER.MAX_GRANT) || 1));
}

/**
 * Transparency for cover obstacle walls.
 * @param {WallDocument} wallD
 * @returns {number}
 */
function wallOpacity(wallD) { return Number(1 - (fastFlag(wallD, FLAGS.COVER.MAX_GRANT) || 0)); }

/**
 * Transparency for cover obstacle regions.
 * @param {RegionDocument} regionD
 * @returns {number}
 */
function regionOpacity(regionD) { return Number(1 - (fastFlag(regionD, FLAGS.COVER.MAX_GRANT) || 0)); }

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
      "per-pixel": PercentVisibleCalculatorPerPixel,
    },

    /**
     * Classes used to view the debugger for different algorithms.
     */
    debugViewerClasses: {
      points: DebugVisibilityViewerPoints,
      geometric: DebugVisibilityViewerGeometric,
      webgl2: DebugVisibilityViewerWebGL2,
      "per-pixel": DebugVisibilityViewerPerPixel,
    },

    /**
     * Current occlusion tester for the given settings.
     * @type {ObstacleOcclusionTest}
     */
    occlusionTester: null,

    /**
     * Current calculator for the given settings.
     * @type {PercentVisibleCalculatorAbstract}
     */
    losCalculator: null,

    ...LOS_CONFIG,

  };
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
    getBackend,
    EFFECT_BACKENDS,
    TokenEffects,
    UniqueEffectDefinition,

    setCoverIgnoreHandler,
    Settings,

    IgnoresCoverClasses: {
      IgnoresCover,
      IgnoresCoverDND5e,
      IgnoresCoverSimbuls
    },

    calcs: {
      points: PercentVisibleCalculatorPoints,
      geometric: PercentVisibleCalculatorGeometric,
      webGL2: PercentVisibleCalculatorWebGL2,
      perPixel: PercentVisibleCalculatorPerPixel,
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
  const sceneVersion = fastFlag(canvas.scene, FLAGS.VERSION);
  if ( sceneVersion && !foundry.utils.isNewerVersion("0.6.6", sceneVersion) ) return;
  const v = game.modules.get("tokencover").version;
  canvas.tokens.placeables.forEach(t => {
    const currCoverMax = fastFlag(t.document, FLAGS.COVER.MAX_GRANT);
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
