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
 * Define a null set class and null set which always contains 0 elements.
 * The class removes the add method.
 */
class NullSet extends Set {
  add(value) {
   console.error(`${MODULE_ID}|Attempted to add ${value} to a NullSet.`, value);
   return this;
  }
}
export const NULL_SET = new NullSet();

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
 * Convert any dialog to a promise to allow use with await/async.
 * @content HTML content for the dialog.
 * @return Promise for the html content of the dialog
 * Will return "Cancel" or "Close" if those are selected.
 * See Dialog class in Foundry.
 * @param {DialogData} data          An object of dialog data which configures how the modal window is rendered
 * @param {DialogOptions} [options]  Dialog rendering options, see {@link Application}.
 * @returns {Promise<>|"Close"} The callback data or "Close" if user closed the window
 */
export async function dialogPromise(data, options = {}) {
  return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
    dialogCallback(data, html => resolve(html), options);
  });
}

/**
 * Create new dialog with a callback function that can be used for dialogPromise.
 * @content HTML content for the dialog.
 * @callbackFn Allows conversion of the callback to a promise using dialogPromise.
 * @return rendered dialog.
 */
function dialogCallback(data, callbackFn, options = {}) {
  if ( !data.buttons ) {
    data.buttons = {
      one: {
        icon: '<i class="fas fa-check"></i>',
        label: "Confirm"
      }
    };
    data.default = "one";
  }
  data.close = () => callbackFn({ html: null, buttonKey: "Close" });
  Object.entries(data.buttons).forEach(([buttonKey, buttonData]) => {
    buttonData.callback = html => callbackFn({ html, buttonKey });
  });
  const d = new Dialog(data, options);
  return d.render(true, { height: "100%" });
}

/**
 * Synchronous version of renderTemplate.
 * Requires the template to be already loaded.
 * @param {string} path             The file path to the target HTML template
 * @param {Object} data             A data object against which to compile the template
 * @returns {string|undefined}      Returns the compiled and rendered template as a string
 */
export function renderTemplateSync(path, data) {
  if ( !Object.hasOwn(Handlebars.partials, path) ) return;
  const template = Handlebars.partials[path];
  return template(data || {}, {
    allowProtoMethodsByDefault: true,
    allowProtoPropertiesByDefault: true
  });
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
