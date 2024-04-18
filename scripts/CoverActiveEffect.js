/* globals

*/
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";
import { coverEffects as dnd5eCoverEffects, coverEffects_midiqol } from "./coverDefaults/dnd5e.js";
import { coverEffects as genericCoverEffects } from "./coverDefaults/generic.js";


/**
 * Cover Effect for systems like dnd5e that use Active Effect to signify effects.
 */
export class CoverActiveEffect extends CoverEffect {

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

  // ----- NOTE: Methods ----- //

  /**
   * Create the actual ActiveEffect storage document.
   * @param {object} coverEffectData     Data to store
   * @returns {ActiveEffect}
   */
  async _createStorageDocument(coverEffectData) {
    // Add necessary settings for the active effect.
    coverEffectData.origin ??= this.constructor.coverEffectItem.id;
    coverEffectData.name ??= "New Cover Effect";
    coverEffectData.transfer = false;
    return (await this.constructor.coverEffectItem.createEmbeddedDocuments("ActiveEffect", [coverEffectData]))[0];
  }

  /**
   * Delete the stored document associated with this active effect from the effect item.
   * @return {boolean} Must return true if document is deleted.
   */
  async _deleteStorageDocument() {
    return this.constructor.coverEffectItem.deleteEmbeddedDocuments("ActiveEffect", [this.document.id]);
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
    log(`CoverActiveEffect#_addToActorLocally|${actor.name} adding ${ae.id} ${this.config.name}`);
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
      log(`CoverActiveEffect#removeFromActorLocally|${actor.name} removing ${key} ${this.config.name}`);
      actor.effects.delete(key);
      removedIds.push(key);
    }
    return removedIds;
  }

  // ----- NOTE: Static getters, setters, and related properties ----- //

  /** @type {Item} */
  static coverEffectItem; // Added by _initializeCoverEffectsItem.

  /** @type {string} */
  static get systemId() {
    const id = game.system.id;
    if ( (id === "dnd5e" || id === "sw5e")
      && game.modules.get("midi-qol")?.active ) id += "_midiqol";
    return id;
  }


  // ----- NOTE: Static methods ----- //

  /**
   * Retrieve all Cover Effects on the actor.
   * @param {Actor} actor
   * @returns {CoverEffect[]} Array of cover effects on the actor.
   */
  static _allLocalEffectsOnActor(actor, self = this) {
    // Faster than calling _localEffectOnActor repeatedly.
    return actor.effects
      .filter(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID))
      .map(e => self._documentIds.get(e.id))
      .filter(e => Boolean(e))
  }

  /**
   * Retrieve default cover effects data for different systems.
   * @returns {object}
   */
  static _defaultCoverTypeData(self = this) {
    switch ( self.systemId ) {
      case "dnd5e": return dnd5eCoverEffects; break;
      case "dnd5e_midiqol": return coverEffects_midiqol; break;
      default: return genericCoverTypes;
    }
  }


  /**
   * Create an item used to store cover effects.
   * Once created, it will be stored in the world and becomes the method by which cover effects
   * are saved.
   */
  static async _initializeCoverEffectsItem(self = this) {
    self.coverEffectItem = game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECTS_ITEM));
    if ( !this.coverEffectItem  ) {
      self.coverEffectItem = await CONFIG.Item.documentClass.create({
        name: "Cover Effects",
        img: "icons/svg/ruins.svg",
        type: "base",
        flags: { [MODULE_ID]: { [FLAGS.COVER_EFFECTS_ITEM]: true} }
      });
    }
  }

  /**
   * Initialize the cover effects for this game.
   */
  static async initialize(self = this) {
    await self._initializeCoverEffectsItem();
    return super.initialize.call(self);
  }

  // ----- NOTE: Bound static methods ----- //

  /**
   * Create a new cover object.
   * To be used instead of the constructor in most situations.
   * Creates object. Configures if no matching object already exists.
   */
  static create(self = this) { return CoverEffect.create(self); }

  /**
   * Save cover effects to settings.
   */
  static save(self = this) { return CoverEffect.save(self); }

  /**
   * Save all cover effects to a json file.
   */
  static saveToJSON(self = this) { return CoverEffect.saveToJSON(self); }

  /**
   * Import all cover types from a json file.
   * @param {JSON} json   Data to import
   */
  static importFromJSON(self = this) { return CoverEffect.importFromJSON(self); }

  /**
   * Create default effects and store in the map. Resets anything already in the map.
   * Typically used on game load.
   */
  static _constructDefaultCoverObjects(self = this) { return CoverEffect._constructDefaultCoverObjects(self); }

}
