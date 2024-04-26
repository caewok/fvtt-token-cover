/* globals

*/
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";

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
   * @param {}
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
    const out = await this.constructor.coverEffectItem.deleteEmbeddedDocuments("ActiveEffect", [this.document.id]);
    super._deleteStorageDocument(); // Must come after so document id is present.
    return out;
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
