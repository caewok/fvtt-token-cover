/* globals
*/
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverType } from "./CoverType.js";
import { Settings } from "./settings.js";
import { AbstractCoverObject } from "./AbstractCoverObject.js";
import { CoverEffectConfig } from "./CoverEffectConfig.js";
import { AsyncQueue } from "./AsyncQueue.js";
import { log } from "./util.js";

// Patches to remove the cover effect item from the sidebar tab.
export const PATCHES_SidebarTab = {};
export const PATCHES_ItemDirectory = {};
PATCHES_SidebarTab.COVER_EFFECT = {};
PATCHES_ItemDirectory.COVER_EFFECT = {};

/**
 * Remove the cover effects item from sidebar so it does not display.
 * From https://github.com/DFreds/dfreds-convenient-effects/blob/main/scripts/ui/remove-custom-item-from-sidebar.js#L3
 * @param {ItemDirectory} dir
 */
function removeCoverEffectsItemFromSidebar(dir) {
  if ( !(dir instanceof ItemDirectory) ) return;
  const id = CoverEffect.COVER_EFFECTS_ITEM;
  if ( !id ) return;
  const li = dir.element.find(`li[data-document-id="${id}"]`);
  li.remove();
}

PATCHES_SidebarTab.COVER_EFFECT.HOOKS = { changeSidebarTab: removeCoverEffectsItemFromSidebar };
PATCHES_ItemDirectory.COVER_EFFECT.HOOKS = { renderItemDirectory: removeCoverEffectsItemFromSidebar };

/**
 * Handles applying effects to tokens that should be treated as cover.
 * Generic as to how exactly the effect is stored and applied, but presumes it is stored in a document.
 * Applies the cover effect to tokens.
 * Imports/exports effect data.
 * Stores/retrieves effect data.
 * Sets up default effects.
 */
export class CoverEffect extends AbstractCoverObject {

  /**
   * Construct a new active effect if none present.
   * Create the associated storage document.
   * @param {ActiveEffectData} [coverEffectData={}]     Data to use when constructing new effect
   * @param {boolean} [overwrite=false]                 If true, update the active effect with this data
   */
  async initialize(coverEffectData = {}, overwrite = false) {
    // By convention and for ease-of-use, doc id can be set at the base of the data or in a flag.
    // Move to a flag.
    coverEffectData.flags ??= {};
    coverEffectData.flags[MODULE_ID] ??= {};
    const id = coverEffectData.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ?? coverEffectData.id;
    coverEffectData.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] = id;
    delete coverEffectData.id;

    // Do we already have a document defined?
    const doc = this.#document ??= this.constructor.findStorageDocument(coverEffectData);
    if ( !overwrite && doc ) return;

    // Ensure necessary flags are present.
    const coverTypes = coverEffectData.flags[MODULE_ID][FLAGS.COVER_TYPES] ??= [];

    // Move cover types to flags.
    if ( coverEffectData.coverTypes ) {
      coverEffectData.coverTypes.forEach(id => coverTypes.push(id));
      delete coverEffectData.coverTypes;
    }
    coverEffectData = this.constructor._localizeDocumentData(coverEffectData);

