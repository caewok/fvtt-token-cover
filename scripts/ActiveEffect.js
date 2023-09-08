/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { COVER } from "./const.js";

// Patches for the ActiveEffect class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Wraps ----- //

/**
 * Wrap ActiveEffect._onCreateDocuments
 * When creating an active cover effect, remove all other cover effects.
 * Cannot use createActiveEffectHook b/c it is not async.
 *
 */
async function _onCreateDocuments(wrapper, documents, context) {
  await wrapper(documents, context);
  for ( const effect of documents ) {
    // If the effect already exists (or cannot be found) effect might be undefined.
    if ( !effect || !effect.statuses || !effect.parent ) continue;

    // Do statuses need to be removed?
    const actor = effect.parent;
    const coverStatuses = actor.statuses.intersection(COVER.IDS.ALL);
    const toRemove = coverStatuses.difference(effect.statuses);
    if ( !toRemove.size ) return effect;

    // Remove all cover statuses except the activeEffect status
    // ActiveEffect actor does not point to specific token for linked so use getActiveTokens
    const tokenDocs = actor.getActiveTokens(false, true);
    const promises = [];
    tokenDocs.forEach(tokenD => {
      promises.push(...toRemove.map(id => tokenD.toggleActiveEffect({ id }, { active: false }))); // Async
    });
    await Promise.all(promises);
  }
}

PATCHES.BASIC.WRAPS = { _onCreateDocuments };
