/* globals
CONFIG,
game,
libWrapper,
PointSourcePolygon,
Token
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

import { MODULE_ID, MODULES_ACTIVE, DEBUG } from "./const.js";

import {
  testCollision3dPointSourcePolygon,
  _testCollision3dPointSourcePolygon
} from "./clockwise_sweep.js";

import {
  getTokenBorder,
  getTokenShape,
  getConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";

/**
 * Helpers to wrap methods.
 * @param {string} method       Method to wrap
 * @param {function} fn         Function to use for the wrap
 * @param {object} [options]    Options passed to libWrapper.register. E.g., { perf_mode: libWrapper.PERF_FAST}
 */
function wrap(method, fn, options = {}) { libWrapper.register(MODULE_ID, method, fn, libWrapper.WRAPPER, options); }

function mixed(method, fn, options = {}) { libWrapper.register(MODULE_ID, method, fn, libWrapper.MIXED, options); }

function override(method, fn, options = {}) { libWrapper.register(MODULE_ID, method, fn, libWrapper.OVERRIDE, options);}

/**
 * Helper to add a method to a class.
 * @param {class} cl      Either Class.prototype or Class
 * @param {string} name   Name of the method
 * @param {function} fn   Function to use for the method
 */
function addClassMethod(cl, name, fn) {
  Object.defineProperty(cl, name, {
    value: fn,
    writable: true,
    configurable: true
  });
}

/**
 * Helper to add a getter to a class.
 * @param {class} cl      Either Class.prototype or Class
 * @param {string} name   Name of the method
 * @param {function} fn   Function to use for the method
 */
function addClassGetter(cl, name, fn) {
  if ( !Object.hasown(cl, name) ) {
    Object.defineProperty(cl, name, {
      get: fn,
      enumerable: false,
      configurable: true
    });
  }
}

export function registerLibWrapperMethods() {
  // ----- Token Visibility ----- //
  mixed("CanvasVisibility.prototype.testVisibility", testVisibilityCanvasVisibility, {perf_mode: libWrapper.PERF_FAST});

  if ( MODULES_ACTIVE.LEVELS ) {
    override("CONFIG.Levels.handlers.SightHandler.getTestPoints", getTestPointsSightHandlerLevels, {perf_mode: libWrapper.PERF_FAST});
  } else {
    wrap("DetectionMode.prototype.testVisibility", testVisibilityDetectionMode, {perf_mode: libWrapper.PERF_FAST});
    wrap("LightSource.prototype.testVisibility", testVisibilityLightSource, {perf_mode: libWrapper.PERF_FAST});
  }

  // ----- Range Testing ----- //
  if ( !(MODULES_ACTIVE.LEVELS || MODULES_ACTIVE.PERFECT_VISION) ) mixed(
    "DetectionMode.prototype._testRange",
    _testRangeDetectionMode,
    { perf_mode: libWrapper.PERF_FAST }
  );

  // ----- LOS Testing ----- //
  mixed("DetectionMode.prototype._testLOS", _testLOSDetectionMode, {perf_mode: libWrapper.PERF_FAST});

  // ----- Cover status effects ----- //
  wrap("CONFIG.Token.documentClass.prototype.toggleActiveEffect", toggleActiveEffectTokenDocument);
  wrap("CONFIG.Token.objectClass.prototype.updateSource", updateSourceToken, {perf_mode: libWrapper.PERF_FAST});

  if ( !MODULES_ACTIVE.PERFECT_VISION ) {
    wrap( "VisionSource.prototype.initialize", initializeVisionSource, {perf_mode: libWrapper.PERF_FAST});
    override("VisionSource.prototype._createPolygon", _createPolygonVisionSource, {perf_mode: libWrapper.PERF_FAST});
  }

  addClassGetter(CONFIG.Token.objectClass.prototype, "tokenShape", getTokenShape);
  addClassGetter(CONFIG.Token.objectClass.prototype, "tokenBorder", getTokenBorder);
  addClassGetter(CONFIG.Token.objectClass.prototype, "constrainedTokenBorder", getConstrainedTokenBorder);
  addClassGetter(CONFIG.Token.objectClass.prototype, "ignoresCoverType", cachedGetterIgnoresCover);

  addClassMethod(PointSourcePolygon, "testCollision3d", testCollision3dPointSourcePolygon);
  addClassMethod(PointSourcePolygon.prototype, "_testCollision3d", _testCollision3dPointSourcePolygon);
}

function cachedGetterIgnoresCover() {
  return this._ignoresCoverType
    || (this._ignoresCoverType = new (game.modules.get(MODULE_ID).api.IGNORES_COVER_HANDLER)(this));
}

function updateSourceToken(wrapper, ...args) {
  if ( DEBUG.once || DEBUG.range || DEBUG.area || DEBUG.cover || DEBUG.los ) {
    CONFIG.GeometryLib.Draw.clearDrawings();

    if ( DEBUG.once ) {
      DEBUG.range = false;
      DEBUG.area = false;
      DEBUG.cover = false;
      DEBUG.los = false;
      DEBUG.once = false;
    }
  }

  return wrapper(...args);
}

// See also Token.prototype.toggleEffect and
// TokenDocument.prototype.toggleActiveEffect

export function patchHelperMethods() {
  function setIntersect(b) { return new Set([...this].filter(x => b.has(x))); }
  addClassMethod(Set.prototype, "intersect", setIntersect);
}
