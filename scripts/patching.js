/* globals
libWrapper,
Token,
game,
VisionSource,
CONFIG
*/
"use strict";

import {
  _testLOSDetectionMode,
  _createPolygonVisionSource,
  initializeVisionSource
} from "./visibility_los.js";

import {
  testVisibilityCanvasVisibility,
  testVisibilityDetectionMode,
  testVisibilityLightSource,
  getTestPointsSightHandlerLevels,
  _testRangeDetectionMode
} from "./visibility_range.js";

import { toggleActiveEffectTokenDocument } from "./cover.js";

import { MODULE_ID, MODULES_ACTIVE } from "./const.js";
import {
  activateListenersSettingsConfig
} from "./settings.js";

import {
  testCollision3dClockwiseSweepPolygon,
  _testCollision3dClockwiseSweepPolygon
} from "./clockwise_sweep.js";

import {
  getTokenBorder,
  getTokenShape,
  getConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

export function registerLibWrapperMethods() {
  // ---- Settings manipulations to hide unneeded settings ----- //
  libWrapper.register(MODULE_ID, "SettingsConfig.prototype.activateListeners", activateListenersSettingsConfig, libWrapper.WRAPPER);

  // ----- Token Visibility ----- //
  libWrapper.register(MODULE_ID, "CanvasVisibility.prototype.testVisibility", testVisibilityCanvasVisibility, libWrapper.MIXED, {perf_mode: libWrapper.PERF_FAST});

  if ( levelsActive ) {
    libWrapper.register(MODULE_ID, "CONFIG.Levels.handlers.SightHandler.getTestPoints", getTestPointsSightHandlerLevels, libWrapper.OVERRIDE, {perf_mode: libWrapper.PERF_FAST});
  } else {
    libWrapper.register(MODULE_ID, "DetectionMode.prototype.testVisibility", testVisibilityDetectionMode, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});
    libWrapper.register(MODULE_ID, "LightSource.prototype.testVisibility", testVisibilityLightSource, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});
  }

  // ----- Range Testing ----- //
  if ( !(MODULES_ACTIVE.LEVELS || MODULES_ACTIVE.PERFECT_VISION) ) libWrapper.register(
    MODULE_ID,
    "DetectionMode.prototype._testRange",
    _testRangeDetectionMode,
    libWrapper.MIXED,
    { perf_mode: libWrapper.PERF_FAST }
  );

  // ----- LOS Testing ----- //
  libWrapper.register(MODULE_ID, "DetectionMode.prototype._testLOS", _testLOSDetectionMode, libWrapper.MIXED, {perf_mode: libWrapper.PERF_FAST});

  // ----- Cover status effects ----- //
  libWrapper.register(MODULE_ID, "TokenDocument.prototype.toggleActiveEffect", toggleActiveEffectTokenDocument, libWrapper.WRAPPER);
  libWrapper.register(MODULE_ID, "Token.prototype.updateSource", updateSourceToken, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});

  // ----- Constrained token shape ----- //
  libWrapper.register(MODULE_ID, "VisionSource.prototype.initialize", initializeVisionSource, libWrapper.WRAPPER, {perf_mode: libWrapper.PERF_FAST});


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

  Object.defineProperty(VisionSource.prototype, "_createPolygon", {
    value: _createPolygonVisionSource,
    writable: true,
    configurable: true
  });


  if ( !Object.hasOwn(Token.prototype, "ignoresCoverType") ) {
    Object.defineProperty(Token.prototype, "ignoresCoverType", {
      get: cachedGetterIgnoresCover,
      enumerable: false
    });
  }

  Object.defineProperty(ClockwiseSweepPolygon, "testCollision3d", {
    value: testCollision3dClockwiseSweepPolygon,
    writable: true,
    configurable: true
  });

  Object.defineProperty(ClockwiseSweepPolygon.prototype, "_testCollision3d", {
    value: _testCollision3dClockwiseSweepPolygon,
    writable: true,
    configurable: true
  });
}

function cachedGetterIgnoresCover() {
  return this._ignoresCoverType
    || (this._ignoresCoverType = new (game.modules.get(MODULE_ID).api.IGNORES_COVER_HANDLER)(this));
}

function updateSourceToken(wrapper, ...args) {
  const api = game.modules.get(MODULE_ID).api;
  const debug = api.debug;
  if ( debug.once || debug.range || debug.area || debug.cover || debug.los ) {
    CONFIG.GeometryLib.Draw.clearDrawings();

    if ( debug.once ) {
      debug.range = false;
      debug.area = false;
      debug.cover = false;
      debug.los = false;
      debug.once = false;
    }
  }

  return wrapper(...args);
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
