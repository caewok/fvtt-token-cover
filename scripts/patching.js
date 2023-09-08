/* globals
CONFIG,
game,
libWrapper,
PointSourcePolygon
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { Patcher } from "./Patcher.js";

import { PATCHES as PATCHES_ActiveEffect } from "./ActiveEffect.js";
import { PATCHES as PATCHES_CanvasVisibility } from "./CanvasVisibility.js";
import { PATCHES as PATCHES_ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import { PATCHES as PATCHES_DetectionMode } from "./DetectionMode.js";
import { PATCHES as PATCHES_Item } from "./Item.js";
import { PATCHES as PATCHES_LightSource } from "./LightSource.js";
import { PATCHES as PATCHES_PointSourcePolygon } from "./PointSourcePolygon.js";
import { PATCHES as PATCHES_Token } from "./Token.js";
import { PATCHES as PATCHES_VisionSource } from "./VisionSource.js";

// Levels
import { PATCHES as PATCHES_Levels_SightHandler } from "./Levels_SightHandler.js";


const PATCHES = {
  ActiveEffect: PATCHES_ActiveEffect,
  CanvasVisibility: PATCHES_CanvasVisibility,
  ConstrainedTokenBorder: PATCHES_ConstrainedTokenBorder,
  DetectionMode: PATCHES_DetectionMode,
  LightSource: PATCHES_LightSource,
  PointSourcePolygon: PATCHES_PointSourcePolygon,
  Token: PATCHES_Token,
  VisionSource: PATCHES_VisionSource,
  "CONFIG.Levels.handlers.SightHandler": PATCHES_Levels_SightHandler
};

export const PATCHER = new Patcher(PATCHES);

export function initializePatching() {
  PATCHER.registerGroup("BASIC");
  PATCHER.registerGroup("ConstrainedTokenBorder");

  if ( MODULES_ACTIVE.LEVELS ) PATCHER.registerGroup("LEVELS");
  else PATCHER.registerGroup("NO_LEVELS");

  if ( game.system.id === "dnd5e"
    && !MODULES_ACTIVE.MIDI_QOL ) PATCHER.registerGroup("DND5E_NO_MIDI");
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



  // ----- Cover status effects ----- //

  if ( game.system.id === "dnd5e" && !MODULES_ACTIVE.MIDI_QOL ) {
    mixed("CONFIG.Item.documentClass.prototype.rollAttack", rollAttackItem5e, {perf_mode: libWrapper.PERF_FAST});
  }


}

