/* globals
Application,
CONFIG,
foundry,
fromUuid,
game,
Hooks,
socketlib,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS, SOCKETS } from "./const.js";
import { Settings } from "./settings.js";
import { AbstractCoverObject } from "./AbstractCoverObject.js";
import { AsyncQueue } from "./AsyncQueue.js";
import { log } from "./util.js";
import { defaultCoverEffects as dnd5eCoverEffects } from "./coverDefaults/dnd5e.js";
import { defaultCoverEffects as pf2eCoverEffects } from "./coverDefaults/pf2e.js";
import { defaultCoverEffects as sfrpgCoverEffects } from "./coverDefaults/sfrpg.js";
import { defaultCoverEffects as genericCoverEffects } from "./coverDefaults/generic.js";

const NULL_SET = new Set(); // Set intended to signify no items, as a placeholder.

// ----- NOTE: Set up sockets so GM can create or modify items ----- //
Hooks.once("socketlib.ready", () => {
  SOCKETS.socket ??= socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("createCoverEffectItem", createCoverEffectItem);
  SOCKETS.socket.register("deleteDocument", deleteDocument);
});

/**
 * Socket function: createCoverEffectItem
 * GM creates the item that stores/represents the effect.
 * @param {object} data   Data used to create the item
 * @returns {string} UUID of the item
 */
async function createCoverEffectItem(data) {
  const item = await CONFIG.Item.documentClass.create(data);
  return item.uuid;
}

/**
 * Socket function: deleteDocument
 * GM deletes the item that stores/represents the effect.
 * @param {string} uuid   UUID of the item to delete
 */
async function deleteDocument(uuid) {
  const doc = await fromUuid(uuid);
  doc.delete();
}


/**
 * Handles applying effects to tokens that should be treated as cover.
 * Generic as to how exactly the effect is stored and applied, but presumes it is stored in a document.
 * Applies the cover effect to tokens.
 * Imports/exports effect data.
 * Stores/retrieves effect data.
 * Sets up default effects.
 */
export class CoverEffect extends AbstractCoverObject {


  // ----- NOTE: Getters, setters, and related properties ----- //

  /** @type {Set<CoverType>} */
  get coverTypes() {
    const ids = this.document.flags[MODULE_ID][FLAGS.COVER_TYPES] ?? [];
    const cts = ids
      .map(id => CONFIG[MODULE_ID].CoverType.coverObjectsMap.get(id))
      .filter(ct => Boolean(ct));
    return new Set(cts);
  }

  /**
   * Get data used to construct a Cover Effect document.
   */
  get documentData() {
    const data = this.toJSON();
    data._id = foundry.utils.randomID();
    data.name ??= game.i18n.format("tokencover.phrases.xCoverEffect", { cover: game.i18n.localize(data.name) });
    return this.constructor._localizeDocumentData(data);
  }

  /**
   * Data used when dragging a cover effect to an actor sheet.
   */
  get dragData() {
    return {
      name: this.name,
      type: "Item",
      data: this.documentData
    };
  }

  /** @type {object|undefined} */
  get defaultCoverObjectData() {
    const data = super.defaultCoverObjectData?.documentData;
    if ( !data ) return undefined;

    // Confirm that necessary flags are present.
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    data.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] ??= this.id;
    data.flags[MODULE_ID][FLAGS.COVER_TYPES] ??= [];

    // Confirm there is no id property, which can conflict with active effect id getter.
    delete data.id;

