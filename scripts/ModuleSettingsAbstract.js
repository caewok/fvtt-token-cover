/* globals
game,
Settings
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";

// Patches for the Setting class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * Wipe the settings cache on update
 */
function updateSetting(document, change, options, userId) {  // eslint-disable-line no-unused-vars
  const [module, ...arr] = document.key.split(".");
  const key = arr.join("."); // If the key has periods, multiple will be returned by split.
  if ( module === MODULE_ID && ModuleSettingsAbstract.cache.has(key) ) ModuleSettingsAbstract.cache.delete(key);
}

PATCHES.BASIC.HOOKS = { updateSetting };

export class ModuleSettingsAbstract {
  /** @type {Map<string, *>} */
  static cache = new Map();

  /** @type {object} */
  static KEYS = {};

  // ---- NOTE: Settings static methods ---- //

  /**
   * Retrive a specific setting.
   * Cache the setting.  For caching to work, need to clean the cache whenever a setting below changes.
   * @param {string} key
   * @returns {*}
   */
  static get(key) {
    // TODO: Bring back a working cache.

    const cached = this.cache.get(key);
    if ( typeof cached !== "undefined" ) {
      const origValue = game.settings.get(MODULE_ID, key);
      if ( origValue !== cached ) {
        console.debug(`Settings cache fail: ${origValue} !== ${cached} for key ${key}`);
        return origValue;
      }

      return cached;

    }
    const value = game.settings.get(MODULE_ID, key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set a specific setting.
   * @param {string} key
   * @param {*} value
   * @returns {Promise<boolean>}
   */
  static async set(key, value) {
    this.cache.delete(key);
    return game.settings.set(MODULE_ID, key, value);
  }

  static async toggle(key) {
    const curr = this.get(key);
    return this.set(key, !curr);
  }

  /**
   * Register a specific setting.
   * @param {string} key        Passed to registerMenu
   * @param {object} options    Passed to registerMenu
   */
  static register(key, options) { game.settings.register(MODULE_ID, key, options); }

  /**
   * Register a submenu.
   * @param {string} key        Passed to registerMenu
   * @param {object} options    Passed to registerMenu
   */
  static registerMenu(key, options) { game.settings.registerMenu(MODULE_ID, key, options); }

  /**
   * Localize a setting key.
   * @param {string} key
   */
  static localize(key) { return game.i18n.localize(`${MODULE_ID}.settings.${key}`); }

  /**
   * Register all settings
   */
  static registerAll() {}
}
