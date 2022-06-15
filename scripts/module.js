/* globals
Hooks
*/
"use strict";

import { MODULE_ID } from "./const.js";
import { * as drawing } from "./drawing.js";
import { registerLibWrapperMethods, patchHelperMethods } from "./patching.js";


Hooks.once("init", async function() {
  registerLibWrapperMethods();
  patchHelperMethods();
});

/**
 * Tell DevMode that we want a flag for debugging this module.
 * https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
 */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});

