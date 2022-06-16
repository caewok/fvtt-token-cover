/* globals
Hooks,
game
*/
"use strict";

import { MODULE_ID } from "./const.js";
import * as drawing from "./drawing.js";
import * as bench from "./benchmark.js";
import * as random from "./random.js";
import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";
import { registerPIXIRectangleMethods } from "./PIXIRectangle.js";
import { registerPIXIPolygonMethods } from "./PIXIPolygon.js";
import { objectIsVisible } from "./token_visibility.js";

// Toggle settings
export const SETTINGS = {
  debug: false,
  useTestVisibility: true,
  boundsScale: 1,
  percentArea: 0,
  areaTestOnly: false,
  fastTestOnly: false,
  testWalls: true,
  testCenterPoint: true,
  finalTest: true,
  fastFilterOnly: false
};

Hooks.once("init", async function() {
  registerLibWrapperMethods();
  patchHelperMethods();
  registerPIXIRectangleMethods();
  registerPIXIPolygonMethods();

  game.modules.get(MODULE_ID).api = {
    SETTINGS, // See also CONFIG.debug.polygons = true

    objectIsVisible,

    bench,
    drawing,
    random
  };
});

/**
 * Tell DevMode that we want a flag for debugging this module.
 * https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
 */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});

