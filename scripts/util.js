/* globals
CONFIG,
foundry,
fromUuidSync,
game,
PIXI,
renderTemplate
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { EPSILON, MODULE_ID } from "./const.js";
import { Point3d } from "./geometry/3d/Point3d.js";

/**
 * Remove in place multiple elements of an array that would meet a find test.
 * @param {Array} arr             The array to modify
 * @param {function} find         Test for whether an element should be removed
 *   - @param {object} element    Current element being processed
 *   - @param {number} index      Index of the element being tested
 *   - @param {Array} array       The array, possibly modified by removals
 * @returns {*[]} The modified array, for convenience
 */
export function findSpliceAll(arr, find) {
  for ( let i = arr.length - 1; i >= 0; i -= 1 ) {
    if ( find(arr[i], i, arr) ) arr.splice(i, 1);
  }
  return arr;
}

/**
 * Log if this module's debug config is enabled.
 */
export function log(...args) {
  try {
    if ( CONFIG[MODULE_ID].debug ) console.debug(MODULE_ID, "|", ...args);
  } catch(_e) {
    // Empty
  }
}

/**
 * Retrieve an embedded property from an object using a string.
 * @param {object} obj
 * @param {string} str
 * @returns {object}
 */
export function getObjectProperty(obj, str) {
  return str
    .replace(/\[([^\[\]]*)\]/g, ".$1.") // eslint-disable-line no-useless-escape
    .split(".")
    .filter(t => t !== "")
    .reduce((prev, cur) => prev && prev[cur], obj);
}

/**
 * Get elements of an array by a list of indices
 * https://stackoverflow.com/questions/43708721/how-to-select-elements-from-an-array-based-on-the-indices-of-another-array-in-ja
 * @param {Array} arr       Array with elements to select
 * @param {number[]} indices   Indices to choose from arr. Indices not in arr will be undefined.
 * @returns {Array}
 */
export function elementsByIndex(arr, indices) {
  return indices.map(aIndex => arr[aIndex]);
}

/**
 * Helper to inject configuration html into the application config.
 */
export async function injectConfiguration(app, html, data, template, findString) {
  const myHTML = await renderTemplate(template, data);
  const form = html.find(findString);
  form.append(myHTML);
  app.setPosition(app.position);
}
