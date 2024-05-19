/* globals
canvas,
CONFIG,
foundry,
fromUuid,
game,
Hooks,
isNewerVersion,
ItemDirectory,
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
   * Get data used to construct a local cover effect document.
   * Local cover effects have the local flag.
   * @type {object}
   */
  get localDocumentData() {
    const data = super.localDocumentData;

    // Use the icon as a status effect.
    data.statuses = [data.icon];
    return data;
  }

  /**
   * Data used when dragging a cover effect to an actor sheet.
   */
  get dragData() {
    const data = super.dragData;
    data.type = "ActiveEffect";
    return data;
  }


  // ----- NOTE: Token/Actor methods ----- //

  /**
   * Internal method to add this cover effect to the token locally.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _addToToken(token) {
    const actor = token.actor;
    if ( !actor ) return false;
    const ae = actor.effects.createDocument(this.localDocumentData);
    log(`CoverActiveEffect#_addToToken|${actor.name} adding ${ae.id} ${this.name}`);
    actor.effects.set(ae.id, ae);
    return true;
  }

  /**
   * Internal method to remove this cover effect from the token.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _removeFromToken(token) {
    const actor = token.actor;
    if ( !actor ) return false;

    // Remove the first instance found. (Should only be one present.)
    for ( const [key, effect] of actor.effects.entries() ) {
      if ( effect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID) === this.id ) {
        log(`CoverActiveEffect#_removeFromToken|${actor.name} removing ${key} ${this.name}`);
        actor.effects.delete(key);
        return true;
      }
    }
    return false;
  }

  // ----- NOTE: Document Methods ----- //

  /**
   * Find the storage document for given cover effect id.
   * @returns {Document|undefined} Undefined if no document found.
   */
  _findStorageDocument() {
    const coverEffectItem = this.constructor.coverEffectItem;
    if ( !coverEffectItem ) return;
    const id = this.id;
    return coverEffectItem.effects.find(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID) === id);
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
    if ( !this.constructor.coverEffectItem ) {
      console.error("CoverActiveEffect#_createStorageDocument|Cover effects item not found.");
      return;
    }

    // Create default effects on-the-fly if not present.
    // Otherwise, create a new cover effect.
    const data = this.defaultDocumentData ?? this.constructor.newCoverObjectData;
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


  // ----- NOTE: Static getters, setters, and related properties ----- //

  /** @type {Item} */
  static coverEffectItem; // Added by _initializeCoverEffectsItem.

  /**
   * Data used to construct a new blank cover effect.
   * @type {object}
   */
  static get newCoverObjectData() {
    const data = CoverEffect.newCoverObjectData;
    data.origin = this.coverEffectItem.id;
    data.transfer = false;
    return data;
  }

  // ----- NOTE: Static token/actor methods ----- //

  /**
   * Get all documents for a give token/actor that could contain a cover effect.
   * Each document should be an object that has a "flags" property.
   * @param {Token} token
   * @returns {EmbeddedCollection|DocumentCollection|Map}
   */
  static _effectDocumentsOnToken(token) {
   const actor = token.actor;
    if ( !actor ) return new Map();
    return actor.effects;
  }

  /**
   * Create an item used to store cover effects.
   * Once created, it will be stored in the world and becomes the method by which cover effects
   * are saved.
   */
  static async _initializeCoverEffectsItem() {
    this.coverEffectItem = game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ITEM));
    if ( this.coverEffectItem ) return;
    const data = {
      name: "Cover Effects",
      img: "icons/svg/ruins.svg",
      type: "base",
      flags: { [MODULE_ID]: { [FLAGS.COVER_EFFECT.ITEM]: true} }
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

  /**
   * Transition all cover documents in a scene, when updating versions.
   */
  static async transitionDocuments() {
    if ( !this.coverEffectItem ) await this._initializeCoverEffectsItem();

    // Transition each of the cover effects on the item.
    const promises = [];
    for ( const ae of this.coverEffectItem.effects.values() ) this._transitionDocument(ae, promises);

    // Same for all tokens with cover effects.
    for ( const token of canvas.tokens.placeables ) {
      if ( !token.actor?.effects ) continue;
      for ( const ae of token.actor.effects.values() ) this._transitionDocument(ae, promises);
    }
    return Promise.allSettled(promises);

  }

  /**
   * Transition a single cover document.
   * @param {ActiveEffect} ae         The active effect document to update
   * @param {Promise<>[]} promises    Array to store promises to update the document
   */
  static _transitionDocument(ae, promises = []) {
    const moduleVersion = game.modules.get(MODULE_ID).version;
    const id = ae.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID);
    if ( !id ) return;
    const coverEffect = this.coverObjectsMap.get(id);
    if ( !coverEffect ) return;

    // Only update if the saved version is older than current module version.
    const savedVersion = ae.getFlag(MODULE_ID, FLAGS.VERSION);
    if ( savedVersion && !isNewerVersion(moduleVersion, savedVersion) ) return;

    // Update the default document data fields.
    const updateData = foundry.utils.mergeObject(
      coverEffect.defaultDocumentData,
      coverEffect.documentData,
      { insertKeys: false, insertValues: false, inplace: false });
    promises.push(ae.update(updateData));
  }

  /**
   * Refresh the display of the cover effect on the token.
   * Add refresh of the token icons.
   * @param {Token} token
   */
  static refreshCoverDisplay(token) {
    CoverEffect.refreshCoverDisplay(token);
    token.renderFlags.set({ redrawEffects: true });
  }
}

/**
 * Specialized handling of cover effect rules in dnd5e.
 */
export class CoverEffectDND5E extends CoverActiveEffect {
  /**
   * Test if this cover effect could apply to a target token given an attacking token.
   * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
   * @param {Token} attackingToken        Token from which cover is sought
   * @param {Token} targetToken           Token to which cover would apply
   * @param {object} [opts]               Options used to determine whether to ignore cover
   * @param {CONFIG.DND5E.itemActionTypes} [actionType="all"]   Attack action type
   * @returns {boolean}
   */
  _couldApply(attackingToken, targetToken,  opts = {}) {
    const actionType = opts.actionType ?? "all";
    const ignoresCover = attackingToken.tokencover.ignoresCover?.[actionType];
    if ( ignoresCover && ignoresCover >= this.document.percentThreshold ) return false;
    return super._couldApply(attackingToken, targetToken);
  }
}


/**
 * Uses DFred's CE exclusively instead of AE stored on the token cover item.
 */
export class CoverActiveEffectDFreds extends CoverEffectDND5E {

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
    if ( dFredsEffect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID) ) return dFredsEffect;
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
    // TODO: Need to add all cover type flags
    await dFredsEffect.setFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID, this.id);
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
  const id = activeEffect.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID);
  if ( !id || activeEffect.parent?.name !== "Custom Convenient Effects") return;
  const ce =  CONFIG.tokencover.CoverEffect.coverObjectsMap.get(id);
  if ( !ce ) return;
  ce.delete();
}

PATCHES.DFREDS.HOOKS = { deleteActiveEffect: deleteActiveEffectHook };

