/* globals
libWrapper
*/
"use strict";

import { tokenUpdateVisionSource, _testLOSDetectionMode } from "./token_visibility.js";
import { MODULE_ID } from "./const.js";
import { log } from "./util.js";

export function registerLibWrapperMethods() {
  libWrapper.register(MODULE_ID, "Token.prototype.updateVisionSource", tokenUpdateVisionSource, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "DetectionMode.prototype._testLOS", _testLOSDetectionMode, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST})
}

export function patchHelperMethods() {
  function setIntersect(b) { return  new Set([...this].filter(x => b.has(x))); }

  Object.defineProperty(Set.prototype, "intersect", {
    value: setIntersect,
    writable: true,
    configurable: true
  });
}
