/* globals

*/
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";

/**
 * Cover Effect for systems like sfrpg that use items to signify effects.
 */
export class CoverItem extends CoverEffect {

  // ----- NOTE: Getters, setters, and related properties ----- //

  /**
   * Retrieve the cover effect icon for use in the list of cover effects.
   * @return {string}
   */
  get icon() { return this.document?.img; }

  /**
   * Data used when dragging a cover effect to an actor sheet.
   */
  get dragData() {
    const out = {
      name: this.name,
      type: "Item",
      data: this.documentData
    };
    out.uuid = this.document?.uuid;
    return out;
  }

  /** @type {object} */
  get newCoverObjectData() {
    return {
      name: "New Cover Effect",
      flags: { [MODULE_ID]: { [FLAGS.COVER_EFFECT_ID]: this.id } }
    }
  }

  /** @type {object|undefined} */
  get defaultCoverObjectData() {
    const data = super.defaultCoverObjectData;
    if ( !data ) return undefined;
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    data.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ??= this.id;

    if ( data.coverTypes?.length ) data.flags[MODULE_ID][FLAGS.COVER_TYPES] ??= [...data.coverTypes];
    else data.flags[MODULE_ID][FLAGS.COVER_TYPES] ??= [];

    delete data.id;
    delete data.compendiumId;
    delete data.coverTypes;

    data.type = "Item";
    data.name ??= "New Cover Effect";

    return data;
  }


  // ----- NOTE: Methods ----- //

  /**
   * Find an existing local document to use for the storage.
   * @returns {Item|undefined}
   */
  _findStorageDocument() {
    return game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) === this.id);
  }

  /**
   * Load an async document to use for storage from the compendium.
   * @returns {Document|object|undefined}
   */
  async _loadStorageDocument() {
    const pack = game.packs.get(`${MODULE_ID}.${MODULE_ID}_items_${game.system.id}`);
    if ( !pack ) return;

    const compendiumId = this.constructor.defaultCoverObjectData.get(this.id)?.compendiumId;
    if ( !compendiumId ) return;
    const doc = await pack.getDocument(compendiumId); // Async
    doc.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    data.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ??= this.id;

    return CONFIG.Item.documentClass.create(doc);
  }

  /**
   * Create a storage document from scratch.
   * @returns {Item|object}
   */
  async _createStorageDocument() {
    // Add necessary settings for the active effect.
    const data = this.defaultCoverObjectData ?? this.newCoverObjectData;
    return CONFIG.Item.documentClass.create(data); // Async
  }

  /**
   * Locate this cover effect item
   * @return {CoverEffect}
   */
  _findCoverEffect() {
    return game.items.find(i => i.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) === this.id);
  }

  /**
   * Delete the stored item associated with this cover effect.
   * @return {boolean} Must return true if document is deleted.
   */
  async _deleteStorageDocument() {
    if ( !this.document ) return;
    const out = await this.document.delete();
    super._deleteStorageDocument(); // Must come after so document is present.
    return out;
  }

  // ----- NOTE: Methods specific to cover effects ----- //

  /**
   * Test if the local effect is already on the actor.
   * @param {Actor} actor
   * @returns {boolean} True if local effect is on the actor.
   */
  _localEffectOnActor(actor) {
    const itemIds = this.constructor._documentIds;
    for ( const key of actor.items.keys() ) {
      if ( !itemIds.has(key) ) continue;
      if ( itemIds.get(key) === this ) return true;
    }
    return false;
  }

  /**
   * Add the effect locally to an actor.
   * @param {Actor} actor
   * @returns {string} Returns the id of the document added
   */
  _addToActorLocally(actor) {
    const item = actor.items.createDocument(this.documentData);
    log(`CoverItem#_addToActorLocally|${actor.name} adding ${item.id} ${this.name}`);
    actor.items.set(item.id, item);
    return item.id;
  }

  /**
   * Remove the item locally from an actor.
   * Presumes the item is on the actor.
   * @param {Actor} actor
   * @returns {string[]} Returns array of document ids removed from the actor.
   */
  _removeFromActorLocally(actor) {
    const itemIds = this.constructor._documentIds;

    // For safety, run through all items and remove all instances of this cover effect.
    let removedIds = [];
    for ( const key of actor.items.keys() ) {
      if ( !itemIds.has(key) ) continue;
      if ( itemIds.get(key) !== this ) continue;
      log(`CoverItem#removeFromActorLocally|${actor.name} removing ${key} ${this.name}`);
      actor.items.delete(key);
      removedIds.push(key);
    }
    return removedIds;
  }

  // ----- NOTE: Static methods ----- //

  // ----- NOTE: Static methods specific to cover effects ----- //

  /**
   * Retrieve all Cover Effects on the actor.
   * @param {Actor} actor
   * @returns {CoverEffect[]} Array of cover effects on the actor.
   */
  static _allLocalEffectsOnActor(actor) {
    // Faster than calling _localEffectOnActor repeatedly.
    return actor.items
      .filter(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID))
      .map(e => this._documentIds.get(e.id))
      .filter(e => Boolean(e))
  }
}


/**
 * Specialized handling for cover effects (cover items) in pf2e.
 */
export class CoverItemPF2E extends CoverItem {

  /**
   * Localize document data. Meant for subclasses that are aware of the document structure.
   * @param {object} coverEffectData
   * @returns {object} coverEffectData
   */
  static _localizeDocumentData(coverEffectData) {
    return coverEffectData;
  }
}

/**
 * Specialized handling for cover effects (cover items) in sfrpg.
 */
export class CoverItemSFRPG extends CoverItem {

   /** @type {object|undefined} */
  get defaultCoverObjectData() {
    const data = super.defaultCoverObjectData;
    data.type = "effect";
    return data;
  }

  /** @type {object} */
  get newCoverObjectData() {
    const data = super.newCoverObjectData;
    data.type = "effect";
    return data;
  }

  /**
   * Localize document data. Meant for subclasses that are aware of the document structure.
   * @param {object} coverEffectData
   * @returns {object} coverEffectData
   */
  static _localizeDocumentData(coverEffectData) {
    if ( !coverEffectData.system?.modifiers ) return coverEffectData;

    coverEffectData.system.modifiers.forEach(mod => {
      mod.name = game.i18n.localize(mod.name);
    });
    return coverEffectData;
  }
}