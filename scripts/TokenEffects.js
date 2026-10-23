/* globals
foundry
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { getBackend, EFFECT_BACKENDS } from "./effect_backends.js";
import { UniqueEffectDefinition } from "./UniqueEffectDefinition.js";

/**
 * Everything to do with putting a UniqueEffectDefinition on (or off) a token.
 *
 * Deliberately has exactly one mode of operation: local and synchronous. This runs every time
 * cover/terrain is recalculated for a token - potentially every animation frame while a viewer
 * token is dragged around a scene - so nothing here may `await` or touch the database.
 *
 * A single call can mix definitions from different categories (e.g. cover + terrain at once),
 * and those categories may resolve to different backends/document types (dnd5e cover as a
 * built-in status vs. terrain as a regular Active Effect) - so every doc-producing step below
 * resolves its backend per-definition rather than once for the whole call. Removal, by
 * contrast, just dispatches on the document's own type (ActiveEffect vs Item), which is enough
 * to find the right collection regardless of which backend originally created it.
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
    const actor = token.actor;
    if ( !actor ) return map;
    for ( const doc of [...(actor.effects ?? []), ...(actor.items ?? [])] ) {
      const id = this._resolveAppliedId(doc);
      if ( id ) map.set(id, doc);
    }
    return map;
  }

  /**
   * Which (if any) known definition a document represents, trying each backend's identity
   * check in turn. Cheap-only ever runs against the handful of docs already on one actor.
   * @param {Document} doc
   * @returns {string|undefined}
   */
  static _resolveAppliedId(doc) {
    for ( const backend of new Set(Object.values(EFFECT_BACKENDS)) ) {
      if ( backend.documentName !== doc.documentName ) continue;
      const id = backend.getAppliedId(doc);
      if ( id && UniqueEffectDefinition.get(id) ) return id;
    }
    return undefined;
  }

  /**
   * Is this definition currently applied to this token?
   * @param {Token} token
   * @param {UniqueEffectDefinition} definition
   * @returns {boolean}
   */
  static has(token, definition) { return this._appliedMap(token).has(definition.id); }

  /**
   * All definitions currently applied to a token of a given category.
   * @param {Token} token
   * @returns {UniqueEffectDefinition[]}
   */
  static all(token, category = "cover") {
    return [...this._appliedMap(token).keys()]
      .map(id => UniqueEffectDefinition.get(id))
      .filter(Boolean)
      .filter(def => def.category === category);
  }

  /**
   * Add 1+ definitions to a token, locally.
   * @param {token} token
   * @param {UniqueEffectDefinition[]} definitions
   * @param {object} [opts]
   * @param {boolean} [opts.exclusive = false]  Remove other applied definitions that share a category first.
   * @param {object } [opts.data]               Extra data merged into each created document
   * @returns {boolean} True if token changed.
   */
  static add(token, definitions, { exclusive = false, data } = {}) {
    const actor = token.actor;
    if ( !actor ) return false;

    const applied = this._appliedMap(token);
    const toAdd = definitions.filter(d => !applied.has(d.id) || d.allowsDuplicates);
    if ( !toAdd.length ) return false;

    if ( exclusive ) {
      const categories = new Set(toAdd.map(d => d.category));
      const addIds = new Set(toAdd.map(d => d.id));
      const toRemove = [...applied.entries()]
        .filter(([id]) => !addIds.has(id) && categories.has(UniqueEffectDefinition.get(id)?.category))
        .map(([, doc]) => doc);
      this._deleteDocs(actor, toRemove);
    }

    for ( const definition of toAdd ) {
      const backend = getBackend(definition.category);
      const collection = backend.tokenCollection(actor);
      if ( !collection ) continue;
      const docData = backend.buildTokenData(definition, token, data);
      // Assign the id manually: collection.createDocument() does not do this for us, and the
      // field may be locked on a cloned template's data (see upstream PR #44 / issue #46).
      docData._id = foundry.utils.randomID();
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
   * @param {UniqueEffectDefinition[]} definitions
   * @returns {boolean} true if the token changed.
   */
  static remove(token, definitions) {
    const actor = token.actor;
    if ( !actor ) return false;

    const ids = new Set(definitions.map(d => d.id));
    const applied = this._appliedMap(token);
    const toRemove = [...applied.entries()].filter(([id]) => ids.has(id)).map(([, doc]) => doc);
    if ( !toRemove.length ) return false;

    this._deleteDocs(actor, toRemove);
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
  static _deleteDocs(actor, docs) {
    for ( const doc of docs ) {
      const collection = doc.documentName === "Item" ? actor.items : actor.effects;
      collection.delete(doc.id);
    }
  }

  // ----- NOTE: Refresh Token ----- //

  /**
   * Per-actor debounced sheet re-render functions. Tied to the actor.
   * @type {WeakMap<Actor, function>}
   */
  static #sheetRefreshers = new WeakMap();

  /** Minimum ms between sheet re-renders for one actor while effects are changing rapidly. */
  static SHEET_REFRESH_MS = 200; // Between 100 and 250 is a good range.

  /**
   * Refresh the token's display (icons) after a local change.
   * @param {Token} token
   */
  static refreshTokenDisplay(token) {
    token.renderFlags.set({ redrawEffects: true });
    if ( token.actor ) this.refreshActorSheets(token.actor);
  }

  /**
   * Re-render open applications for the actor.
   * This updates displayed values, e.g. dnd5e AC, to reflect the re-prepared data.
   * `actor.reset()` updates the data but not the already-rendered HTML.
   * (Tooltips and formulas are computed from live data on hover.)
   *
   * Cheap when nothing is open. Debounces when a sheet is open to avoid re-rendering every frame.
   * @param {Actor} actor
   */
  static refreshActorSheets(actor) {
    if ( foundry.utils.isEmpty(actor.apps) ) return;
    let refresh = this.#sheetRefreshers.get(actor);
    if ( !refresh ) {
      // Uses render(false) to only re-render applications that are already rendered; never opens one.
      refresh = foundry.utils.debounce(() => actor.render(false), this.SHEET_REFRESH_MS);
      this.#sheetRefreshers.set(actor, refresh);
    }
    refresh();
  }
}
