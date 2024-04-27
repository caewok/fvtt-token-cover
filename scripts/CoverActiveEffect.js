/* globals
CONFIG,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";
import { log } from "./util.js";

export const PATCHES = {};
PATCHES.DFREDS = {};

/**
 * Cover Effect for systems like dnd5e that use Active Effect to signify effects.
 */
export class CoverActiveEffect extends CoverEffect {

  /**
   * Check for a storage document in compendium or create a new one.
   * Asynchronous unless document already exists.
   */
  async initialize() {
    if ( !this.constructor.coverEffectsItem ) await this.constructor._initializeCoverEffectsItem();
    return super.initialize();
  }


  // ----- NOTE: Getters, setters, and related properties ----- //

  // Alias
  /** @type {ActiveEffect} */
  get activeEffect() { return this.document; }

  /**
   * Get data for an active effect.
   */
  get documentData() {
    const data = super.documentData;
    data.origin ??= this.constructor.coverEffectItem.id;
    data.transfer = false;
    return data;
  }

  /**
   * Data used when dragging a cover effect to an actor sheet.
   */
  get dragData() {
    return {
      name: this.name,
      type: "ActiveEffect",
      data: this.documentData
    };
  }

  /** @type {object} */
  get newCoverObjectData () {
    return {
      origin: this.constructor.coverEffectItem.id,
      transfer: false,
      name: "New Cover Effect",
      flags: { [MODULE_ID]: { [FLAGS.COVER_EFFECT_ID]: this.id, [FLAGS.COVER_TYPES]: [] } }
    };
  }

  // ----- NOTE: Methods ----- //

  /**
   * Find the storage document for given cover effect id.
   * @returns {Document|undefined} Undefined if no document found.
   */
  _findStorageDocument() {
    const coverEffectItem = this.constructor.coverEffectItem;
    if ( !coverEffectItem ) return;
    const id = this.id;
    return coverEffectItem.effects.find(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) === id);
  }

  /**
   * Find the storage document for the given cover effect id, asynchronously.
   * Async allows us to pull from compendiums or otherwise construct a default.
   * @returns {Promise<Document>|undefined} Undefined if no document found.
   */
  async _loadStorageDocument() {
    if ( !this.constructor.coverEffectItem ) await this.constructor._initializeCoverEffectsItem();

    // It is possible that _findStorageDocument failed b/c of not initializing the cover item. Retry.
    return this._findStorageDocument();
  }

  /**
   * Create the actual ActiveEffect storage document.
   * @param {object} coverEffectData     Data to store
   * @returns {ActiveEffect}
   */
  async _createStorageDocument() {
    if ( !this.constructor.coverEffectItem ) await this.constructor._initializeCoverEffectsItem();

    // Create default effects on-the-fly if not present.
    // Otherwise, create a new cover effect.
    const data = this.defaultCoverObjectData ?? this.newCoverObjectData;
    return (await this.constructor.coverEffectItem.createEmbeddedDocuments("ActiveEffect", [data]))[0];
  }

  /**
   * Delete the stored document associated with this active effect from the effect item.
   * @return {boolean} Must return true if document is deleted.
   */
  async _deleteStorageDocument() {
    return await this.constructor.coverEffectItem.deleteEmbeddedDocuments("ActiveEffect", [this.document.id]);
  }

  /**
   * Test if the local effect is already on the actor.
   * @param {Actor} actor
   * @returns {boolean} True if local effect is on the actor.
   */
  _localEffectOnActor(actor) {
    const activeEffectIds = this.constructor._documentIds;
    for ( const key of actor.effects.keys() ) {
      if ( !activeEffectIds.has(key) ) continue;
      if ( activeEffectIds.get(key) === this ) return true;
    }
    return false;
  }

  /**
   * Add the effect locally to an actor.
   * @param {Actor} actor
   * @returns {string} Returns the id of the document added
   */
  _addToActorLocally(actor) {
    const ae = actor.effects.createDocument(this.documentData);
    log(`CoverActiveEffect#_addToActorLocally|${actor.name} adding ${ae.id} ${this.name}`);
    actor.effects.set(ae.id, ae);
    return ae.id;
  }

  /**
   * Remove the effect locally from an actor.
   * Presumes the effect is on the actor.
   * @param {Actor} actor
   * @returns {string[]} Returns array of document ids removed from the actor.
   */
  _removeFromActorLocally(actor) {
    const activeEffectIds = this.constructor._documentIds;

    // For safety, run through all effects and remove all instances of this cover effect.
    let removedIds = [];
    for ( const key of actor.effects.keys() ) {
      if ( !activeEffectIds.has(key) ) continue;
      if ( activeEffectIds.get(key) !== this ) continue;
      log(`CoverActiveEffect#removeFromActorLocally|${actor.name} removing ${key} ${this.name}`);
      actor.effects.delete(key);
      removedIds.push(key);
    }
    return removedIds;
  }

  // ----- NOTE: Static getters, setters, and related properties ----- //

  /** @type {Item} */
  static coverEffectItem; // Added by _initializeCoverEffectsItem.

  // ----- NOTE: Static methods ----- //

  /**
   * Retrieve all Cover Effects on the actor.
   * @param {Actor} actor
   * @returns {CoverEffect[]} Array of cover effects on the actor.
   */
  static _allLocalEffectsOnActor(actor) {
    // Faster than calling _localEffectOnActor repeatedly.
    return actor.effects
      .filter(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID))
      .map(e => this._documentIds.get(e.id))
      .filter(e => Boolean(e))
  }

  /**
   * Create an item used to store cover effects.
   * Once created, it will be stored in the world and becomes the method by which cover effects
   * are saved.
   */
  static async _initializeCoverEffectsItem() {
    this.coverEffectItem = game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECTS_ITEM));
    if ( !this.coverEffectItem  ) {
      this.coverEffectItem = await CONFIG.Item.documentClass.create({
        name: "Cover Effects",
        img: "icons/svg/ruins.svg",
        type: "base",
        flags: { [MODULE_ID]: { [FLAGS.COVER_EFFECTS_ITEM]: true} }
      });
    }
  }
}