    return data;
  }

  // ----- NOTE: Methods ----- //

  /**
   * Update this object with the given data.
   * @param {object} [config={}]
   */
  async update(config = {}) { return this.document.update(config); }

  /**
   * Export this cover type data to JSON.
   * @returns {object}
   */
  toJSON() { return this.document.toJSON(); }

  /**
   * Save a json file for this cover type.
   */
  exportToJSON() { this.document.exportToJSON(); }

  /**
   * Render the cover effect configuration window.
   */
  async renderConfig() { return this.document.sheet.render(true); }

  // ----- NOTE: Methods specific to cover effects ----- //

  /**
   * Test if the local effect is already on the actor.
   * Must be handled by child class.
   * @param {Actor} actor
   * @returns {boolean} True if local effect is on the actor.
   */
  _localEffectOnActor(_actor) {
    console.error("CoverEffect#_localEffectOnActor must be handled by child class.");
  }

  /**
   * Add the effect locally to an actor.
   * @param {Token|Actor} actor
   * @param {boolean} Returns true if added.
   */
  addToActorLocally(actor, update = true) {
    if ( actor instanceof Token ) actor = actor.actor;
    log(`CoverEffect#addToActorLocally|${actor.name} ${this.name}`);

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
  _addToActorLocally(_actor) {
    console.error("CoverEffect#_addToActorLocally must be handled by child class.");
  }

  /**
   * Remove the effect locally from an actor.
   * @param {Actor} actor
   * @param {boolean} Returns true if change was required.
   */
  removeFromActorLocally(actor, update = true) {
    log(`CoverEffect#removeFromActorLocally|${actor.name} ${this.name}`);
    if ( actor instanceof Token ) actor = actor.actor;
    if ( !this._localEffectOnActor(actor) ) return false;

    // Remove documents associated with this cover effect from the actor.
    const removedIds = this._removeFromActorLocally(actor);
    if ( !removedIds.length ) return false;
    removedIds.forEach(id => this.constructor._documentIds.delete(id));
    if ( update ) refreshActorCoverEffect(actor);
    return true;
  }

  /**
   * Remove the effect locally from an actor.
   * Presumes the effect is on the actor.
   * @param {Actor} actor
   * @returns {boolean} Returns true if removed.
   */
  _removeFromActorLocally(_actor) {
    console.error("CoverEffect#_addToActorLocally must be handled by child class.");
  }

  // ----- NOTE: Static: Track Cover effects ----- //
  /** @type {Map<string,CoverType>} */
  static coverObjectsMap = new Map();

  // ----- NOTE: Other static getters, setters, related properties ----- //

  /** @type {string} */
  static get settingsKey() { return Settings.KEYS.COVER_EFFECTS.DATA; }

  /**
   * Link document ids (for effects on actors) to this effect.
   * Makes it easier to determine if this cover effect has been applied to an actor.
   * @type {Map<string, CoverEffect>}
   */
  static _documentIds = new Map();

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

  // ----- NOTE: Static methods ----- //

  // ----- NOTE: Static methods specific to cover effects ----- //

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
    if ( !actor ) return;
    return [...this.coverObjectsMap.values()
      .filter(ce => ce._localEffectOnActor(actor))];
  }

  /**
   * Replace local cover effects on token with these.
   * @param {Token|Actor} actor
   * @param {Set<CoverEffect>} coverEffects
   * @param {boolean} True if a change was made
   */
  static replaceLocalEffectsOnActor(actor, coverEffects = NULL_SET) {
    if ( actor instanceof Token ) actor = actor.actor;
    if ( !actor ) return false;

    const previousEffects = new Set(this.allLocalEffectsOnActor(actor));
    if ( coverEffects.equals(previousEffects) ) return false;

    // Filter to only effects that must change.
    const toRemove = previousEffects.difference(coverEffects);
    const toAdd = coverEffects.difference(previousEffects);
    if ( !(toRemove.size || toAdd.size) ) return false;

    // Remove unwanted effects then add new effects.
    log(`CoverEffect#replaceLocalEffectsOnActor|${this.name}|${actor.name}`);
    toRemove.forEach(ce => ce.removeFromActorLocally(actor, false))
    toAdd.forEach(ce => ce.addToActorLocally(actor, false));

    // At least one effect should have been changed, so refresh actor.
    refreshActorCoverEffect(actor);
    return true;
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


