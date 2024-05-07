/* globals
canvas,
ChatMessage,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { coverAttackWorkflow } from "./CoverDialog.js";

// Patches for the dnd5e Item class
export const PATCHES = {};
PATCHES.DND5E_NO_MIDI = {}; // Only if midiqol is not active.

// ----- NOTE: MIXES ----- //

/**
 * Mixed wrap Item5e.prototype.rollAttack
 */
const ELIGIBLE_ACTION_TYPES = new Set(["mwak", "msak", "rsak", "rwak"]);
async function rollAttack(wrapper, options = {}) {
  if ( !this.hasAttack ) return wrapper(options);

  // Determine the attack type
  const actionType = this.system?.actionType;
  if ( !ELIGIBLE_ACTION_TYPES.has(actionType) ) return wrapper(options);

  // Locate the token
  const actor = this.actor;
  const token = canvas.tokens.get(ChatMessage.getSpeaker({ actor }).token);
  if ( !token || !token.isOwner ) return wrapper(options);

  // Determine the targets for the user
  const targets = game.user.targets;
  if ( !targets.size ) return wrapper(options);

  // Construct dialogs, if applicable
  const doAttack = await coverAttackWorkflow(token, targets, actionType);
  if ( doAttack ) return wrapper(options);

  // If coverAttackWorkflow returns false, user canceled or eliminated all targets; simply return.
  return false;
}

PATCHES.DND5E_NO_MIDI.MIXES = { rollAttack };
