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
import { registerSettings, getSetting, setSetting, SETTINGS, updateConfigStatusEffects } from "./settings.js";
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
  if ( !getSetting(SETTINGS.WELCOME_DIALOG.v020) ) {
    Dialog.prompt({
      title: "Alt Token Visibility v0.2.0 Changes!",
      content: `
<p>
As of version 0.2.0, Alternative Token Visibility now can calculate cover! And it now has a fancy
new 3d area option for line-of-sight and cover! Read all about the new options on the <a href="https://github.com/caewok/fvtt-token-visibility">Git page</a>.
</p>

<p>
A "Measure Cover" macro is available in the Macro Compendium, allowing any user to measure cover between
one or more tokens to one or more targets.
</p>

<p>
The GM can also designate a cover algorithm, define thresholds for the different cover levels, and
set up status conditions with active effects for cover types.
</p>

<p>
The 3d area considers the scene, with relevant walls, from the perspective of your token viewing a target.
(Think 1st-person shooter view for your token.) It then measures how much of the target is viewable
from that perspective. The new 3d area option works great with the <a href="https://github.com/theripper93/wall-height">Wall Height</a> module.
</p>

<p>
<br>
<em>Clicking the button below will make this message no longer display when FoundryVTT loads. If you
want to keep seeing this message, please click the close button above.</em>
</p>
`,
      rejectClose: false,
      callback: () => setSetting(SETTINGS.WELCOME_DIALOG.v020, true)
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
