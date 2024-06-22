/* globals
Actor,
CONFIG
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { FLAGS, MODULE_ID } from "./const.js";
// import { Settings } from "./settings.js";

// Patches for the ActiveEffect class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * When adding an active effect, check for overriding effect.
 * @param {Document} document                       The new Document instance which has been created
 * @param {DocumentModificationContext} options     Additional options which modified the creation request
 * @param {string} userId                           The ID of the User who triggered the creation workflow
 */
function createActiveEffect(document, _options, _userId) {
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
function deleteActiveEffect(document, _options, _userId) {
  const actor = document.parent;
  if ( !actor || !(actor instanceof Actor) ) return;
  const modFlags = document.flags[MODULE_ID];
  if ( !modFlags ) return;
  if ( !(modFlags[FLAGS.UNIQUE_EFFECT.ID] && !modFlags[FLAGS.UNIQUE_EFFECT.LOCAL]) ) return;
  const token = actor.token?.object;
  if ( !token ) return;
  token.tokencover.updateCover();
}

PATCHES.BASIC.HOOKS = { createActiveEffect, deleteActiveEffect };
