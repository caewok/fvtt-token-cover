/* globals
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";

/* Default terrains by system
Stored as json files. At json/systemid/terrain_name.json
*/

/**
 * Return a map of any default terrains for a given system.
 * @returns {string[]} JSON paths for the given system
 * be further modified on input. Typically used to localize the name.
 */
export function defaultCover() {
  let systemId = game.system.id;
  switch ( systemId ) {
    case "dnd5e": {
      if ( !foundry.utils.isNewerVersion(game.system.version, "4.0.0") ) systemId = `${dnd5e_v3}`;
      return {
        "half-token": `modules/${MODULE_ID}/json/${systemId}/half_token.json`,
        half: `modules/${MODULE_ID}/json/${systemId}/half.json`,
        "three-quarters": `modules/${MODULE_ID}/json/${systemId}/three_quarters.json`,
        full: `modules/${MODULE_ID}/json/${systemId}/full.json`,
      };
    }

    // Compendium ids
    case "sfrpg": return {
      soft: "aolmL82yGMgAlEcf", // Soft
      partial: "WhC815WlllSW8tT0", // Partial
      cover: "bjq4ho7JXhgUDvG6", // Cover
      improved: "kaIYAWHJ7up8rwOy", // Improved
      full: "o0CFBHsprfadKuyd"  // Full
    };

    case "pf2e": return {
      lesser: "KiJJPkS3ABHyKYre", // Lesser
      standard: "jAjwDIvPc2qFHg3r", // Standard
      greater: "1YTdEhijbc0nlQ2o"  // Greater
    };

    default: return {
      low: `modules/${MODULE_ID}/json/${systemId}/low.json`,
      medium: `modules/${MODULE_ID}/json/${systemId}/medium.json`,
      high: `modules/${MODULE_ID}/json/${systemId}/high.json`,
      full: `modules/${MODULE_ID}/json/${systemId}/full.json`,
    };
  }
}
