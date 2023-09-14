/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { coverWorkflow } from "./cover.js";

// Patches for midiqol
export const PATCHES = {};
PATCHES.DND5E_MIDI = {}; // Only if midiqol is active.

// ----- NOTE: Hooks ----- //

/**
 * Hook event that fires after targeting (AoE) is complete.
 * Note: hook will be run by the user that executed the attack triggering this.
 */
async function midiqolPreambleComplete(workflow) {
  const { token, targets, item } = workflow;
  if ( !targets?.size || !token ) return true;

  // Construct dialogs, if applicable
  const actionType = item?.system?.actionType;
  return coverWorkflow(token, targets, actionType);
}

PATCHES.DND5E_MIDI.HOOKS = { midiqolPreambleComplete };
