/* globals
canvas,
ChatMessage,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { coverWorkflow } from "./CoverDialog.js";

// Patches for the dnd5e Item class
export const PATCHES = {};
PATCHES.DND5E_NO_MIDI = {}; // Only if midiqol is not active.
PATCHES.sfrpg = {}; // Starfinder RPG system.

// ----- NOTE: Hooks ----- //

/**
 * For Starfinder, hook item creation to monitor cover added.
 * If the cover already exists, do not add it again.
 * @param {Document} document                     The pending document which is requested for creation
 * @param {object} data                           The initial data object provided to the document creation request
 * @param {DocumentModificationContext} options   Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                        Explicitly return false to prevent creation of this Document
 */
function preCreateItem(item, data, options, userId) {
//   if ( game.system.id !== "sfrpg" || userId !== game.userId ) return;
//
//   // Is this item a cover status?
//   const coverType = item.getFlag(MODULE_ID, "cover");
//   if ( !coverType ) return;
//
//   // Does this actor already have this item?
//   const actor = item.parent;
//   if ( actor.items.some(i => i.getFlag(MODULE_ID, "cover") === coverType) ) return false;
//   return true;
}

/**
 * For Starfinder, hook item creation to monitor cover added.
 * When cover is added, remove all other cover items.
 * @param {Document} document                     The pending document which is requested for creation
 * @param {DocumentModificationContext} options   Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 */
function createItem(item, options, userId) {
//   if ( game.system.id !== "sfrpg" || userId !== game.userId ) return;
//
//   // Is this item a cover status?
//   const coverType = item.getFlag(MODULE_ID, "cover");
//   if ( !coverType ) return;
//
//   // Locate all other cover types on this actor.
//   const actor = item.parent;
//   const coverItems = actor.items.filter(i => {
//     const iCover = i.getFlag(MODULE_ID, "cover");
//     return iCover && iCover !== coverType;
//   });
//   if ( !coverItems.length ) return;
//
//   // Remove the other cover types.
//   // TODO: Is this a problem b/c it is async?
//   const coverIds = coverItems.map(i => i.id);
//   actor.deleteEmbeddedDocuments("Item", coverIds);
}

PATCHES.sfrpg.HOOKS = { preCreateItem, createItem };

// ----- NOTE: MIXES ----- //

/**
 * Mixed wrap Item5e.prototype.rollAttack
 */
async function rollAttack(wrapper, options = {}) {
  if ( !this.hasAttack ) return wrapper(options);

  // Determine the attack type
  const actionType = this.system?.actionType;
  if ( !(actionType === "mwak"
      || actionType === "msak"
      || actionType === "rsak"
      || actionType === "rwak") ) return wrapper(options);

  // Locate the token
  const actor = this.actor;
  const token = canvas.tokens.get(ChatMessage.getSpeaker({ actor }).token);
  if ( !token || !token.isOwner ) return wrapper(options);

  // Determine the targets for the user
  const targets = game.user.targets;
  if ( !targets.size ) return wrapper(options);

  // Construct dialogs, if applicable
  // if ( await coverWorkflow(token, targets, actionType) ) return wrapper(options);

  return wrapper(options);

  // If coverWorkflow returns false, user canceled or eliminated all targets; simply return.
}

PATCHES.DND5E_NO_MIDI.MIXES = { rollAttack };
