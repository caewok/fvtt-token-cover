/* globals
Hooks,
game
*/
"use strict";

import { MODULE_ID, COVER_TYPES } from "./const.js";

// Hooks and method registration
import { addCoverStatuses, targetTokenHook, combatTurnHook, dnd5ePreRollAttackHook, midiqolPreambleCompleteHook } from "./cover.js";
import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";
import { registerPIXIPolygonMethods } from "./PIXIPolygon.js";
import { registerPIXIRectangleMethods } from "./PIXIRectangle.js";
import { registerSettings } from "./settings.js";
import { registerElevationAdditions } from "./elevation.js";
import { Point3d, registerPIXIPointMethods } from "./Point3d.js";

// For API
import * as bench from "./benchmark.js";
import * as visibility from "./token_visibility.js";
import * as drawing from "./drawing.js";
import * as util from "./util.js";
import { Shadow } from "./Shadow.js";
import { Matrix } from "./Matrix.js";
import { Area3d } from "./Area3d.js";
import { Plane } from "./Plane.js";
import { ClipperPaths } from "./ClipperPaths.js";
import { CoverCalculator } from "./CoverCalculator.js";

Hooks.once("init", async function() {
  registerElevationAdditions();
  registerPIXIPointMethods();
  registerPIXIRectangleMethods();
  registerLibWrapperMethods();
  patchHelperMethods();
  registerPIXIPolygonMethods();

  game.modules.get(MODULE_ID).api = {
    bench,
    drawing,
    Shadow,
    Matrix,
    Point3d,
    Area3d,
    Plane,
    ClipperPaths,
    visibility,
    util,
    CoverCalculator,
    COVER_TYPES,
    debug: false
  };

  registerSystemHooks();
});

Hooks.once("setup", async function() {
  registerSettings();
  addCoverStatuses();
});

/**
 * Tell DevMode that we want a flag for debugging this module.
 * https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
 */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});


function registerSystemHooks() {

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
