/* globals
Application,
duplicate,
foundry,
game,
saveDataToFile
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { Settings } from "./settings.js";
import { MODULE_ID, ICONS, FLAGS } from "./const.js";
import { log } from "./util.js";
import { AsyncQueue } from "./AsyncQueue.js";

import { defaultCoverEffects as dnd5eCoverEffects } from "./coverDefaults/dnd5e.js";
import { defaultCoverEffects as pf2eCoverEffects } from "./coverDefaults/pf2e.js";
import { defaultCoverEffects as sfrpgCoverEffects } from "./coverDefaults/sfrpg.js";
import { defaultCoverEffects as genericCoverEffects } from "./coverDefaults/generic.js";

const NULL_SET = new Set();


/**
 * Abstract class to manage cover objects.
 * Singleton: one instantiation per id.
 * Child ActiveCoverEffect uses active effects to store / apply the cover effect.
 * Child CoverItem uses an item to store / apply the cover effect.
 * All cover object ids are stored in its settings key so they can be located and loaded.
 */
export class CoverEffect {

  /** @type {string} */
  id;

  /**
   * @param {object} [coverObjectData={}]
   */
  constructor(id) {
    // Enforce unique cover type per id.
    this.id = id ?? `${MODULE_ID}.${this.constructor.systemId}.${foundry.utils.randomID()}`;
    const coverObjectsMap = this.constructor.coverObjectsMap;
    if ( coverObjectsMap.has(this.id) ) return coverObjectsMap.get(this.id);
    coverObjectsMap.set(this.id, this);
  }

  /**
   * Create a new cover object. To be used instead of the constructor in most situations.
   * If the storage document is local, constructor can be used instead.
   * @param {string} [id]                     Optional id to use for this cover object.
   *                                          Cover objects are singletons, so if this id is recognized,
   *                                          an existing object will be returned.
   * @return {AbstractCoverObject}
   */
  static async create(id) {
    const obj = new this(id);
    await obj.initializeStorageDocument();
    await this.addStoredCoverObjectId(obj.id); // Must be after creation and initialization.
    return obj;
  }

  // ----- NOTE: Getters, setters, related properties ----- //

  /** @type {Document|object} */
  #document;

