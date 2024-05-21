/* globals
Actor,
foundry,
isEmpty
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
  if ( !(modFlags[FLAGS.COVER_EFFECT.ID] && !modFlags[FLAGS.COVER_EFFECT.LOCAL]) ) return;
  const token = actor.token?.object;
  if ( !token ) return;
  token.tokencover.updateCover();
}

/**
 * When updating an active effect, store the changed cover rule flags in cover flag settings.
 * @param {Document} document                       The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
function updateActiveEffect(document, change, _options, _userId) {
  const modFlags = change?.flags?.[MODULE_ID];
  if ( !modFlags ) return;
  const ceId = modFlags[FLAGS.COVER_EFFECT.ID];
  if ( !ceId || !modFlags[FLAGS.COVER_EFFECT.LOCAL] ) return;

  const modFlagSet = new Set(Object.keys(modFlags));
  const newSettings = {};
  for( const flag in FLAGS.COVER_EFFECT.RULES ) {
    if ( !modFlagSet.has(flag) ) continue;
    newSettings[flag] = modFlags[flag];
  }
  if ( isEmpty(newSettings) ) return;
  const prevSettings = Settings.get(Settings.KEYS.COVER_EFFECTS.RULES) ?? {};
  foundry.utils.mergeObject(prevSettings, newSettings, { inplace: true });
  Settings.set(Settings.KEYS.COVER_EFFECTS.RULES, prevSettings); // Async
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
  if ( !(modFlags[FLAGS.COVER_EFFECT.ID] && !modFlags[FLAGS.COVER_EFFECT.LOCAL]) ) return;
  const token = actor.token?.object;
  if ( !token ) return;
  token.tokencover.updateCover();
}

PATCHES.BASIC.HOOKS = { createActiveEffect, deleteActiveEffect, updateActiveEffect };
