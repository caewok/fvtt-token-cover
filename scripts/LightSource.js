/* globals
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { elevatePoints } from "./visibility_range.js";

// Patches for the LightSource class
export const PATCHES = {};
PATCHES.NO_LEVELS = {};

// ----- NOTE: Wraps ----- //

/**
 * Wrap LightSource.prototype.testVisibility
 * Same as testVisibilityDetectionMode.
 * Create extra points if necessary; modify tests so LOS area algorithms can use only center point.
 * @param {object} config               The visibility test configuration
 * @param {CanvasVisibilityTest[]} config.tests  The sequence of tests to perform
 * @param {PlaceableObject} config.object        The target object being tested
 * @returns {boolean}                   Is the target object visible to this source?
 */
function testVisibility(wrapped, {tests, object}={}) {
  if ( !(object instanceof Token) ) return wrapped({ object, tests });
  tests = elevatePoints(tests, object);
  return wrapped({ object, tests });
}

PATCHES.BASIC.NO_LEVELS = { testVisibility };
