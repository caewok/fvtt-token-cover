/* globals
libWrapper,
Token
*/
"use strict";

import {
  tokenUpdateVisionSource,
  _testLOSDetectionMode,
  _createPolygonPointSource,
  getConstrainedTokenShape
} from "./visibility_los.js";

import {
  testVisibilityCanvasVisibility,
  testVisibilityDetectionMode,
  _testRangeDetectionMode,
} from "./visibility_range.js";

import {
  toggleActiveEffectTokenDocument
} from "./cover.js";

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
  libWrapper.register(MODULE_ID, "DetectionMode.prototype._testRange", _testRangeDetectionMode, libWrapper.MIXED, {perf_mode: libWrapper.PERF_FAST});

  // Token HUD status effects for cover
//   libWrapper.register(MODULE_ID, "TokenHUD.prototype._onToggleStatusEffects", _onToggleStatusEffectsTokenHUD, libWrapper.WRAPPER);
//   libWrapper.register(MODULE_ID, "TokenHUD.prototype._toggleStatusEffects", _toggleStatusEffectsTokenHUD, libWrapper.WRAPPER);
//   libWrapper.register(MODULE_ID, "TokenHUD.prototype._onToggleEffect", _onToggleEffectTokenHUD, libWrapper.WRAPPER);

  // Manipulating Token status effects
  libWrapper.register(MODULE_ID, "TokenDocument.prototype.toggleActiveEffect", toggleActiveEffectTokenDocument, libWrapper.WRAPPER);

  // Constrained token shape getter.
  // Reset by tokenUpdateVisionSource
  if ( !Object.hasOwn(Token.prototype, "constrainedTokenShape") ) {
    Object.defineProperty(Token.prototype, "constrainedTokenShape", {
      get: getConstrainedTokenShape,
      enumerable: false
    });
  }
}

function _onToggleStatusEffectsTokenHUD(wrapper, event) {
  const out = wrapper(event);
  log("_onToggleStatusEffectsTokenHUD", event, out);
}

function _toggleStatusEffectsTokenHUD(wrapper, active) {
  const out = wrapper(active);
  log("_toggleStatusEffectsTokenHUD", active, out);
}

function _onToggleEffectTokenHUD(wrapper, event, {overlay=false}={}) {
  const out = wrapper(event, {overlay});
  log("_onToggleEffectTokenHUD", event, overlay, out, event.currentTarget);
}

// See also Token.prototype.toggleEffect and
// TokenDocument.prototype.toggleActiveEffect



export function patchHelperMethods() {
  function setIntersect(b) { return new Set([...this].filter(x => b.has(x))); }

  Object.defineProperty(Set.prototype, "intersect", {
    value: setIntersect,
    writable: true,
    configurable: true
  });

}
