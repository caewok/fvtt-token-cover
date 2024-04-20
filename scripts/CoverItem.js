/* globals

*/
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";
import { coverEffects as sfrpgCoverEffects } from "./coverDefaults/sfrpg.js";
/**
 * Cover Effect for systems like sfrpg that use items to signify effects.
 */
export class CoverItem extends CoverEffect {

  // ----- NOTE: Getters, setters, and related properties ----- //

  // Alias
  get effectItem() { return this.document; }

  /**
   * Retrieve the cover effect icon for use in the list of cover effects.
   * @return {string}
   */
  get icon() { return this.config.img; }

  /**
   * Data used when dragging a cover effect to an actor sheet.
   */
  get dragData() {
    const out = {
      name: this.name,
      type: "Item",
      data: this.documentData
    };
    out.uuid = this.document.uuid;
    return out;
  }

  // ----- NOTE: Methods ----- //

  /**
   * Locate this cover effect item
   * @return {CoverEffect}
   */
  _findCoverEffect() {
    return game.items.find(i => i.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) === this.id);
  }

  /**
   * Create the actual Item storage document.
   * @param {object} coverEffectData     Data to store
   * @returns {Item}
   */
  async _createStorage(coverEffectData) {
    return (await CONFIG.Item.documentClass.create([coverEffectData]))[0];
  }

  /**
   * Delete the stored item associated with this cover effect.
   * @return {boolean} Must return true if document is deleted.
   */
  async _deleteStorageDocument() { return this.document.delete(); }

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
    log(`CoverItem#_addToActorLocally|${actor.name} adding ${item.id} ${this.config.name}`);
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
      log(`CoverItem#removeFromActorLocally|${actor.name} removing ${key} ${this.config.name}`);
      actor.items.delete(key);
      removedIds.push(key);
    }
    return removedIds;
  }

  // ----- NOTE: Static methods ----- //

  /**
   * Find the storage document for given coverEffectData or id.
   * Must be handled by child class.
   * @param {object} coverEffectData
   * @returns {Document|undefined} Undefined if no document found.
   */
  static findStorageDocument(coverEffectData) {
    const id = this.idFromData(coverEffectData);
    return game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) === id);
  }

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

  /**
   * Retrieve default cover effects data for different systems.
   * @returns {object}
   */
  static _defaultCoverTypeData() {
    switch ( this.systemId ) {
      case "sfrpg": return sfrpgCoverEffects; break;
      default: console.error("No default cover effects for generic systems have been implemented.");
    }
  }

  /**
   * Create default effect objects and ensure their storage is created.
   * Typically used on game load.
   * If a compendium id is provided, items will be loaded from the compendium if not present.
   * @param {boolean} [override=false]    Use existing cover effects unless enabled
   */
  static async _constructDefaultCoverObjects(override = false) {
    const data = this._defaultCoverTypeData();
    this.coverObjectsMap.clear();
    const promises = [];
    const pack = game.packs.get(`${MODULE_ID}.${MODULE_ID}_items_${game.system.id}`);
    for ( const d of Object.values(data) ) {
      // See if we need to pull the default item from the compendium.
      if ( pack && d.compendiumId && !game.items.has(d.compendiumId) && !this.findStorageDocument(d) ) {
        const doc = await pack.getDocument(d.compendiumId);
        if ( doc ) game.items.set(d.compendiumId, doc);
      }
      const ce = this.create(d);
      promises.push(ce.initialize(d, override));
    }
    return Promise.allSettled(promises);
  }

}

export class CoverItemSFRPG extends CoverItem {
  /**
   * Localize document data. Meant for subclasses that are aware of the document structure.
   * @param {object} coverEffectData
   * @returns {object} coverEffectData
   */
  static _localizeDocumentData(coverEffectData) {
    coverEffectData.system.modifiers.forEach(mod => {
      mod.name = game.i18n.localize(mod.name);
    });
    return coverEffectData;
  }
}
