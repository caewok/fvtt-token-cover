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
    case "dnd5e": return [
      `modules/${MODULE_ID}/json/${systemId}/half_token.json`,
      `modules/${MODULE_ID}/json/${systemId}/half.json`,
      `modules/${MODULE_ID}/json/${systemId}/three_quarters.json`,
      `modules/${MODULE_ID}/json/${systemId}/full.json`,
    ];

    // Compendium ids
    case "sfrpg": return [
      "aolmL82yGMgAlEcf", // Soft
      "WhC815WlllSW8tT0", // Partial
      "bjq4ho7JXhgUDvG6", // Cover
      "kaIYAWHJ7up8rwOy", // Improved
      "o0CFBHsprfadKuyd"  // Full
    ];

    case "pf2e": return [
      "3wuJNcYqrY1IEYm8", // Lesser
      "AhFNqnvBZ9K46LUK", // Standard
      "hPLXDSGyHzlupBS2"  // Greater
    ];

    default: return [
      `modules/${MODULE_ID}/json/${systemId}/low.json`,
      `modules/${MODULE_ID}/json/${systemId}/medium.json`,
      `modules/${MODULE_ID}/json/${systemId}/high.json`,
    ]
  }
  return [];
}

/**
 * Takes an array of json paths and loads them, returning a map of uniqueEffectId to the json data.
 * @param {string[]} paths
 * @returns {Map<string, object>}
 */
export async function loadDefaultCoverJSONs(paths) {
  // Load the JSONs
  const promises = []
  for ( const path of paths ) promises.push(foundry.utils.fetchJsonWithTimeout(path));
  const jsonData = (await Promise.allSettled(promises)).map(p => p.value);

  // Add each to the map
  const map = new Map();
  for ( const jsonDatum of jsonData ) {
    const key = jsonDatum?.flags?.[MODULE_ID]?.[FLAGS.UNIQUE_EFFECT.ID];
    if ( !key ) continue;
    map.set(key, jsonDatum);
  }
  return map;
}
