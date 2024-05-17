/* globals
CONFIG,
fromUuid,
game,
Hooks,
socketlib
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS, SOCKETS } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";
import { log } from "./util.js";

export const PATCHES = {};
PATCHES.DFREDS = {};

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
  const id = CONFIG[MODULE_ID].CoverEffect.coverEffectItem?.id;
  if ( !id ) return;
  const li = dir.element.find(`li[data-document-id="${id}"]`);
  li.remove();
}

PATCHES_SidebarTab.COVER_EFFECT.HOOKS = { changeSidebarTab: removeCoverEffectsItemFromSidebar };
PATCHES_ItemDirectory.COVER_EFFECT.HOOKS = { renderItemDirectory: removeCoverEffectsItemFromSidebar };

// ----- NOTE: Set up sockets so GM can create or modify items ----- //
Hooks.once("socketlib.ready", () => {
  SOCKETS.socket ??= socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("createActiveCoverEffect", createActiveCoverEffect);
  SOCKETS.socket.register("deleteActiveCoverEffects", deleteActiveCoverEffects);
});

/**
 * Socket function: createActiveCoverEffect
 * GM creates the active effect on the cover effect item that stores/represents the effect.
 * @param {object} data   Data used to create the effect
 * @returns {string} UUID of the effect
 */
async function createActiveCoverEffect(data) {
  await CONFIG[MODULE_ID].CoverEffect._initializeCoverEffectsItem();
  const item = CONFIG[MODULE_ID].CoverEffect.coverEffectItem;
  const effect = (await item.createEmbeddedDocuments("ActiveEffect", [data]))[0];
  return effect.uuid;
}

/**
 * Socket function: deleteActiveCoverEffects
 * GM deletes the active effect on the cover effect item that stores/represents the effect.
 * @param {string[]} ids   IDs of the effects to delete
 */
async function deleteActiveCoverEffects(ids) {
  const item = CONFIG[MODULE_ID].CoverEffect.coverEffectItem;
  if ( !item ) return;
  await item.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
}

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
    if ( !this.constructor.coverEffectItem ) {
      await this.constructor._initializeCoverEffectsItem();
      // It is possible that _findStorageDocument failed b/c of not initializing the cover item. Retry.
      return this._findStorageDocument();
    }
    return undefined;
  }

  /**
   * Create the actual ActiveEffect storage document.
   * @param {object} coverEffectData     Data to store
   * @returns {ActiveEffect}
   */
  async _createStorageDocument() {
    if ( !this.constructor.coverEffectItem ) await this.constructor._initializeCoverEffectsItem();
    if ( !this.constructor.coverEffectItem ) return;

    // Create default effects on-the-fly if not present.
    // Otherwise, create a new cover effect.
    const data = this.defaultCoverObjectData ?? this.newCoverObjectData;
    let doc;
    if ( !game.user.isGM ) {
      try {
        const uuid = await SOCKETS.socket.executeAsGM("createActiveCoverEffect", data);
        doc = await fromUuid(uuid);
      } catch(e) {
        console.error(`${MODULE_ID}|CoverActiveEffect#_createStorageDocument GM socket failure.`, e);
      }
    } else doc = (await this.constructor.coverEffectItem.createEmbeddedDocuments("ActiveEffect", [data]))[0];
    return doc;
  }

  /**
   * Delete the stored document associated with this active effect from the effect item.
   */
  async _deleteStorageDocument() {
    const id = this.document?.id;
    if ( !id ) return;
    if ( !game.user.isGM ) {
      try {
        await SOCKETS.socket.executeAsGM("deleteActiveCoverEffects", [id]);
      } catch(e) {
        console.error(`${MODULE_ID}|CoverActiveEffect#_deleteStorageDocument GM socket failure.`, e);
      }
    } else await this.constructor.coverEffectItem.deleteEmbeddedDocuments("ActiveEffect", [id], { render: false });
  }

  /**
   * Delete all documents associated with this cover object.
   */
  static async _deleteAllDocuments() {
    const effectItem = this.coverEffectItem;
    if ( !effectItem ) return;
    const ids = [...effectItem.effects.keys()];
    if ( !ids.length ) return;
    if ( !game.user.isGM ) {
      try {
        await SOCKETS.socket.executeAsGM("deleteActiveCoverEffects", ids);
      } catch(e) {
        console.error(`${MODULE_ID}|CoverActiveEffect#_deleteStorageDocument GM socket failure.`, e);
      }
    } else await this.coverEffectItem.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
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

    // Remove statuses so the AE does not display along with the cover icon.
    ae.updateSource({ flags: { [MODULE_ID]: { [FLAGS.LOCAL_COVER_EFFECT]: true }}, statuses: [] });
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
   * Determine if the GM has added a cover effect override to an actor.
   * Cover effect overrides have a COVER_EFFECT_ID flag but no local flag.
   * @param {Actor|Token} actor
   * @returns {boolean}
   */
  static coverOverrideApplied(actor) {
    if ( actor instanceof Token ) actor = actor?.actor;
    if ( !actor ) return;
    return Boolean(actor.effects.find(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID)
      && !e.getFlag(MODULE_ID, FLAGS.LOCAL_COVER_EFFECT)));
  }

  /**
   * Retrieve all Cover Effects on the actor.
   * @param {Actor} actor
   * @returns {CoverEffect[]} Array of cover effects on the actor.
   */
  static _allLocalEffectsOnActor(actor) {
    if ( !actor ) return;
    // Faster than calling _localEffectOnActor repeatedly.
    // Don't map from a Map or a Set to avoid throwing errors if the Set size is modified.
    const effects = [...actor.effects.filter(e => e.getFlag(MODULE_ID, FLAGS.LOCAL_COVER_EFFECT))];
    return effects
      .map(e => this._documentIds.get(e.id))
      .filter(e => Boolean(e));
  }

  /**
   * Create an item used to store cover effects.
   * Once created, it will be stored in the world and becomes the method by which cover effects
   * are saved.
   */
  static async _initializeCoverEffectsItem() {
    this.coverEffectItem = game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECTS_ITEM));
    if ( this.coverEffectItem ) return;
    const data = {
      name: "Cover Effects",
      img: "icons/svg/ruins.svg",
      type: "base",
      flags: { [MODULE_ID]: { [FLAGS.COVER_EFFECTS_ITEM]: true} }
    };
    let doc;
    if ( !game.user.isGM ) {
      try {
        const uuid = await SOCKETS.socket.executeAsGM("createCoverEffectItem", data);
        doc = await fromUuid(uuid);
      } catch(e) {
        console.error(`${MODULE_ID}|CoverActiveEffect#_initializeCoverEffectsItem GM socket failure.`, e);
      }
    } else doc = await CONFIG.Item.documentClass.create(data);
    this.coverEffectItem = doc;
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
    try { await this.document.delete() } catch { /* empty */ }
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

PATCHES.DFREDS.HOOKS = { deleteActiveEffect: deleteActiveEffectHook };