    // Use save to overwrite; otherwise just create a new storage document if not present.
    // Both options are async.
    if ( doc ) return this.save(coverEffectData);
    else return this.createStorageDocument(coverEffectData);
  }

  // ----- NOTE: Getters, setters, and related properties ----- //

  /** @type {object} */
  get config() { return this.document.toJSON(); }

  /** @type {string[]} */
  get #coverTypesArray() { return this.config.flags[MODULE_ID][FLAGS.COVER_TYPES]; }

  /** @type {CoverType[]} */
  get coverTypes() {
    return this.#coverTypesArray.map(typeId => CoverType.coverObjectsMap.get(typeId));
  }

  set coverType(value) {
    if ( typeof value === "string" ) value = CoverType.coverObjectsMap.get(value);
    if ( !(value instanceof CoverType) ) {
      console.error("CoverEffect#coverType must be a CoverType or CoverType id.");
      return;
    }
    this.config.flags[MODULE_ID][FLAGS.COVER_TYPE] = value.config.id;
  }

  /**
   * Get data used to construct a Cover Effect document.
   */
  get documentData() {
    const data = { ...this.config };
    data._id = foundry.utils.randomID();
    data.name ??= game.i18n.format("tokencover.phrases.xCoverEffect", { cover: game.i18n.localize(data.name) });
    return this.constructor._localizeDocumentData(data);
  }

  /**
   * Retrieve the active effect for this cover effect from the cover effect item.
   * @return {Document}
   */
  #document

  get document() { return this.#document; }

  /**
   * Retrieve the cover effect icon for use in the list of cover effects.
   * @return {string}
   */
  get icon() { return this.config.icon; }

  /**
   * Retrieve the name of the cover effect for use in the list of cover effects.
   * @return {string}
   */
  get name() { return this.config.name; }

  // ----- NOTE: Methods ----- //

  /**
   * Create the storage document or return the existing document.
   * @param {object} coverEffectData
   * @returns {Document}
   */
  async createStorageDocument(coverEffectData) {
    if ( this.document || !coverEffectData ) return existing;
    this.#document = await this._createStorageDocument(coverEffectData);
    return this.#document;
  }

  /**
   * Get the actual storage document, such as an ActiveEffect or an Item
   * @param {object} coverEffectData     Data to store
   * @returns {Document}
   */
  async _createStorageDocument(coverEffectData) {
    console.error("CoverEffect#_createStorageDocument must be handled by child class.");
  }

  /**
   * Ignored, as config pulls directly from the active effect.
   */
  update() { console.warn("CoverEffect does not use update method."); }

  /**
   * Ignored, as config pulls directly from the active effect.
   */
  load() { console.warn("CoverEffect does not use load method."); }

  /**
   * Save to the storage document, creating a new document if necessary.
   * Requires explicit data in order to overwrite the existing effect.
   * @param {object} coverEffectData
   * @param {Promise<*>} Result of document.update
   */
  async save(coverEffectData) {
    if ( !coverEffectData ) return;
    coverEffectData = this.constructor._localizeDocumentData();
    const doc = this.document ?? (await this.createStorageDocument(coverEffectData));
    return doc.update(coverEffectData);
  }

  /**
   * Delete the stored document associated with this cover effect.
   * Typically used if destroying the cover effect or resetting to defaults.
   * @return {boolean} True if deleted.
   */
  async deleteSaveData() {
    if ( !this.document ) return false;
    const res = await _deleteStorageDocument();
    if ( res ) this.#document = undefined;
    return res;
  }

  /**
   * Delete the stored document associated with this cover effect.
   * Child class creates.
   * @return {boolean} Must return true if document is deleted.
   */
  async _deleteStorageDocument() {
    console.error("CoverEffect#_deleteSaveData must be handled by child class.");
  }

  /**
   * Add a single cover type to this effect.
   * @param {CoverType|string} coverType      CoverType object or its id.
   */
  _addCoverType(coverType) {
    if ( typeof coverType === "string" ) coverType = CoverType.coverObjectsMap.get(coverType);
    if ( !(coverType instanceof CoverType) ) {
      console.error("CoverEffect#coverType must be a CoverType or CoverType id.");
      return;
    }
    this.#coverTypesArray.push(coverType.id);
  }

  /**
   * Remove a single cover type.
   * @param {CoverType|string} coverType      CoverType object or its id.
   */
  _removeCoverType(coverType) {
    if ( typeof coverType === "string" ) coverType = CoverType.coverObjectsMap.get(coverType);
    if ( !(coverType instanceof CoverType) ) {
      console.error("CoverEffect#coverType must be a CoverType or CoverType id.");
      return;
    }
    this.#coverTypesArray.findSplice(ct => ct.id === coverType.id);
  }

  /**
   * Clear all cover types
   */
  _removeAllCoverTypes() { this.#coverTypesArray.length = 0; }

  /**
   * Test if the local effect is already on the actor.
   * Must be handled by child class.
   * @param {Actor} actor
   * @returns {boolean} True if local effect is on the actor.
   */
  _localEffectOnActor(actor) {
    console.error("CoverEffect#_localEffectOnActor must be handled by child class.");
  }

  /**
   * Add the effect locally to an actor.
   * @param {Token|Actor} actor
   * @param {boolean} Returns true if added.
   */
  addToActorLocally(actor, update = true) {
    if ( actor instanceof Token ) actor = actor.actor;
    log(`CoverEffect#addToActorLocally|${actor.name} ${this.config.name}`);

    if ( this._localEffectOnActor(actor) ) return false;
    const newId = this._addToActorLocally(actor);
    if ( !newId ) return false;
    this.constructor._documentIds.set(newId, this);
    if ( update ) refreshActorCoverEffect(actor);
    return true;
  }

  /**
   * Add the effect locally to an actor.
   * @param {Token|Actor} actor
   * @returns {boolean} Returns true if added.
   */
  _addToActorLocally(actor) {
    console.error("CoverEffect#_addToActorLocally must be handled by child class.");
  }

  /**
   * Remove the effect locally from an actor.
   * @param {Actor} actor
   * @param {boolean} Returns true if change was required.
   */
  removeFromActorLocally(actor, update = true) {
    log(`CoverEffect#removeFromActorLocally|${actor.name} ${this.config.name}`);
    if ( actor instanceof Token ) actor = actor.actor;
    if ( !this._localEffectOnActor(actor) ) return false;

    // Remove documents associated with this cover effect from the actor.
    const removedIds = this._removeFromActorLocally(actor);
    if ( !removedIds.length ) return false;
    removedIds.forEach(id => this.constructor.documentIds.delete(id));
    if ( update ) refreshActorCoverEffect(actor);
    return true;
  }

  /**
   * Remove the effect locally from an actor.
   * Presumes the effect is on the actor.
   * @param {Actor} actor
   * @returns {boolean} Returns true if removed.
   */
  _removeFromActorLocally(actor) {
    console.error("CoverEffect#_addToActorLocally must be handled by child class.");
  }

  /**
   * Render the cover effect configuration window.
   */
  async renderConfig() { return this.document.sheet.render(true); }

  // ----- NOTE: Static: Track Cover effects ----- //
  /** @type {Map<string,CoverType>} */
  static coverObjectsMap = new Map();

  // ----- NOTE: Other static getters, setters, related properties ----- //

  /**
   * Link document ids (for effects on actors) to this effect.
   * Makes it easier to determine if this cover effect has been applied to an actor.
   * @type {Map<string, CoverEffect>}
   */
  static _documentIds = new Map();

  /**
   * Retrieve an id from cover data.
   * @param {object} coverEffectData
   */
  static idFromData(coverEffectData) { return coverEffectData?.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT_ID] ?? coverEffectData.id; }

  /** @type {string} */
  static get systemId() { return game.system.id; }

  // ----- NOTE: Static methods ----- //

  /**
   * Find the storage document for given coverEffectData or id.
   * Must be handled by child class.
   * @param {object} coverEffectData
   * @returns {Document|undefined} Undefined if no document found.
   */
  static findStorageDocument(coverEffectData) {
    console.error("CoverEffect#findStorageDocument must be handled by child class.");
  }

  /**
   * Localize document data. Meant for subclasses that are aware of the document structure.
   * @param {object} coverEffectData
   * @returns {object} coverEffectData
   */
  static _localizeDocumentData(coverEffectData) { return coverEffectData; }

  /**
   * Retrieve all Cover Effects on the actor.
   * @param {Token|Actor} actor
   * @returns {CoverEffect[]} Array of cover effects on the actor.
   */
  static allLocalEffectsOnActor(actor) {
    if ( actor instanceof Token ) actor = actor.actor;
    return this._allLocalEffectsOnActor(actor);
  }

  /**
   * Retrieve all Cover Effects on the actor.
   * @param {Actor} actor
   * @returns {CoverEffect[]} Array of cover effects on the actor.
   */
  static _allLocalEffectsOnActor(actor) {
    return this.coverObjectsMap.values()
      .filter(ce => ce._localEffectOnActor(actor))
  }

  /**
   * Replace local cover effects on token with these.
   * @param {Token|Actor} actor
   * @param {CoverEffect[]|Set<CoverEffect>} coverEffects
   */
  static replaceLocalEffectsOnActor(actor, coverEffects = new Set()) {
    log(`CoverEffect#replaceLocalEffectsOnActor|${actor.name}`);

    if ( actor instanceof Token ) actor = actor.actor;
    if ( !(coverEffects instanceof Set) ) coverEffects = new Set(coverEffects);
    const previousEffects = new Set(this.allLocalEffectsOnActor(actor));
    if ( coverEffects.equals(previousEffects) ) return;

    // Filter to only effects that must change.
    const toRemove = previousEffects.difference(coverEffects);
    const toAdd = coverEffects.difference(previousEffects);
    if ( !(toRemove.size || toAdd.size) ) return;

    // Remove unwanted effects then add new effects.
    previousEffects.forEach(ce => ce.removeFromActorLocally(actor, false))
    coverEffects.forEach(ce => ce.addToActorLocally(actor, false));

    // At least on effect should have been changed, so refresh actor.
    refreshActorCoverEffect(actor);
  }

  /**
   * Update the cover effects from settings.
   */
  static _updateFromSettings() {
    console.warn("CoverEffect does not use _updateFromSettings");
  };


  /**
   * Initialize the cover effects for this game.
   */
  static async initialize() {
    await this._constructDefaultCoverObjects();
  }

  /**
   * Create default effect objects and ensure their storage is created.
   * Typically used on game load.
   * @param {boolean} [override=false]    Use existing cover effects unless enabled
   */
  static async _constructDefaultCoverObjects(override = false) {
    const data = this._defaultCoverTypeData();
    this.coverObjectsMap.clear();
    const promises = [];
    for ( const d of Object.values(data) ) {
      const ce = this.create(d);
      promises.push(ce.initialize(d, override));
    }
    return Promise.allSettled(promises);
  }
}

