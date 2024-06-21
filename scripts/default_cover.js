/* globals
foundry,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "./const.js";

/* Default terrains by system
Stored as json files. At json/systemid/terrain_name.json
*/

/**
 * Return a map of any default terrains for a given system.
 * @returns {string[]} JSON paths for the given system
 * be further modified on input. Typically used to localize the name.
 */
export function defaultCover() {
  const systemId = game.system.id;
  switch ( systemId ) {
    case "dnd5e": return {
      "half-token": `modules/${MODULE_ID}/json/${systemId}/half_token.json`,
      "half": `modules/${MODULE_ID}/json/${systemId}/half.json`,
      "three-quarters": `modules/${MODULE_ID}/json/${systemId}/three_quarters.json`,
      "full": `modules/${MODULE_ID}/json/${systemId}/full.json`,
    };

    // Compendium ids
    case "sfrpg": return {
      "soft": "aolmL82yGMgAlEcf", // Soft
      "partial": "WhC815WlllSW8tT0", // Partial
      "cover": "bjq4ho7JXhgUDvG6", // Cover
      "improved": "kaIYAWHJ7up8rwOy", // Improved
      "full": "o0CFBHsprfadKuyd"  // Full
    };

    case "pf2e": return {
      "lesser": "RPZwppfuaMgBtCc8", // Lesser
      "standard": "AhFNqnvBZ9K46LUK", // Standard
      "greater": "hPLXDSGyHzlupBS2"  // Greater
    };

    default: return {
      "low": `modules/${MODULE_ID}/json/${systemId}/low.json`,
      "medium": `modules/${MODULE_ID}/json/${systemId}/medium.json`,
      "high": `modules/${MODULE_ID}/json/${systemId}/high.json`,
      "full": `modules/${MODULE_ID}/json/${systemId}/full.json`,
    };
  }
  return null;
}

/**
 * Takes an array of json paths and loads them, returning a map of uniqueEffectId to the json data.
 * @param {object} paths
 * @returns {Map<string, object>}
 */
export async function loadDefaultCoverJSONs(paths) {
  // Load the JSONs
  const map = new Map();
  for ( const [key, path] of Object.entries(paths) ) {
    const jsonData = await foundry.utils.fetchJsonWithTimeout(path);
    if ( !jsonData ) continue;
    map.set(key, jsonData);
    jsonData.flags ??= {};
    jsonData.flags[MODULE_ID] ??= {};
    jsonData.flags[MODULE_ID][FLAGS.UNIQUE_EFFECT.ID] = `Cover_${key}`;
  }
  return map;
}

/**
 * Takes an array of compendium ids and loads them, returning a map of uniqueEffectId to the data.
 * @param {object} compendiumIds
 * @returns {Map<string, object>}
 */
export async function loadDefaultCompendiumItems(compendiumIds) {
  const pack = game.packs.get(`${MODULE_ID}.${MODULE_ID}_items_${game.system.id}`);
  if ( !pack ) return;

  // Attempt to load data for each compendium item.
  const map = new Map();
  for ( const [key, compendiumId] of Object.entries(compendiumIds) ) {
    const data = await pack.getDocument(compendiumId); // Async
    if ( !data ) continue;
    map.set(key, data);
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    data.flags[MODULE_ID][FLAGS.COVER_EFFECT.ID] = `Cover_${key}`;
  }
  return map;
}