  get document() { return this.#document || (this.#document = this._findStorageDocument()); }

  /**
   * Retrieve the cover effect icon for use in the list of cover effects.
   * @returns {string}
   */
  get icon() { return this.document?.icon; }

  /**
   * Retrieve the name of the cover effect for use in the list of cover effects.
   * @returns {string}
   */
  get name() { return this.document?.name; }

  /**
   * Get the default data for this effect.
   * @returns {object}
   */
  get defaultCoverObjectData() { return duplicate(this.constructor.defaultCoverObjectData.get(this.id)); }

  /**
   * Get the stored settings data for this effect.
   */
  get settingsData() { return Settings.get(Settings.KEYS.COVER_EFFECTS.RULES)?.[this.id] ?? {} }

  /**
   * Get the default document data for this effect.
   * @returns {object}
   */
  get defaultDocumentData() {
    const template = this.constructor.newCoverObjectData;
    const data = this.defaultCoverObjectData;
    const doc = foundry.utils.mergeObject(template, data.document, { inplace: false });
    foundry.utils.mergeObject(doc, this.settingsData, { inplace: true });
    doc.name = game.i18n.localize(data.name);
    doc.flags[MODULE_ID][FLAGS.COVER_EFFECT.ID] = data.id;
    return doc;
  }

  /**
   * Get data used to construct a cover effect document based on the currently stored effect document.
   * @type {object}
   */
  get documentData() {
    const data = this.toJSON();
    data._id = foundry.utils.randomID();
    data.flags[MODULE_ID][FLAGS.COVER_EFFECT.ID] = this.id;
    return data;
  }

  /**
   * Get data used to construct a local cover effect document.
   * Local cover effects have the local flag.
   * @type {object}
   */
  get localDocumentData() {
    const data = this.documentData;
    data.flags[MODULE_ID][FLAGS.COVER_EFFECT.LOCAL] = true;
    return data;
  }

  /**
   * Data used when dragging a cover effect to an actor sheet. Non-local.
   */
  get dragData() {
    return {
      name: this.name,
      data: this.documentData
    };
  }


  // NOTE: Getters for cover calculation properties ------ //

  /** @type {number} */
  get percentThreshold() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD] || 0; }

  /** @type {number} */
  get priority() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PRIORITY] || 0; }

  /** @type {boolean} */
  get canOverlap() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.CAN_OVERLAP]; }

  /** @type {boolean} */
  get includeWalls() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.INCLUDE_WALLS]; }

  /** @type {boolean} */
  get includeTokens() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.INCLUDE_TOKENS]; }


  // ----- NOTE: Calculation methods ----- //

  /**
   * Percent cover given this cover effect's settings for a pair of tokens.
   * @param {Token} attackingToken
   * @param {Token} targetToken
   * @returns {number}
   */
  percentCover(attackingToken, targetToken) {
    const { includeWalls, includeTokens } = this;
    return attackingToken.tokencover.coverCalculator.percentCover(targetToken, { includeWalls, includeTokens });
  }

  /**
   * Test if this cover effect could apply to a target token given an attacking token.
   * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
   * @param {Token} attackingToken      Token from which cover is sought
   * @param {Token} targetToken         Token to which cover would apply
   * @param {object} [_opts]            Options parameter that can be used by child classes.
   * @returns {boolean}
   */
  _couldApply(attackingToken, targetToken, _opts) {
    return this.percentCover(attackingToken, targetToken) >= this.percentThreshold;
  }

  // ----- NOTE: Token/Actor methods ----- //

  /**
   * Determine whether the cover effect is on the token.
   * @param {Token} token
   * @returns {boolean}
   */
  isOnToken(token) {
    for ( const effectDoc of this.constructor._effectDocumentsOnToken(token).values() ) {
      if ( effectDoc.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.ID] === this.id ) return true;
    }
    return false;
  }

  /**
   * Add this cover effect to the token.
   * Does not test for whether it should be added or is already present.
   * @param {Token} token
   * @param {boolean} [update=true]   Trigger a refresh of the token display
   * @returns {boolean} True if change was made.
   */
  addToToken(token, update = true) {
    if ( this.isOnToken(token) ) return false;
    if ( !this._addToToken(token) ) return false;
    if ( update ) this.constructor.refreshCoverDisplay(token);
    return true;
  }

  /**
   * Internal method to add this cover effect to the token locally.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _addToToken(_token) { console.error("CoverEffect#_addToToken|Must be handled by child class."); }

  /**
   * Remove this (local) cover effect from the token.
   * @param {Token} token
   * @returns {boolean} True if change was made
   */
  removeFromToken(token, update = true) {
    // Don't call isOnToken first b/c it might be quicker to just attempt removal.
    if ( !this._removeFromToken(token) ) return false;
    if ( update ) this.constructor.refreshCoverDisplay(token);
    return true;
  }

  /**
   * Internal method to remove this cover effect from the token.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _removeFromToken(_token) { console.error("CoverEffect#_removeFromToken|Must be handled by child class."); }


  // ----- NOTE: Document Methods ----- //

  /**
   * Initialize the storage document for this id.
   */
  async initializeStorageDocument() {
    if ( this.#document ) return;
    if ( !this.#document ) this.#document = this._findStorageDocument();
    if ( !this.#document ) this.#document = await this._loadStorageDocument();
    if ( !this.#document ) this.#document = await this._createStorageDocument();
    if ( !this.#document ) console.error("AbstractCoverObject#initializeStorageDocument|Storage document not initialized.");
  }

  /**
   * Find an existing local document to use for the storage.
   * @returns {Document|object|undefined}
   */
  _findStorageDocument() { return { id: this.id }; }

  /**
   * Load an async document to use for storage.
   * Async allows us to pull from compendiums or otherwise construct a default.
   * @returns {Document|object|undefined}
   */
  async _loadStorageDocument() { return { id: this.id }; }

  /**
   * Create a storage document from scratch.
   * @returns {Document|object}
   */
  async _createStorageDocument() { return { id: this.id }; }

  /**
   * Delete the underlying stored document.
   */
  async _deleteStorageDocument() {  }

  /**
   * Update this object with the given data.
   * @param {object} [config={}]
   */
  async update(config = {}) {
    foundry.utils.mergeObject(this.document, config);
  }

  /**
   * Revert this object to default data based on its id.
   */
  async revertToDefaultData() {
    // Delete and recreate the document entirely.
    // Updating is too unreliable given different system reqs for docs.
    await this._deleteStorageDocument();
    await this.loadStorageDocument();
    if ( !this.document ) await this.createStorageDocument();
  }

  /**
   * Duplicate this cover object but place in new object not connected to this one.
   * The duplicated item will have a new id, connected to a new document.
   * @return {AbstractCoverObject}
   */
  async duplicate() {
    const newObj = await this.constructor.create();
    await this.constructor.addStoredCoverObjectId(newObj.id);
    await newObj.fromJSON(this.toJSON())
    return newObj;
  }

  /**
   * Delete this cover object from the objects map and optionally remove stored data.
   * @param {boolean} {deleteStorageDocument = false}    If true, save data is deleted. Async if true.
   */
  async delete() {
    this.constructor.coverObjectsMap.delete(this.id);
    if ( this.#document ) await this._deleteStorageDocument();
    this.#document = undefined;
    return this.constructor.removeStoredCoverObjectId(this.id); // Async
  }

  /**
   * Save a json file for this cover object.
   */
  exportToJSON() { this.document.exportToJSON(); }

  /**
   * Export this cover type data to JSON.
   * @returns {object}
   */
  toJSON() { return this.document.toJSON(); }

  /**
   * Import data from JSON and overwrite.
   */
  async fromJSON(json) {
    try {
      json = JSON.parse(json);
    } catch ( error ) {
      console.error(`${MODULE_ID}|AbstractCoverObject#fromJSON`, error);
      return;
    }
    return this.update(json);
  }

  /**
   * Render the cover effect configuration window.
   */
  async renderConfig() { return this.document.sheet.render(true); }

  /**
   * Render the cover effect rules configuration window.
   */
  async renderRulesConfig() {
    this.rulesConfig ??=  new CoverRulesConfig(this.document);
    return this.rulesConfig.render(true);
  }

  // ----- NOTE: Static getter, setters, related properties ----- //

  /** @type {Map<string,CoverEffect>} */
  static coverObjectsMap = new Map();

  /** @type {string} */
  static get settingsKey() { return Settings.KEYS.COVER_EFFECTS.DATA; }

  /** @type {Set<string>} */
  static get storedCoverObjectIds() {
    const out = Settings.get(this.settingsKey);
    if ( !out ) return new Set();
    if ( out instanceof Array ) return new Set(out);
    return new Set(Object.keys(out));
  }

  /** @type {string} */
  static get systemId() { return game.system.id; }

  /**
   * Get all effects ordered by priority as well as unordered effects.
   * @type {object}
   *   - @prop {AbstractCoverObject[]} ordered          From highest to lowest priority
   *   - @prop {Set<AbstractCoverObject> unordered}     All objects with priority === 0
   */
  static get sortedCoverObjects() {
    const ordered = [];
    const unordered = new Set();
    for ( const coverEffect of this.coverObjectsMap.values() ) {
      if ( !coverEffect.priority ) unordered.add(coverEffect);
      else ordered.push(coverEffect);
    }
    ordered.sort((a, b) => b.priority - a.priority);
    return { ordered, unordered };
  }

  /**
   * Get default cover types for different systems.
   * @returns {Map<string, object>} Map of objects with keys corresponding to cover type object ids.
   */
  static get defaultCoverObjectData() {
    switch ( game.system.id ) {
      case "dnd5e": return dnd5eCoverEffects;
      case "pf2e": return pf2eCoverEffects;
      case "sfrpg": return sfrpgCoverEffects;
      default: return genericCoverEffects;
    }
  }

  /**
   * Data used to construct a new blank cover effect.
   * @type {object}
   */
  static get newCoverObjectData() {
    return {
      name: game.i18n.format(`${MODULE_ID}.phrases.xCoverEffect`, { cover: game.i18n.localize("New") }),
      icon: ICONS.SHIELD_THICK_GRAY.FULL,
      flags: {
        [MODULE_ID]: {
          [FLAGS.COVER_EFFECT.ID]: foundry.utils.randomID(),
          [FLAGS.VERSION]: game.modules.get(MODULE_ID).version,
          [FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD]: 0,
          [FLAGS.COVER_EFFECT.RULES.PRIORITY]: 0,
          [FLAGS.COVER_EFFECT.RULES.OVERLAPS]: false,
          [FLAGS.COVER_EFFECT.RULES.INCLUDE_WALLS]: true,
          [FLAGS.COVER_EFFECT.RULES.INCLUDE_TOKENS]: false
        }
      }
    }
  }

  // ----- NOTE: Static cover calculation methods ----- //

  /**
   * Determine what cover effects apply to a target token given an attacking token.
   * @param {Token} attackingToken
   * @param {Token} targetToken
   * @returns {Set<CoverEffect>}
   */
  static coverForToken(attackingToken, targetToken, opts = {}) {
    const effects = new Set();
    const { ordered, unordered } = this.sortedCoverObjects;

    // Test cover effects in priority order.
    for ( const coverEffect of ordered ) {
      if ( coverEffect._couldApply(attackingToken, targetToken, opts) ) {
        effects.add(coverEffect);
        if ( !coverEffect.canOverlap ) break;
      }
    }

    // Test cover effects without a set priority.
    for ( const coverEffect of unordered ) {
      // If there is already an effect, cannot use a non-overlapping effect.
      if ( !coverEffect.canOverlap && effects.size ) continue;
      if ( coverEffect._couldApply(attackingToken, targetToken, opts) ) effects.add(coverEffect);
    }
    return effects;
  }

  // ----- NOTE: Static token methods ----- //

  /**
   * Get all documents for a give token/actor that could contain a cover effect.
   * Each document should be an object that has a "flags" property.
   * @param {Token} token
   * @returns {EmbeddedCollection|DocumentCollection|Map}
   */
  static _effectDocumentsOnToken(_token) { console.error("CoverEffect#_effectDocumentsOnToken must be handled by child class."); }

  /**
   * Retrieve all cover effects on the token.
   * @param {Token} token
   * @returns {Set<CoverEffect>}
   */
  static allCoverOnToken(token) {
    const effects = new Set();
    const ID  = FLAGS.COVER_EFFECT;
    const objs = this.coverObjectsMap;
    for ( const effectDoc of this._effectDocumentsOnToken(token) ) {
      const id = effectDoc.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.ID];
      if ( id ) effects.add(objs.get(id));
    }
    return effects;
  }

  static allLocalCoverOnToken(token) {
    const effects = new Set();
    const ID  = FLAGS.COVER_EFFECT;
    const objs = this.coverObjectsMap;
    for ( const effectDoc of this._effectDocumentsOnToken(token).values() ) {
      const id = effectDoc.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.ID];
      const isLocal = effectDoc.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.LOCAL];
      if ( id && isLocal) effects.add(objs.get(id));
    }
    return effects;
  }

  /**
   * @param {Token} token
   * @param {Set<CoverEffect>} coverEffects
   * @param {boolean} True if a change was made
   */
  static replaceLocalEffectsOnToken(token, coverEffects = NULL_SET) {
    const previousEffects = new Set(this.allCoverOnToken(token));
    if ( coverEffects.equals(previousEffects) ) return false;

    // Filter to only effects that must change.
    const toRemove = previousEffects.difference(coverEffects);
    const toAdd = coverEffects.difference(previousEffects);
    if ( !(toRemove.size || toAdd.size) ) return false;

    // Remove unwanted effects then add new effects.
    log(`CoverEffect#replaceLocalEffectsOnToken|${this.name}|${token.name}`);
    toRemove.forEach(ce => ce.addToToken(token, false))
    toAdd.forEach(ce => ce.removeFromToken(token, false));

    // At least one effect should have been changed, so refresh cover effect display on token.
    this.refreshCoverDisplay(token);
    return true;
  }

  /**
   * Refresh the display of the cover effect on the token.
   * @param {Token} token
   */
  static refreshCoverDisplay(token) {
    const actor = token.actor;
    if ( !actor ) return;
    log(`CoverEffect#refreshCoverDisplay|${actor.name}`);
    actor.prepareData(); // Trigger active effect update on the actor data.
    queueSheetRefresh(actor);
  }

  /**
   * Determine if the GM has added a cover effect override to a token.
   * Cover effect overrides have a COVER_EFFECT.ID flag but no local flag.
   * @param {Token} actor
   * @returns {boolean}
   */
  static coverOverrideApplied(token) {
    const { ID, LOCAL } = FLAGS.COVER_EFFECT;
    for ( const effectDoc of this._effectDocumentsOnToken(token) ) {
      const modFlags = effectDoc?.flags?.[MODULE_ID];
      if ( !modFlags ) continue;
      if ( modFlags[ID] && !modFlags[LOCAL] ) return true;
    }
    return false;
  }

  // ----- NOTE: Static document methods ----- //

  /**
   * Add an id to the stored cover object ids.
   * @param {string} id
   */
  static async addStoredCoverObjectId(id) {
    const storedIds = this.storedCoverObjectIds;
    if ( storedIds.has(id) ) return;
    storedIds.add(id);

    // Clean up null or undefined values. Shouldn't happen, but...
    storedIds.delete(undefined);
    storedIds.delete(null);
    return Settings.set(this.settingsKey, [...storedIds.values()]);
  }

  /**
   * Remove an id from the stored cover object ids.
   * @param {string} id
   */
  static async removeStoredCoverObjectId(id) {
    const storedIds = this.storedCoverObjectIds;
    if ( !storedIds.has(id) ) return;
    storedIds.delete(id);

    // Clean up null or undefined values. Shouldn't happen, but...
    storedIds.delete(undefined);
    storedIds.delete(null);
    return Settings.set(this.settingsKey, [...storedIds.values()]);
  }

  /**
   * Remove all stored cover object ids.
   * Used when resetting.
   */
  static async removeAllStoredCoverObjectIds() { return Settings.set(this.settingsKey, undefined); }

  /**
   * Create an object for each stored id. If no ids in settings, create from default ids.
   */
  static async initialize() {
    let storedIds = this.storedCoverObjectIds;
    if ( !storedIds.size ) storedIds = this.defaultCoverObjectData.keys();
    for ( const id of storedIds ) await this.create(id);
    this.transitionDocuments();
  }

  /**
   * Delete all documents associated with this cover object.
   */
  static async _deleteAllDocuments() {
    const promises = [];
    this.coverObjectsMap.forEach(c => promises.push(c.delete()));
    await Promise.allSettled(promises);
  }

  /**
   * Reset to the defaults for this cover object type.
   */
  static async resetToDefaults() {
    await this._deleteAllDocuments();
    await this.removeAllStoredCoverObjectIds();
    this.coverObjectsMap.clear();
    return this.initialize();
  }

  /**
   * Save all cover objects to a json file.
   */
  static saveAllToJSON() {
    const filename = `${MODULE_ID}_CoverObjects`;
    const data = { coverObjects: [], flags: {} };
    this.coverObjectsMap.forEach(c => data.coverObjects.push(c.toJSON()));
    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      [`${MODULE_ID}Version`]: game.modules.get(MODULE_ID).version
    };
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
  }

  /**
   * Import all cover types from a json file.
   * @param {JSON} json   Data to import
   */
  static async importAllFromJSON(json) {
    json = JSON.parse(json);
    if ( !json.flags?.exportSource?.[`${MODULE_ID}Version`] ) {
      console.error("JSON file not recognized.");
      return;
    }

    // Remove all existing.
    await this._deleteAllDocuments();
    await this.removeAllStoredCoverObjectIds();
    this.coverObjectsMap.clear();

    // Cycle through each json object in turn.
    // Create a blank object using the id from the json and then update it with the json data.
    const promises = [];
    for ( const data of json.coverObjects ) {
      const coverObj = await this.create(data.id);
      promises.push(coverObj.fromJSON(JSON.stringify(data)));
    }
    return Promise.allSettled(promises);
  }

  /**
   * Transition all cover documents in a scene, when updating versions.
   */
  async transitionDocuments() {
    console.error("CoverEffect#transitionDocuments must be handled by child class");
  }
}

// ----- NOTE: Helper functions ----- //


/**
 * Handle multiple sheet refreshes by using an async queue.
 * If the actor sheet is rendering, wait for it to finish.
 */
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

const renderQueue = new AsyncQueue();

const queueObjectFn = function(ms, actor) {
  return async function rerenderActorSheet() {
    log(`CoverEffect#rerenderActorSheet|Testing sheet for ${actor.name}`);

    // Give up after too many iterations.
    const MAX_ITER = 10;
    let iter = 0;
    while ( iter < MAX_ITER && actor.sheet?._state === Application.RENDER_STATES.RENDERING ) {
      iter += 1;
      await sleep(ms);
    }
    if ( actor.sheet?.rendered ) {
      log(`CoverEffect#rerenderActorSheet|Refreshing sheet for ${actor.name}`);
      await actor.sheet.render(true);
    }
  }
}

function queueSheetRefresh(actor) {
  log(`CoverEffect#rerenderActorSheet|Queuing sheet refresh for ${actor.name}`);
  const queueObject = queueObjectFn(100, actor);
  renderQueue.enqueue(queueObject); // Could break up the queue per actor but probably unnecessary?
}