// ----- NOTE: Helper functions ----- //

/**
 * Refresh the actor so that the local cover effect is used and visible.
 */
function refreshActorCoverEffect(actor) {
  log(`CoverEffect#refreshActorCoverEffect|${actor.name}`);
  actor.prepareData(); // Trigger active effect update on the actor data.
  queueSheetRefresh(actor);
}

/**
 * Handle multiple sheet refreshes by using an async queue.
 * If the actor sheet is rendering, wait for it to finish.
 */
const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay))

const renderQueue = new AsyncQueue();

const queueObjectFn = function(ms, actor) {
  return async function rerenderActorSheet() {
    log(`CoverEffect#refreshActorCoverEffect|Testing sheet for ${actor.name}`);

    // Give up after too many iterations.
    const MAX_ITER = 10;
    let iter = 0;
    while ( iter < MAX_ITER && actor.sheet?._state === Application.RENDER_STATES.RENDERING ) {
      iter += 1;
      await sleep(ms);
    }
    if ( actor.sheet?.rendered ) {
      log(`CoverEffect#refreshActorCoverEffect|Refreshing sheet for ${actor.name}`);
      await actor.sheet.render(true);
    }
  }
}

function queueSheetRefresh(actor) {
  log(`CoverEffect#refreshActorCoverEffect|Queuing sheet refresh for ${actor.name}`);
  const queueObject = queueObjectFn(100, actor);
  renderQueue.enqueue(queueObject); // Could break up the queue per actor but probably unnecessary?
}
