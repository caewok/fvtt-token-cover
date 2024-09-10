/* globals
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

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
function updateCombat(document, change, _options, _userId) {
  if ( !(Object.hasOwn(change, "turn")) ) return;
  const { KEYS, ENUMS } = Settings;
  if ( Settings.get(KEYS.COVER_EFFECTS.USE) === ENUMS.USE_CHOICES.COMBATANT ) TokenCover.updateAttackers();
}

/**
 * Hook when combat starts, to trigger update of attackers.
 * @param {Combat} combat           The Combat encounter which is starting
 * @param {object} updateData       An object which contains Combat properties that will be updated. Can be mutated.
 * @param {number} updateData.round      The initial round
 * @param {number} updateData.turn       The initial turn
 */
function combatStart(_combat, _updateData) {
  combatChange();
}

/**
 * Hook when a combat is deleted, possibly triggering update of attackers.
 * Note that more than one combat may be present.
 *
 * @event deleteDocument
 * @category Document
 * @param {Document} document                       The existing Document which was deleted
 * @param {DocumentModificationContext} options     Additional options which modified the deletion request
 * @param {string} userId                           The ID of the User who triggered the deletion workflow
 */
function deleteCombat(_document, _options, _userId) {
  if ( game.combats ) return; // Other combats present.
  combatChange();
}

PATCHES.BASIC.HOOKS = { updateCombat, combatStart, deleteCombat};

// ----- NOTE: Helper functions ---- //

/**
 * If combat starts/stops, update attackers.
 */
function combatChange() {
  const { KEYS, ENUMS } = Settings;
  const { COMBAT, COMBATANT } = ENUMS.USE_CHOICES;
  const useCover = Settings.get(KEYS.COVER_EFFECTS.USE);
  if ( useCover === COMBAT || useCover === COMBATANT ) return TokenCover.updateAttackers();
}

