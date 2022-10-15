/* globals
Hooks,
game
*/
"use strict";

import { MODULE_ID } from "./const.js";
import * as bench from "./benchmark.js";
import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";
import { registerPIXIPolygonMethods } from "./PIXIPolygon.js";
import { registerPIXIRectangleMethods } from "./PIXIRectangle.js";
import {
  constrainedTokenShape,
  testLOSArea,
  testLOSPoint,
  intersectConstrainedShapeWithLOS,
  shadowPolygonForElevation
} from "./token_visibility.js";

import { registerSettings } from "./settings.js";
import { registerElevationAdditions } from "./elevation.js";
import { Shadow } from "./Shadow.js";
import { Point3d, registerPIXIPointMethods } from "./Point3d.js";

Hooks.once("init", async function() {
  registerElevationAdditions();
  registerPIXIPointMethods();
  registerPIXIRectangleMethods();
  registerLibWrapperMethods();
  patchHelperMethods();
  registerPIXIPolygonMethods();

  game.modules.get(MODULE_ID).api = {
    constrainedTokenShape,
    bench,
    Shadow,
    Point3d,
    testLOSArea,
    testLOSPoint,
    intersectConstrainedShapeWithLOS,
    shadowPolygonForElevation,
    debug: false
  };
});

Hooks.once("setup", async function() {
  registerSettings();
});

/**
 * Tell DevMode that we want a flag for debugging this module.
 * https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
 */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});

