/* globals
CONFIG,
game,
Hooks
*/
"use strict";

import { MODULE_ID, FLAGS, COVER, setCoverIgnoreHandler } from "./const.js";

// Hooks and method registration
import { registerGeometry } from "./geometry/registration.js";
import { registerElevationConfig } from "./geometry/elevation_configs.js";
import { initializePatching, PATCHER } from "./patching.js";
import { Settings } from "./settings.js";
import { AsyncQueue } from "./AsyncQueue.js";

// Cover objects
import { CoverEffectsApp } from "./CoverEffectsApp.js";
import { CoverEffect } from "./CoverEffect.js";
import { CoverType } from "./CoverType.js";

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
import "./cover_application.js";

Hooks.once("init", function() {
  registerGeometry();
  addDND5eCoverFeatFlags();

  // Set CONFIGS used by this module.
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
    AsyncQueue,

    OPEN_POPOUTS,

    webgl: {
      Token3dGeometry, Wall3dGeometry, DirectionalWall3dGeometry, ConstrainedToken3dGeometry,
      Placeable3dShader, Tile3dShader,
      Placeable3dDebugShader, Tile3dDebugShader
    },

    CoverCalculator,
    CoverDialog,
    COVER,
    CoverType,
    CoverEffect,
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
  initializePatching();
  registerElevationConfig("TileConfig", "Alt. Token Cover");

  // Construct default types after init, so that world scripts have a chance to modify.
  CoverType._constructDefaultCoverObjects();
  CoverEffect._constructDefaultCoverObjects();
});

Hooks.once("ready", function() {
  Settings.registerAll();
  Settings.updateConfigStatusEffects();

  // Transitions to newer data.
  transitionTokenMaximumCoverFlags();

  // Update cover types with settings data.
  CoverType._updateFromSettings();
  CoverEffect._updateFromSettings();
});

// Add pathfinding button to token controls.
const COVER_EFFECTS_CONTROL = {
  name: Settings.KEYS.CONTROLS.COVER_EFFECTS,
  title: `${MODULE_ID}.controls.${Settings.KEYS.CONTROLS.COVER_EFFECTS}.name`,
  icon: "fas fa-book",
  button: true,
  onClick: () => { new CoverEffectsApp().render(true); },
  visible: true
};

// Render the cover effects book control if setting enabled.
Hooks.on("getSceneControlButtons", controls => {
  if ( !canvas.scene ) return;
  const tokenTools = controls.find(c => c.name === "token");
  tokenTools.tools.push(COVER_EFFECTS_CONTROL);
});

/**
 * Transition token maximum cover flags.
 * Previously was stored by cover type (0 – 4).
 * Now will be a percentage blocked.
 */
function transitionTokenMaximumCoverFlags() {
  const sceneVersion = canvas.scene.getFlag(MODULE_ID, FLAGS.VERSION);
  if ( sceneVersion && !isNewerVersion("0.6.6", sceneVersion) ) return;
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
    t.document.setFlag(MODULE_ID, FLAGS.VERSION, v)
  });
  canvas.scene.setFlag(MODULE_ID, FLAGS.VERSION, v);
}
