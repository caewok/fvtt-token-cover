/* globals
Hooks,
game
*/
"use strict";

import { MODULE_ID, COVER_TYPES } from "./const.js";

import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";
import { registerPIXIPolygonMethods } from "./PIXIPolygon.js";
import { registerPIXIRectangleMethods } from "./PIXIRectangle.js";
import { registerSettings } from "./settings.js";
import { registerElevationAdditions } from "./elevation.js";
import { Point3d, registerPIXIPointMethods } from "./Point3d.js";

// For API
import * as bench from "./benchmark.js";
import * as visibility from "./token_visibility.js";
import * as cover from "./cover.js";
import * as drawing from "./drawing.js";
import * as util from "./util.js";
import { Shadow } from "./Shadow.js";
import { Matrix } from "./Matrix.js";
import { Area3d } from "./Area3d.js";

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
    visibility,
    util,
    cover,
    COVER_TYPES,
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
