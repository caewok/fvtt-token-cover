/* globals
foundry
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { FLAGS, MODULE_ID } from "./const.js";

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
  if ( !actor || !(actor instanceof foundry.documents.Actor) ) return;
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
  if ( !actor || !(actor instanceof foundry.documents.Actor) ) return;
  const modFlags = document.flags[MODULE_ID];
  if ( !modFlags ) return;
  if ( !(modFlags[FLAGS.UNIQUE_EFFECT.ID] && !modFlags[FLAGS.UNIQUE_EFFECT.LOCAL]) ) return;
  const token = actor.token?.object;
  if ( !token ) return;
  token.tokencover.updateCover();
}

PATCHES.BASIC.HOOKS = { createActiveEffect, deleteActiveEffect };

/**
 * Create an ActiveEffect instance from status effect data.
 * Called by {@link ActiveEffect.fromStatusEffect}.
 * @param {string} statusId                          The status effect ID.
 * @param {ActiveEffectData} effectData              The status effect data.
 * @param {DocumentConstructionContext} [options]    Additional options to pass to the ActiveEffect constructor.
 * @returns {Promise<ActiveEffect>}                  The created ActiveEffect instance.
 * @protected
 */
async function _fromStatusEffect(wrapped, statusId, effectData, options) {
  for ( const ce of CONFIG[MODULE_ID].CoverEffect._instances.values() ) {
    if ( ce.document.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.LINKED_STATUS) === statusId ) {
      effectData = foundry.utils.mergeObject(effectData, ce.toJSON(), { inplace: false, overwrite: false });
      break;
    }
  }
  return wrapped(statusId, effectData, options);
}

PATCHES.BASIC.STATIC_WRAPS = { _fromStatusEffect };
