/* globals
CONFIG,
game,
libWrapper,
PointSourcePolygon
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { Patcher } from "./Patcher.js";

import { PATCHES as PATCHES_Token } from "./Token.js";
import { PATCHES as PATCHES_ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import { PATCHES as PATCHES_PointSourcePolygon } from "./PointSourcePolygon.js";

const PATCHES = {
  ConstrainedTokenBorder: PATCHES_ConstrainedTokenBorder,
  PointSourcePolygon: PATCHES_PointSourcePolygon,
  Token: PATCHES_Token
};

export const PATCHER = new Patcher(PATCHES);

export function initializePatching() {
  PATCHER.registerGroup("BASIC");
  PATCHER.registerGroup("ConstrainedTokenBorder");
}







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

import { toggleActiveEffectTokenDocument, _onCreateDocumentsActiveEffect, rollAttackItem5e } from "./cover.js";

import { MODULE_ID, MODULES_ACTIVE, DEBUG, COVER, IGNORES_COVER_HANDLER } from "./const.js";

import {
  testCollision3dPointSourcePolygon,
  _testCollision3dPointSourcePolygon
} from "./clockwise_sweep.js";


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
  if ( !Object.hasOwn(cl, name) ) {
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
  wrap("ActiveEffect._onCreateDocuments", _onCreateDocumentsActiveEffect, {perf_mode: libWrapper.PERF_FAST});

  if ( game.system.id === "dnd5e" && !MODULES_ACTIVE.MIDI_QOL ) {
    mixed("CONFIG.Item.documentClass.prototype.rollAttack", rollAttackItem5e, {perf_mode: libWrapper.PERF_FAST});
  }

  if ( !MODULES_ACTIVE.PERFECT_VISION ) {
    wrap( "VisionSource.prototype.initialize", initializeVisionSource, {perf_mode: libWrapper.PERF_FAST});
    override("VisionSource.prototype._createPolygon", _createPolygonVisionSource, {perf_mode: libWrapper.PERF_FAST});
  }
}

