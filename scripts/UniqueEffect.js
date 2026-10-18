/* globals
foundry,
game
*/

/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "../const.js";
import { log } from "../util.js";
import { getBackend } from "./effect_backends.js";

/**
 * A single terrain/cover/etc. *definition*: name, icon, mechanical changes, and a couple of
 * display flags. This is the only class that represents a definition - there is no per-system
 * subclass (compare to the old AbstractUniqueEffect -> UniqueActiveEffect/UniqueItemEffect/
 * UniqueFlagEffect tree). All system-specific behavior lives in the backend returned by
 * getBackend(); this class just calls it.
 *
 * There are only ever a handful of definitions (a dozen or two cover/terrain types), created
 * or edited rarely by a GM, so a simple Map registry here is fine - this is NOT the same thing
 * as tracking which tokens currently have an effect applied (see TokenEffects for that, which
 * is the part that has to be fast and DB-free).
 */

export class UniqueEffect {

  /** @type {Map<string, UniqueEffectDefinition>} */
  static _definitions = new Map();

  /** @type {Document} The stored template document - an ActiveEffect or Item, per backend. */
  document;

  constructor(document) { this.document = document; }

  // ----- NOTE: Basic properties ----- //

  /** @type {string} */
  get id() { return this.document.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID); }

  /** @type {string} */
  get name() { return this.document.name; }

  /** @type {string} */
  get img() { return this.document.img; }

  /** @type {string} Used to group definitions for "exclusive" application (see TokenEffects.add). */
  get category() { return this.document.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.TYPE) ?? "UniqueEffect"; }

  /** @type {boolean} */
  get allowsDuplicates() { return this.document.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.DUPLICATES_ALLOWED) ?? false; }

  /** @type {boolean} */
  get displayIcon() { return this.document.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.DISPLAY_ICON) ?? true; }

  /** @returns {UniqueEffectDefinition[]} */
  static get all() { return [...this._definitions.values()]; }

  /**
   * @param {string} id
   * @returns {UniqueEffectDefinition|undefined}
   */
  static get(id) { return this._definitions.get(id); }

  // ----- NOTE: Drag / import / export ----- //

  /** @returns {object} Data used when dragging this definition to an actor sheet or token. */
  toDragData() {
    return { type: getBackend().documentName, name: this.name, uuid: this.document.uuid };
  }

  /** @returns {string} */
  toJSON() { return this.document.toJSON(); }

  /** @param {string} json */
  async fromJSON(json) {
    try { json = JSON.parse(json); }
    catch ( err ) {
      console.error(`${MODULE_ID}|UniqueEffectDefinition#fromJSON`, err);
      return false;
    }
    return this.update(json);
  }

  // ----- NOTE: Persisted CRUD ----- //
  // Rare: a GM configuring effect types. Fine to be async - this is not the per-token hot path.

  /**
   * Create a brand-new definition and register it.
   * @param {object} [data]   Additional data merged over the defaults (name, img, changes, etc.)
   * @returns {UniqueEffectDefinition}
   */
  static async create(data = {}) {
    const backend = getBackend();
    const id = foundry.utils.randomID();
    const merged = foundry.utils.mergeObject(this._defaultData(id), data, { inplace: false });
    const doc = await backend.createDefinitionDocument(merged);
    const definition = new this(doc);
    this._definitions.set(id, definition);
    return definition;
  }

  /** @param {object} data */
  async update(data) {
    await getBackend().updateDefinitionDocument(this.document, data);
    return true;
  }

  /** Delete this definition entirely (not just remove it from tokens). */
  async delete() {
    await getBackend().deleteDefinitionDocument(this.document);
    this.constructor._definitions.delete(this.id);
  }

  /**
   * Flag data every definition document must carry.
   * @param {string} id
   * @returns {object}
   */
  static _defaultData(id) {
    return {
      name: "New Effect",
      flags: {
        [MODULE_ID]: {
          [FLAGS.UNIQUE_EFFECT.ID]: id,
          [FLAGS.UNIQUE_EFFECT.TYPE]: "UniqueEffect",
          [FLAGS.UNIQUE_EFFECT.DUPLICATES_ALLOWED]: false,
          [FLAGS.UNIQUE_EFFECT.DISPLAY_ICON]: true
        }
      }
    };
  }

  // ----- NOTE: Initialization ----- //

  /** Load all persisted definitions into memory. Call once, e.g. at canvas.init/ready. */
  static async initialize() {
    const backend = getBackend();
    await backend.initializeStorage();
    const stored = backend.storageCollection();
    this._definitions.clear();
    if ( !stored ) return;
    for ( const doc of stored.values() ) {
      const id = doc.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID);
      if ( id ) this._definitions.set(id, new this(doc));
    }
    log(`UniqueEffectDefinition|Loaded ${this._definitions.size} definitions.`);
  }

  /**
   * Create any shipped default definitions (e.g. standard cover/terrain types) that don't
   * already exist. Safe to call every load - it skips ids that are already defined.
   * @param {Object<string,string>} paths   id -> path to a JSON effect-data file
   */
  static async loadDefaults(paths) {
    for ( const [id, path] of Object.entries(paths ?? {}) ) {
      if ( this._definitions.has(id) ) continue;
      const data = await foundry.utils.fetchJsonWithTimeout(path);
      if ( !data ) continue;
      data.name = game.i18n.localize(data.name);
      foundry.utils.setProperty(data, `flags.${MODULE_ID}.${FLAGS.UNIQUE_EFFECT.ID}`, id);
      await this.create(data);
    }
  }
}
