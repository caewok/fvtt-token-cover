/* globals
libWrapper
*/
"use strict";

import {
  tokenUpdateVisionSource,
  _testLOSDetectionMode,
  testVisibilityCanvasVisibility,
  _createPolygonPointSource,
  testVisibilityDetectionMode,
  _testRangeDetectionMode,
  getConstrainedTokenShape
} from "./token_visibility.js";

import { MODULE_ID } from "./const.js";
import { log } from "./util.js";
import {
  activateListenersSettingsConfig,
  closeSettingsConfig,
  _onSubmitSettingsConfig
} from "./settings.js";

export function registerLibWrapperMethods() {
  libWrapper.register(MODULE_ID, "PointSource.prototype._createPolygon", _createPolygonPointSource, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "Token.prototype.updateVisionSource", tokenUpdateVisionSource, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "DetectionMode.prototype._testLOS", _testLOSDetectionMode, libWrapper.MIXED, {perf_mode: libWrapper.PERF_FAST});
  libWrapper.register(MODULE_ID, "SettingsConfig.prototype.activateListeners", activateListenersSettingsConfig, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "SettingsConfig.prototype.close", closeSettingsConfig, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "SettingsConfig.prototype._onSubmit", _onSubmitSettingsConfig, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "CanvasVisibility.prototype.testVisibility", testVisibilityCanvasVisibility, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});
  libWrapper.register(MODULE_ID, "DetectionMode.prototype.testVisibility", testVisibilityDetectionMode, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});
  libWrapper.register(MODULE_ID, "DetectionMode.prototype._testRange", _testRangeDetectionMode, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});


  // Constrained token shape getter.
  // Reset by tokenUpdateVisionSource
  if ( !Object.hasOwn(Token.prototype, "constrainedTokenShape") ) {
    Object.defineProperty(Token.prototype, "constrainedTokenShape", {
      get: getConstrainedTokenShape,
      enumerable: false
    });
  }
}

export function patchHelperMethods() {
  function setIntersect(b) { return  new Set([...this].filter(x => b.has(x))); }

  Object.defineProperty(Set.prototype, "intersect", {
    value: setIntersect,
    writable: true,
    configurable: true
  });

}
