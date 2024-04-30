/* globals
canvas
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { CoverCalculator } from "./CoverCalculator.js";
import { Settings, SETTINGS } from "./settings.js";

// Patches for the Combat class
export const PATCHES = {};
PATCHES.NO_PF2E = {};

// ----- NOTE: Hooks ----- //

/**
 * Hook the combat turn, to clear cover from other combatants.
 */
function combatTurn(combat, updateData, updateOptions) { // eslint-disable-line no-unused-vars
   updateCombatCoverStatus(combat, updateData, updateOptions)
}

/**
 * Hook the combat round, to clear cover from other combatants.
 */
function combatRound(combat, updateData, updateOptions) {
  updateCombatCoverStatus(combat, updateData, updateOptions)
}

/**
 * @param {Combat} combat
 * @param {object} updateData
 *   - @property {number} updateData.round
 *   - @property {number} updateData.turn
 * @param {object} updateOptions
 */
function updateCombatCoverStatus(combat, _updateData, _updateOptions) {
  if ( !Settings.get(SETTINGS.COVER.COMBAT_AUTO) ) return;
  const c = combat.combatant;
  const playerOwners = c.players;

  // Clear cover status of all tokens in the scene
  // Unless the token is targeted by the current user
  const tokens = canvas.tokens.placeables;

  const userTargetedTokens = [];
  for ( const token of tokens ) {
    if ( playerOwners.some(owner => token.targeted.has(owner)) ) {
      userTargetedTokens.push(token);
    }
    CoverCalculator.disableAllCover(token.id); // Async
  }

  // Calculate cover from combatant to any currently targeted tokens
  const combatToken = c.token.object;
  for ( const target of userTargetedTokens ) {
    const coverCalc = new CoverCalculator(combatToken, target);
    coverCalc.setTargetCoverEffect(); // Async
  }
}


PATCHES.NO_PF2E.HOOKS = { combatTurn };
