/* globals
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { elevatePoints } from "./visibility_range.js";

// Patches for the dnd5e Item class
export const PATCHES = {};
PATCHES.DND5E_NO_MIDI = {}; // Only if midiqol is not active.

// ----- NOTE: MIXES ----- //

/**
 * Mixed wrap Item5e.prototype.rollAttack
 */
async function rollAttack(wrapper, options = {}) {
  if ( !this.hasAttack ) return wrapper(options);

  // Locate the token
  const actor = this.actor;
  const token = canvas.tokens.get(ChatMessage.getSpeaker({ actor }).token);
  if ( !token || !token.isOwner ) return wrapper(options);

  // Determine the targets for the user
  const targets = game.user.targets;
  if ( !targets.size ) return wrapper(options);

  // Determine the attack type
  const actionType = this.system?.actionType;

  // Construct dialogs, if applicable
  if ( await coverWorkflow(token, targets, actionType) ) return wrapper(options);

  // If coverWorkflow returns false, user canceled or eliminated all targets; simply return.
}

PATCHES.DND5E_NO_MIDI.MIXES = { rollAttack };
