/* globals
game,
Hooks
*/
"use strict";

import { MODULE_ID, COVER, setCoverIgnoreHandler } from "./const.js";

// Hooks and method registration
import { registerGeometry } from "./geometry/registration.js";
import { registerElevationConfig } from "./geometry/elevation_configs.js";
import { initializePatching, PATCHER } from "./patching.js";
import { Settings, SETTINGS } from "./settings.js";

// For API
import { AlternativeLOS } from "./LOS/AlternativeLOS.js";
import { PointsLOS } from "./LOS/PointsLOS.js";
import { Area2dLOS } from "./LOS/Area2dLOS.js";
import { Area3dLOSGeometric } from "./LOS/Area3dLOSGeometric.js";
import { Area3dLOSWebGL } from "./LOS/Area3dLOSWebGL1.js";
import { Area3dLOSWebGL2 } from "./LOS/Area3dLOSWebGL2.js";
import { Area3dLOSHybrid } from "./LOS/Area3dLOSHybrid.js";
import { AREA3D_POPOUTS } from "./LOS/Area3dPopout.js";
import { ConstrainedTokenBorder } from "./LOS/ConstrainedTokenBorder.js";
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
import "./migration.js";
import "./cover_application.js";

Hooks.once("init", function() {
  registerGeometry();
  initializePatching();
  addDND5eCoverFeatFlags();

  // Set CONFIGS used by this module.
  CONFIG[MODULE_ID] = {

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
    renderTextureResolution: 1
  };

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

    AREA3D_POPOUTS,

    webgl: {
      Token3dGeometry, Wall3dGeometry, DirectionalWall3dGeometry, ConstrainedToken3dGeometry,
      Placeable3dShader, Tile3dShader,
      Placeable3dDebugShader, Tile3dDebugShader
    },

    CoverCalculator,
    CoverDialog,
    COVER,
    ConstrainedTokenBorder,
    setCoverIgnoreHandler,
    Settings,

    IgnoresCoverClasses: {
      IgnoresCover,
      IgnoresCoverDND5e,
      IgnoresCoverSimbuls
    },

    PATCHER
  };

  if ( game.system.id === "dnd5e" ) {
    setCoverIgnoreHandler(game.modules.get("simbuls-cover-calculator")?.active ? IgnoresCoverSimbuls : IgnoresCoverDND5e);
  }
});

Hooks.once("setup", function() {
  Settings.registerAll();
  registerElevationConfig("Tile", "Alt. Token Cover");
  Settings.updateConfigStatusEffects();
});

Hooks.on("canvasReady", function() {
  console.debug("tokenvisibility|canvasReady")
  Settings.initializeDebugGraphics();
});
