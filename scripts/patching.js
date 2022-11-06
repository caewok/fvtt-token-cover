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

import {
  getTokenBorder,
  getTokenShape,
  getConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

export function registerLibWrapperMethods() {
  const levelsActive = game.modules.get("levels")?.active;
  const pvActive = game.modules.get("perfect-vision")?.active;

  // ---- Settings manipulations to hide unneeded settings ----- //
  libWrapper.register(MODULE_ID, "SettingsConfig.prototype.activateListeners", activateListenersSettingsConfig, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "SettingsConfig.prototype.close", closeSettingsConfig, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "SettingsConfig.prototype._onSubmit", _onSubmitSettingsConfig, libWrapper.WRAPPER);

  // ----- Token Visibility ----- //
  libWrapper.register(MODULE_ID, "CanvasVisibility.prototype.testVisibility", testVisibilityCanvasVisibility, libWrapper.MIXED, {perf_mode: libWrapper.PERF_FAST});
  libWrapper.register(MODULE_ID, "DetectionMode.prototype.testVisibility", testVisibilityDetectionMode, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});

  // ----- Range Testing ----- //
  if ( !(levelsActive || pvActive) )
    libWrapper.register(MODULE_ID, "DetectionMode.prototype._testRange", _testRangeDetectionMode, libWrapper.MIXED, {perf_mode: libWrapper.PERF_FAST});

  // ----- LOS Testing ----- //
  libWrapper.register(MODULE_ID, "DetectionMode.prototype._testLOS", _testLOSDetectionMode, libWrapper.MIXED, {perf_mode: libWrapper.PERF_FAST});
  libWrapper.register(MODULE_ID, "PointSource.prototype._createPolygon", _createPolygonPointSource, libWrapper.WRAPPER);

  // ----- Cover status effects ----- //
  libWrapper.register(MODULE_ID, "TokenDocument.prototype.toggleActiveEffect", toggleActiveEffectTokenDocument, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "Token.prototype.updateSource", updateSourceToken, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});

  // ----- Constrained token shape ----- //
  libWrapper.register(MODULE_ID, "Token.prototype.updateVisionSource", tokenUpdateVisionSource, libWrapper.WRAPPER);


  if ( !Object.hasOwn(Token.prototype, "tokenShape") ) {
    Object.defineProperty(Token.prototype, "tokenShape", {
      get: getTokenShape,
      enumerable: false
    });
  }

  if ( !Object.hasOwn(Token.prototype, "tokenBorder") ) {
    Object.defineProperty(Token.prototype, "tokenBorder", {
      get: getTokenBorder,
      enumerable: false
    });
  }

  if ( !Object.hasOwn(Token.prototype, "constrainedTokenBorder") ) {
    Object.defineProperty(Token.prototype, "constrainedTokenBorder", {
      get: getConstrainedTokenBorder,
      enumerable: false
    });
  }

  if ( !Object.hasOwn(Token.prototype, "constrainedTokenShape") ) {
    Object.defineProperty(Token.prototype, "constrainedTokenShape", {
      get: getConstrainedTokenShape,
      enumerable: false
    });
  }
}

function updateSourceToken(wrapper, ...args) {
  const api = game.modules.get(MODULE_ID).api;
  const debug = api.debug;
    if ( debug.range || debug.area || debug.cover || debug.los ) {
      console.log("Clearing drawings! (updateSourceToken)")
      api.drawing.clearDrawings();
    }

  return wrapper(...args);
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
