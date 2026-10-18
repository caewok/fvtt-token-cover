/* globals
foundry
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "../const.js";
import { getBackend } from "./effectBackends.js";
import { UniqueEffect } from "./UniqueEffect.js";

/**
 * Everything to do with putting a UniqueEffectDefinition on (or off) a token.
 *
 * Deliberately has exactly one mode of operation: local and synchronous. This is called every
 * time cover/terrain is recalculated for a token - potentially every animation frame while a
 * viewer token is dragged around a scene - so nothing here may `await` or touch the database.
 * (Compare to the old design's parallel "_addToToken" (DB) / "_addToTokenLocally" (local)
 * methods on every subclass: only the local half was ever safe to use for this feature, so
 * that's the only half that exists now.)
 *
 * A GM who wants a *persistent* manually-applied condition should drag the definition's
 * document onto the actor sheet the normal Foundry way; that's a distinct, infrequent, and
 * already-async-safe operation this module does not need to reimplement.
 */

export class TokenEffects {

  /**
   * Map of definition id -> the local document representing it on this token,
   * for every definition currently applied.
   * @param {Token} token
   * @returns {Map<string, Document>}
   */
  static _appliedMap(token) {
    // A single pass over the token's effects/items collection.
    const map = new Map();
    const collection = getBackend().tokenCollection(token.actor);
    if ( !collection ) return map;
    for ( const doc of collection ) {
      const id = doc.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID);
      if ( id ) map.set(id, doc);
    }
    return map;
  }

  /**
   * Is this definition currently applied to this token?
   * @param {Token} token
   * @param {UniqueEffectDefinition} definition
   * @returns {boolean}
   */
  static has(token, definition) {
    return this._appliedMap(token).has(definition.id);
  }

  /**
   * All definitions currently applied to a token.
   * @param {Token} toen
   * @returns {UniqueEffect}
   */
  static all(token) {
    return [...this._appliedMap(token).keys()]
      .map(id => UniqueEffect.get(id));
  }

  /**
   * Add 1+ definitions to a token, locally.
   * @param {token} token
   * @param {UniqueEffect[]} definitions
   * @param {object} [opts]
   * @param {boolean} [opts.exclusive = false]  Remove other applied definitions that share a category first.
   * @param {object } [opts.data]               Extra data merged into each created document
   * @returns {boolean} True if token changed.
   */
  static add(token, definitions, { exclusive = false, data } = {}) {
    const backend = getBackend();
    const actor = token.actor();
    const collection = backend.tokenCollection(actor);
    if ( !(actor && collection) ) return false;

    const applied = this._appliedMap(token);
    const toAdd = definitions.filter(d => !applied.has(d.id) || d.allowsDuplicates);
    if ( !toAdd.length ) return false;

    if ( exclusive ) {
      const categories = new Set(toAdd.map(d => d.category));
      const addIds = new Set(toAdd.map(d => d.id));
      const toRemove = [...applied.entries()]
        .filter(([id, doc]) => !addIds.has(id) && categories.has(doc.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.TYPE)))
        .map(([, doc]) => doc);
      this._deleteDocs(collection, toRemove);
    }

    for ( const definition of toAdd ) {
      const docData = backend.buildTokenData(definition, token, data);

      // Assign the id manually: collection.createDocument() does not do this for us.
      // Field may be locked on a cloned template's data (see upstream PR #44 / issue #46).
      docData.id = foundry.utils.randomID();
      const doc = collection.createDocument(docData);
      collection.set(doc.id, doc);
    }

    actor.reset();
    this.refreshTokenDisplay(token);
    return true;
  }

  /**
   * Remove 1+ definitions from a token.
   * @param {Token} token
   * @param {UniqueEffect[]} definitions
   * @returns {boolean} true if the token changed.
   */
  static remove(token, definitions) {
    const backend = getBackend();
    const actor = token.actor;
    const collection = backend.tokenCollection(actor);
    if ( !(actor && collection) ) return false;

    const ids = new Set(definitions.map(d => d.id));
    const toRemove = [...collection].filter(doc => ids.has(doc.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID)));
    if ( !toRemove.length ) return false;

    this._deleteDocs(collection, toRemove);
    actor.reset();
    this.refreshTokenDisplay(token);
    return true;
  }

  /**
   * Remove every applied definition from a token in one shot.
   * @param {Token} token
   * @returns {boolean} True if the token changed.
   */
  static clear(token) { return this.remove(token, this.all(token)); }

  /**
   * Helper to delete docs from a collection.
   * @param {EmbeddedCollection} collection
   * @param {Document[]} docs
   */
  static _deleteDocs(collection, docs) { for ( const doc of docs ) collection.delete(doc.id); }

  /**
   * Refresh the token's display (icons) after a local change.
   * @param {Token} token
   */
  static refreshTokenDisplay(token) { token.renderFlags.set({ redrawEffects: true }); }
}
