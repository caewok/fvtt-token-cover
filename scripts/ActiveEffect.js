/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { FLAGS, MODULE_ID } from "./const.js";

// Patches for the ActiveEffect class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * When considering creating an active cover effect, do not do so if it already exists.
 * @param {Document} document                     The pending document which is requested for creation
 * @param {object} data                           The initial data object provided to the document creation request
 * @param {DocumentModificationContext} options   Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                        Explicitly return false to prevent creation of this Document
 */
function preCreateActiveEffect(activeEffect, _data, _options, _userId) {
  // Is the activeEffect a cover status?
  const coverEffectId = activeEffect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID);
  if ( !coverEffectId ) return true;

  // Does the status effect already exist?
  const actor = activeEffect.parent;
  if ( !actor || !actor.effects ) return true;
  for ( const effect of actor.effects ) {
    if ( effect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) === coverEffectId ) return false;
  }
  return true;
}

PATCHES.BASIC.HOOKS = { preCreateActiveEffect };
