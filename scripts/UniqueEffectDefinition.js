/* globals
foundry,
game
*/

/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { Settings } from "./settings.js";
import { log } from "./util.js";
import { getBackend } from "./effect_backends.js";

/**
 * A single terrain/cover/etc. *definition*: name, icon, mechanical changes, and a couple of
 * display flags. This is the only class that represents a definition - there is no per-system
 * subclass (compare to the old AbstractUniqueEffect -> UniqueActiveEffect/UniqueItemEffect/
 * UniqueFlagEffect tree). All system-specific behavior lives in the backend returned by
 * getBackend(); this class just calls it.
 *
 * Definitions are no longer authored or stored by this module at all. For dnd5e's built-in
 * cover statuses there is nothing to store - they already live in CONFIG.statusEffects. For
 * everything else, a definition is just a GM-picked UUID pointing at an existing compendium or
 * world ActiveEffect/Item; we never create, edit, or delete that document, only reference it
 * (v14 lets any document be reached with `fromUuid` regardless of where it lives, so there's no
 * need for the old "hidden storage Item" that effects had to be embedded in to be addressable).
 */

export class UniqueEffectDefinition {

  /** @type {Map<string, UniqueEffectDefinition>} */
  static _definitions = new Map();

  /**
   * @param {object} data
   * @param {string} data.id
   * @param {string} data.name
   * @param {string} data.img
   * @param {string} [data.category="UniqueEffect"]   Groups definitions for exclusive application.
   * @param {boolean} [data.allowsDuplicates=false]
   * @param {boolean} [data.displayIcon=true]
   * @param {Document} [data.document]
   */
  constructor({
    id,
    name,
    img,
    category = "UniqueEffect",
    allowsDuplicates = false,
    displayIcon = true,
    document = null
  }) {
    this.id = id;
    this.name = name;
    this.img = img;
    this.category = category;
    this.allowsDuplicates = allowsDuplicates;
    this.displayIcon = displayIcon;
    this.document = document;
  }

  // ----- NOTE: Basic properties ----- //

  /** @type {string} */
  id;

  /** @type {string} */
  name;

  /** @type {string} */
  img;

  /** @type {string} Used to group definitions for "exclusive" application (see TokenEffects.add). */
  category;

  /** @type {boolean} */
  allowsDuplicates;

  /** @type {boolean} */
  displayIcon;

  /** @type {Document|null} The source document, for compendium-reference definitions. */
  document;

  /** @returns {UniqueEffectDefinition[]} */
  static get all() { return [...this._definitions.values()]; }

  /**
   * @param {string} id
   * @returns {UniqueEffectDefinition|undefined}
   */
  static get(id) { return this._definitions.get(id); }

  /** @returns {object} Data used when dragging this definition to an actor sheet or token. */
  toDragData() {
    const backend = getBackend(this.category);
    return { type: backend.documentName, name: this.name, uuid: this.document?.uuid ?? this.id };
  }

  /**
   * The cover definition that applies at a given cover percent: the highest threshold met.
   * Synchronous; safe on the per-frame path. Returns undefined below every threshold.
   * (Sources are added/removed in the CoverRulesConfig menu, not through this class.)
   * @param {number} percent   0-100
   * @returns {UniqueEffectDefinition|undefined}
   */
  static forCoverPercent(percent) {
    const def = Settings.coverDefinitions.forPercent(percent);
    return def ? this._definitions.get(Settings.coverDefinitions.sourceId(def)) : undefined;
  }

  // ----- NOTE: Initialization ----- //

  /**
   * Load every definition relevant to the current system/settings. Call once, e.g. at ready.
   * Rare/async by nature (fromUuid may hit a compendium)-this is not the per-token hot path.
   */
  static async initialize() {
    this._definitions.clear();
    // "cover" and "terrain" may resolve to different backends (e.g. dnd5e cover as a built-in
    // status, terrain as a regular Active Effect) - load whichever backend(s) are actually
    // active, not every backend that exists.
    const backends = new Set([getBackend("cover"), getBackend("terrain")]);
    for ( const backend of backends ) {
      const defs = await backend.loadDefinitions();
      for ( const d of defs ) this._definitions.set(d.id, new this(d));
    }
    log(`UniqueEffectDefinition|Loaded ${this._definitions.size} definitions.`);
  }
}
