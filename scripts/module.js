/* globals
canvas,
CONFIG,
game,
isNewerVersion,
Hooks,
ui
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
import { CoverType, CoverTypePF2E } from "./CoverType.js";
import { CoverActiveEffect, CoverActiveEffectDFreds } from "./CoverActiveEffect.js";
import { CoverItem, CoverItemPF2E, CoverItemSFRPG} from "./CoverItem.js";

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

    /**
     * What cover type class to use for this system.
     */
    CoverType,

    /**
     * What cover effect class to use for this system.
     */
    CoverEffect
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
    CoverItem,
    CoverItemSFRPG,
    CoverItemPF2E,
    setCoverIgnoreHandler,
    Settings,

    IgnoresCoverClasses: {
      IgnoresCover,
      IgnoresCoverDND5e,
      IgnoresCoverSimbuls
    },

    PATCHER
  };

  switch ( game.system.id ) {
    case "sfrpg":
      CONFIG[MODULE_ID].CoverEffect = CoverItemSFRPG;
      break;

    case "pf2e":
      CONFIG[MODULE_ID].CoverType = CoverTypePF2E;
      CONFIG[MODULE_ID].CoverEffect = CoverItemPF2E;
      break;

    default:
      CONFIG[MODULE_ID].CoverEffect = CoverActiveEffect;
  }

  if ( game.system.id === "dnd5e" ) {
    setCoverIgnoreHandler(game.modules.get("simbuls-cover-calculator")?.active ? IgnoresCoverSimbuls : IgnoresCoverDND5e);
  }
  if ( game.modules.get("dfreds-convenient-effects")?.active ) CONFIG[MODULE_ID].CoverEffect = CoverActiveEffectDFreds;

//   if ( game.system.id === "pf2e" ) {
//     CONFIG.statusEffects.push({
//       id: "takeCover",
//       label: `${MODULE_ID}.takeCover`,
//       icon: `modules/${MODULE_ID}/assets/noun-hide-8013.svg`
//     });
//   }
});

Hooks.once("setup", function() {
  initializePatching();
  Settings.registerAll();
  registerElevationConfig("TileConfig", "Alt. Token Cover");
});

Hooks.once("ready", function() {
  // Initialize must happen after game is ready, so that settings can be saved if necessary.
  CONFIG[MODULE_ID].CoverType.initialize();
  CONFIG[MODULE_ID].CoverEffect.initialize(); // Async
});

Hooks.once("canvasReady", function() {
  // Transitions to newer data. Requires canvas.scene to be loaded.
  transitionTokenMaximumCoverFlags();

  // If DFred's is active, mark DFred's cover effects with flags.
//   if ( MODULES_ACTIVE.DFREDS_CE ) {
//     const CoverEffect = CONFIG[MODULE_ID].CoverEffect
//     for ( const id of CoverEffect.coverObjectsMap.keys() ) {
//       const defaultData = CoverEffect.defaultCoverObjectData.get(id);
//       const dFredsEffect = game.dfreds.effectInterface.findCustomEffectByName(defaultData.dFredsName);
//       if ( !dFredsEffect ) continue;
//       dFredsEffect.setFlag(MODULE_ID, coverEffectId, id); // Already present?
//
//     }
//   }

})

// Add pathfinding button to token controls.
const COVER_EFFECTS_CONTROL = {
  name: Settings.KEYS.CONTROLS.COVER_EFFECTS,
  title: `${MODULE_ID}.controls.${Settings.KEYS.CONTROLS.COVER_EFFECTS}.name`,
  icon: "fas fa-book",
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
