/* globals
fromUuid
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { coverAttackWorkflow } from "./CoverDialog.js";
import { MODULE_ID, FLAGS } from "./const.js";

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
  const template = workflow.templateUuid ? (await fromUuid(workflow.templateUuid))?.object : undefined;
  if ( actionType !== "rsak" && actionType !== "rwak" && !template ) return true;

  // Construct dialogs and apply cover if needed.
  const attacker = {
    name: `${token.name}|${item.name}`,
    img: `${item.img}`
  };
  const coverFlags = FLAGS.DND5E.SPELL_CONFIG;
  if ( template && item.getFlag(MODULE_ID, coverFlags.USE_COVER) === coverFlags.CHOICES.TEMPLATE ) {
    const out = await coverAttackWorkflow(template, targets, { actionType, attacker });
    return Boolean(out);
  }

  // If no template, then cover applies only for ranged spell attacks and ranged weapon attacks.
  if ( !template && actionType !== "rsak" && actionType !== "rwak" ) return true;
  const out = await coverAttackWorkflow(token, targets, { actionType, attacker });
  return Boolean(out);
}

PATCHES.DND5E_MIDI.HOOKS = { "midi-qol.prePreambleComplete": midiqolPrePreambleComplete };
