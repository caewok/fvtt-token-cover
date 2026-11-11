/* globals
CONFIG,
Dialog,
game,
Handlebars,
renderTemplate
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";


/**
 * Faster version of PlaceableDocument#getFlag.
 * Keyed to this module. Does not handle nested flag properties (use only the base flag property).
 * @param {PlaceableDocument} placeableD
 * @param {string} flag
 * @returns {*} Flag at that position or undefined.
 */
export function fastFlag(placeableD, flag) { return placeableD.flags[MODULE_ID]?.[flag]; }

/**
 * Automatically resolve strings to be plural in various languages.
 * @param {string} baseKey        Key found in, e.g., en.json
 * @param {number} count          Nubmer of items
 * @returns {string}
 * @example
 * "MYMODULE.CoverTarget_one": "{count} target may have cover.",
 * console.log(getPluralizedString("MYMODULE.CoverTarget", 1)); // "1 target may have cover."
 * console.log(getPluralizedString("MYMODULE.CoverTarget", 2)); // "2 targets may have cover."
 */
export function getPluralizedString(baseKey, count, opts = {}) {
  // Automatically resolves to 'one', 'other', 'two', 'few', 'many', or 'zero' based on locale rules
  const pluralRules = new Intl.PluralRules(game.i18n.lang);
  const rule = pluralRules.select(count);

  // Combines the base key with the active language rule (e.g., "MYMODULE.CoverTarget_other")
  return game.i18n.localize(`${baseKey}-${rule}`, { count, ...opts });
}

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
  } catch(_e) {  // eslint-disable-line no-unused-vars
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


/**
 * Locates a single active gm.
 * @returns {User|undefined}
 */
export function firstGM() { return game.users?.find(u => u.isGM && u.active); }

/**
 * Is the current user the first active GM user?
 * @returns {boolean}
 */
export function isFirstGM() { return game.user && game.user.id === firstGM()?.id; }
