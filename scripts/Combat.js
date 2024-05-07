/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { CoverCalculator } from "./CoverCalculator.js"; // Required to avoid error that Settings cannot be accessed prior to initialization.
import { Settings } from "./settings.js";
import { TokenCover } from "./TokenCover.js";

// Patches for the Combat class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * Hook after combat document is updated. Update the token cover for the new combatant.
 * Cannot use combatTurn hook b/c it fires before the turn changes.
 * @param {Document} document                       The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
function updateCombat(document, change, options, userId) {
  if ( !(Object.hasOwn(change, "turn")) ) return;
  const { COVER_TYPES, COVER_EFFECTS } = Settings.KEYS;
  const COMBATANT = COVER_TYPES.CHOICES.COMBATANT;
  if ( Settings.get(COVER_TYPES.USE) === COMBATANT
    || Settings.get(COVER_EFFECTS.USE) === COMBATANT ) {
    TokenCover._resetAllCover();
    TokenCover._forceUpdateAllTokenCover();
  }
}


PATCHES.BASIC.HOOKS = { updateCombat };
