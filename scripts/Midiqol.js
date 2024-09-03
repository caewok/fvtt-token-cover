/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { coverAttackWorkflow } from "./CoverDialog.js";

// Patches for midiqol
export const PATCHES = {};
PATCHES.DND5E_MIDI = {}; // Only if midiqol is active.

// ----- NOTE: Hooks ----- //

/**
 * Hook event that fires after targeting (AoE) is complete.
 * Note: hook will be run by the user that executed the attack triggering this.
 */
async function midiqolPrePreambleComplete(workflow) {
  const { token, targets, item } = workflow;
  if ( !targets?.size || !token ) return true;

  // For DND5e, only apply cover for ranged attacks.
  const actionType = item?.system?.actionType;
  if ( actionType !== "rsak" && actionType !== "rwak" ) return true;

  // Construct dialogs and apply cover.
  const out = await coverAttackWorkflow(token, targets, actionType);
  return Boolean(out);
}

PATCHES.DND5E_MIDI.HOOKS = { "midi-qol.prePreambleComplete": midiqolPrePreambleComplete };
