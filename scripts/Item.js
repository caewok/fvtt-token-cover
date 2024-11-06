/* globals
Actor,
canvas,
ChatMessage,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { rollAttack_v3 } from "./dnd5e.js";
import { MODULE_ID, FLAGS } from "./const.js";

// Patches for the dnd5e Item class
export const PATCHES = {};
PATCHES.BASIC = {};
PATCHES.DND5E_v3 = {}; // Only if midiqol is not active.
PATCHES.DND5E_v4 = {};

// ----- NOTE: MIXES ----- //

/**
 * Mixed wrap Item5e.prototype.rollAttack
 */
PATCHES.DND5E_v3.MIXES = { rollAttack: rollAttack_v3 };

/**
 * When adding an active effect, check for overriding effect.
 * @param {Document} document                       The new Document instance which has been created
 * @param {DocumentModificationContext} options     Additional options which modified the creation request
 * @param {string} userId                           The ID of the User who triggered the creation workflow
 */
function createItem(document, _options, _userId) {
  const actor = document.parent;
  if ( !actor || !(actor instanceof Actor) ) return;
  const modFlags = document.flags[MODULE_ID];
  if ( !modFlags ) return;
  if ( !(modFlags[FLAGS.UNIQUE_EFFECT.ID] && !modFlags[FLAGS.UNIQUE_EFFECT.LOCAL]) ) return;

  const token = actor.token?.object;
  if ( !token ) return;
  token.tokencover.updateCover();
}

/**
 * When adding an active effect, check for overriding effect.
 * @param {Document} document                       The new Document instance which has been created
 * @param {DocumentModificationContext} options     Additional options which modified the creation request
 * @param {string} userId                           The ID of the User who triggered the creation workflow
 */
function deleteItem(document, _options, _userId) {
  const actor = document.parent;
  if ( !actor || !(actor instanceof Actor) ) return;
  const modFlags = document.flags[MODULE_ID];
  if ( !modFlags ) return;
  if ( !(modFlags[FLAGS.UNIQUE_EFFECT.ID] && !modFlags[FLAGS.UNIQUE_EFFECT.LOCAL]) ) return;
  const token = actor.token?.object;
  if ( !token ) return;
  token.tokencover.updateCover();
}

PATCHES.BASIC.HOOKS = { createItem, deleteItem };