/**
 * Uses DFred's CE exclusively instead of AE stored on the token cover item.
 */
export class CoverActiveEffectDFreds extends CoverActiveEffect {

  /**
   * Find the storage document for given cover effect id.
   * If id corresponds to DFred's effect, use that.
   * @returns {ActiveEffect|undefined} Undefined if no document found.
   */
  _findStorageDocument() {
    const defaultData = CONFIG[MODULE_ID].CoverEffect.defaultCoverObjectData.get(this.id);
    if ( !defaultData ) return super._findStorageDocument();

    const dFredsEffect = game.dfreds.effectInterface.findCustomEffectByName(defaultData.dFredsName);
    if ( !dFredsEffect ) return undefined;

    // Don't use unless it has the correct flags.
    if ( dFredsEffect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) ) return dFredsEffect;
    return undefined;
  }

  /**
   * Find the storage document for given cover effect id.
   * If id corresponds to DFred's effect, use that after adding the necessary flags.
   * @returns {ActiveEffect|undefined} Undefined if no document found
   */
  async _loadStorageDocument() {
    const defaultData = CONFIG[MODULE_ID].CoverEffect.defaultCoverObjectData.get(this.id);
    if ( !defaultData ) return super._loadStorageDocument();

    let dFredsEffect = game.dfreds.effectInterface.findCustomEffectByName(defaultData.dFredsName);
    if ( !dFredsEffect ) {
      const ae = game.dfreds.effectInterface.findEffectByName(defaultData.dFredsName);
      if ( !ae ) return super._loadStorageDocument();
      dFredsEffect = await game.dfreds.effectInterface.createNewCustomEffectsWith({ activeEffects: [ae] })
      dFredsEffect = dFredsEffect[0];
    }
    if ( !dFredsEffect ) return super._loadStorageDocument();

    // Don't use unless it has the correct flags.
    await dFredsEffect.setFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID, this.id);
    await dFredsEffect.setFlag(MODULE_ID, FLAGS.COVER_TYPES, defaultData.documentData.flags[MODULE_ID][FLAGS.COVER_TYPES]);
    return dFredsEffect;
  }

  /**
   * Delete the sotrage document for given cover effect id.
   * If id corresponds to DFred's effect, delete the custom effect.
   */
  async _deleteStorageDocument() {
    try { await this.document.delete() } catch {}
  }
}

// ----- NOTE: Hooks ----- //

/**
 * Hook active effect deletion so we know if a DFred's custom effect has been deleted.
 * @event deleteDocument
 * @category Document
 * @param {Document} document                       The existing Document which was deleted
 * @param {DocumentModificationContext} options     Additional options which modified the deletion request
 * @param {string} userId                           The ID of the User who triggered the deletion workflow
 */
function deleteActiveEffectHook(activeEffect, _options, _userId) {
  const id = activeEffect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID);
  if ( !id || activeEffect.parent?.name !== "Custom Convenient Effects") return;
  const ce =  CONFIG.tokencover.CoverEffect.coverObjectsMap.get(id);
  if ( !ce ) return;
  ce.delete();
}

