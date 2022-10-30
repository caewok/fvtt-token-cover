/* globals
Hooks,
game
*/
"use strict";

import { MODULE_ID, COVER_TYPES } from "./const.js";

// Hooks and method registration
import { targetTokenHook, combatTurnHook, dnd5ePreRollAttackHook, midiqolPreambleCompleteHook } from "./cover.js";
import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";
import { registerPIXIPolygonMethods } from "./PIXIPolygon.js";
import { registerPIXIRectangleMethods } from "./PIXIRectangle.js";
import { registerSettings, updateConfigStatusEffects } from "./settings.js";
import { registerElevationAdditions } from "./elevation.js";
import { Point3d, registerPIXIPointMethods } from "./Point3d.js";

// For API
import * as bench from "./benchmark.js";
import * as drawing from "./drawing.js";
import * as util from "./util.js";
import { Shadow } from "./Shadow.js";
import { Matrix } from "./Matrix.js";
import { Area3d } from "./Area3d.js";
import { Area2d } from "./Area2d.js";
import { Plane } from "./Plane.js";
import { ClipperPaths } from "./ClipperPaths.js";
import { CoverCalculator } from "./CoverCalculator.js";

import * as los from "./visibility_los.js";

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
    Area2d,
    Area3d,
    Plane,
    ClipperPaths,
    util,
    CoverCalculator,
    COVER_TYPES,
    los,
    debug: {
      range: false,
      los: false,
      cover: false,
      area: false
    }
  };

  registerSystemHooks();
});

Hooks.once("setup", async function() {
  registerSettings();
  updateConfigStatusEffects();
});

/**
 * Tell DevMode that we want a flag for debugging this module.
 * https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
 */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});

function registerSystemHooks() {
  console.log(`Game system is ${game.system.id}`);
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

Hooks.on("midi-qol.preAttackRoll", midiqolPreAttackRoll);

// Hooks.on("midi-qol.preambleComplete", midiqolPreambleCompleteHookTest);


function midiqolPreambleCompleteHookTest(workflow) {
  console.log(`midiqolPreambleCompleteHookTest user ${game.userId}`, workflow);
}

function midiqolPreAttackRoll(workflow) {
  console.log(`midiqolPreAttackRoll user ${game.userId}`, workflow);
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
function updateTokenHook(document, change, options, userId) {
  if ( Object.hasOwn(change, "x")
    || Object.hasOwn(change, "y")
    || Object.hasOwn(change, "elevation") ) {

    const debug = game.modules.get(MODULE_ID).api.debug;
    if ( debug.range || debug.area || debug.cover || debug.los ) {
      console.log("Clearing drawings!")
      drawing.clearDrawings();
    }
  }
}

