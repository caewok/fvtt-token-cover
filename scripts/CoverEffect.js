/* globals
*/
"use strict";

import { MODULE_ID, FLAGS, COVER } from "./const.js";
import { CoverType } from "./CoverType.js";
import { Settings } from "./settings.js";
import { AbstractCoverObject } from "./AbstractCoverObject.js";
import { CoverEffectConfig } from "./CoverEffectConfig.js";
import { coverEffects as dnd5eCoverEffects, coverEffects_midiqol } from "./coverDefaults/dnd5e.js";
import { coverEffects as genericCoverEffects } from "./coverDefaults/generic.js";
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
 * Handles active effects that should be treated as cover.
 * Applies the cover effect to tokens.
 * Imports/exports effect data.
 * Stores/retrieves effect data.
 * Sets up default effects.
 * Does not extend ActiveEffect class primarily b/c adding an effect to a token creates a new effect.
 * So it would be unhelpful to also instantiate the active effect here.
 */
export class CoverEffect extends AbstractCoverObject {
  /**
   * Construct a new active effect if none present.
   * @param {ActiveEffectData} [coverEffectData={}]     Data to use when constructing new effect
   * @param {boolean} [overwrite=false]                 If true, update the active effect with this data
   */
  async initialize(coverEffectData = {}, overwrite = false) {
    // Use existing data stored in the cover effects item.
    if ( !overwrite && this.activeEffect ) return;

    // Create new effect on the cover effects item
    coverEffectData.delete(id);

    // Ensure the necessary flags are present.
    coverEffectData.flags ??= {};
    coverEffectData.flags[MODULE_ID] ??= {};
    coverEffectData.flags[MODULE_ID][FLAGS.COVER_EFFECT_ID] = this.id;
    const coverTypes = coverEffectData.flags[MODULE_ID][FLAGS.COVER_TYPES] ??= [];

    // Move cover types to flags.
    if ( coverEffectData.coverTypes ) {
      coverEffectData.coverTypes.forEach(id => coverTypes.push(id));
      delete coverEffectData.coverTypes;
    }

    // Name is required to instantiate an ActiveEffect.
    coverEffectData.name ??= "tokencover.phrases.newEffect";

    // Create the active effect.
    return this.save(coverEffectData); // Async
  }

  // ----- NOTE: Getters, setters, and related properties ----- //

  /** @type {object} */
  get config() { return this.activeEffect.toJSON(); }

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
   * Get data for an active effect.
   */
  get activeEffectData() {
    const data = { ...this.config };
    data._id = foundry.utils.randomID();
    data.name ??= game.i18n.format("tokencover.phrases.xCoverEffect", { cover: game.i18n.localize(data.name) });
    data.origin ??= this.constructor.coverEffectItem.id;
    data.transfer = false;
    return data;
  }

  /**
   * Retrieve the active effect for this cover effect from the cover effect item.
   * @returns {ActiveEffect}
   */
  #activeEffect

  get activeEffect() { return this.#activeEffect || (this.#activeEffect = this.#findOnCoverEffectItem()); }

  // ----- NOTE: Methods ----- //


  /**
   * Locate this cover effect on the item.
   * @return {CoverEffect}
   */
  #findOnCoverEffectItem() {
    const item = this.constructor.coverEffectItem;
    return item.effects.find(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID) === this.id);
  }

  /**
   * Add this effect to the effect item.
   */
  async _addToCoverEffectItem(activeEffectData) {
    const existing = this.#findOnCoverEffectItem();
    if ( existing || !activeEffectData ) return existing;

    // Add necessary settings for the active effect.
    activeEffectData.name ??= "New Cover Effect";
    activeEffectData.transfer = false;

    const ae = await this.constructor.coverEffectItem.createEmbeddedDocuments("ActiveEffect", [activeEffectData]);
    this.#activeEffect = ae[0];
    return ae[0];
  }

  /**
   * Ignores, as config pulls directly from the active effect.
   */
  update() { console.warn("CoverEffect does not use update method."); }

  /**
   * Ignored, as config pulls directly from the active effect.
   */
  load() { console.warn("CoverEffect does not use load method."); }

  /**
   * Save to the stored cover item effect, if any.
   * Requires explicit data in order to overwrite the existing effect.
   * @param {object} activeEffectData
   */
  async save(activeEffectData) {
    if ( !activeEffectData ) return;

    // Add necessary settings for the active effect.
    activeEffectData.name ??= "New Cover Effect";
    activeEffectData.transfer = false;

    const coverEffect = this.activeEffect ?? (await this._addToCoverEffectItem(activeEffectData));
    return coverEffect.update(activeEffectData);
  }

  /**
   * Delete the setting associated with this cover type.
   * Typically used if destroying the cover type or resetting to defaults.
   */
  async deleteSaveData() {
    const coverEffect = this.activeEffect;
    if ( !coverEffect ) return;
    this.#activeEffect = undefined;
    return await item.deleteEmbeddedDocuments("ActiveEffect", [coverEffect.id]);
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
   * Add the effect locally to an actor.
   * @param {Token|Actor} actor
   */
  addToActorLocally(actor, update = true) {
    if ( actor instanceof Token ) actor = actor.actor;
    log(`CoverEffect#addToActorLocally|${actor.name} ${this.config.name}`);

    // Is this effect already on the actor?
    const activeEffectIds = this.constructor._activeEffectIds;
    for ( const key of actor.effects.keys() ) {
      if ( !activeEffectIds.has(key) ) continue;
      if ( activeEffectIds.get(key) !== this ) return false;
    }

    const ae = actor.effects.createDocument(this.activeEffectData);
    log(`CoverEffect#addToActorLocally|${actor.name} adding ${ae.id} ${this.config.name}`);
    actor.effects.set(ae.id, ae);
    this.constructor._activeEffectIds.set(ae.id, this);

    if ( update ) refreshActorCoverEffect(actor);
    return true;
  }

  /**
   * Remove the effect locally from an actor.
   * @param {Token|Actor} actor
   */
  removeFromActorLocally(actor, update = true) {
    if ( actor instanceof Token ) actor = actor.actor;

    log(`CoverEffect#removeFromActorLocally|${actor.name} ${this.config.name}`);
    const activeEffectIds = this.constructor._activeEffectIds;
    let changed = false;

    // Is this effect on the actor?
    for ( const key of actor.effects.keys() ) {
      if ( !activeEffectIds.has(key) ) continue;
      if ( activeEffectIds.get(key) !== this ) continue;
      log(`CoverEffect#removeFromActorLocally|${actor.name} removing ${key} ${this.config.name}`);
      actor.effects.delete(key);
      activeEffectIds.delete(key);
      changed ||= true;
    }

    if ( update && changed ) refreshActorCoverEffect(actor);
    return changed;
  }

  /**
   * Render the AE configuration window.
   */
  async renderConfig() {
    // const app = new CoverEffectConfig(this.activeEffect)
    // app.render(true);
    this.activeEffect.sheet.render(true);
  }

  // ----- NOTE: Methods to apply this active effect to a token ----- //

  /**
   * Add this cover effect (the underlying active effect) to a token.
   * @param {Token} token
   */
  async addToToken(token) {
    return token.actor.createEmbeddedDocuments("ActiveEffect", [this.activeEffectData])
  }

  /**
   * Remove this cover effect (the underlying active effect) from a token.
   * @param {Token} token
   */
  async removeFromToken(token) {
    // Find all instances of this effect on the token (almost always singular effect).
    const ids = [];
    token.actor.effects.forEach(ae => {
      if ( this.constructor.idFromData(ae) === this.id ) ids.push(ae.id);
    });
    return token.actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  }

  // ----- NOTE: Static: Track Cover effects ----- //
  /** @type {Map<string,CoverType>} */
  static coverObjectsMap = new Map();

  // ----- NOTE: Other static getters, setters, related properties ----- //

  /**
   * Retrieve an id from cover data.
   * @param {object} coverEffectData
   */
  static idFromData(coverEffectData) { return coverEffectData?.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT_ID] ?? coverEffectData.id; }

  /** @type {string} */
  static get settingsKey() { return Settings.KEYS.COVER_EFFECTS.DATA; }


  /** @type {string} */
  static get systemId() {
    const id = game.system.id;
    if ( (id === "dnd5e" || id === "sw5e")
      && game.modules.get("midi-qol")?.active ) id += "_midiqol";
    return id;
  }

  /** @type {Map<string, CoverEffect>} */
  static _activeEffectIds = new Map(); // Track created active effect ids, to make finding them on actors easier.

  // ----- NOTE: Static methods ----- //

  /**
   * Retrieve all Cover Effects on the actor.
   * @param {Token|Actor} actor
   * @returns {CoverEffect[]} Array of cover effects on the actor.
   */
  static getAllOnActor(actor) {
    if ( actor instanceof Token ) actor = actor.actor;
    return actor.effects
      .filter(e => e.getFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID))
      .map(e => this._activeEffectIds.get(e.id))
      .filter(e => Boolean(e))
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
    const previousEffects = new Set(CoverEffect.getAllOnActor(actor));
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
   * Create a new cover object.
   * To be used instead of the constructor in most situations.
   * Creates object. Configures if no matching object already exists.
   */
  static create = AbstractCoverObject.create.bind(this);

  /**
   * Save cover effects to settings.
   */
  static save = AbstractCoverObject.save.bind(this);

  /**
   * Save all cover effects to a json file.
   */
  static saveToJSON = AbstractCoverObject.saveToJSON.bind(this);

  /**
   * Import all cover types from a json file.
   * @param {JSON} json   Data to import
   */
  static importFromJSON = AbstractCoverObject.importFromJSON.bind(this);

  /**
   * Create default effects and store in the map. Resets anything already in the map.
   * Typically used on game load.
   */
  static _constructDefaultCoverObjects = AbstractCoverObject._constructDefaultCoverObjects.bind(this);

  /**
   * Retrieve default cover effects data for different systems.
   * @returns {object}
   */
  static _defaultCoverTypeData() {
    switch ( this.systemId ) {
      case "dnd5e": return dnd5eCoverEffects; break;
      case "dnd5e_midiqol": return coverEffects_midiqol; break;
      case "pf2e": return {}; break;
      case "sfrpg": return {}; break;
      default: return genericCoverTypes;
    }
  }

  /** @type {string} */
  static COVER_EFFECTS_ITEM; // Added by initializeCoverEffectsItem.

  /** @type {Item} */
  static get coverEffectItem() {
    if ( !this.COVER_EFFECTS_ITEM ) {
      const item = game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECTS_ITEM));
      if ( !item ) console.error("Cover Effects Item not found. Must be initialized.");
      this.COVER_EFFECTS_ITEM = item.id;
    }
    return game.items.get(this.COVER_EFFECTS_ITEM);
  }

  /**
   * Create an item used to store cover effects.
   * Once created, it will be stored in the world and becomes the method by which cover effects
   * are saved.
   */
  static async _initializeCoverEffectsItem() {
    const coverEffectItem = game.items.find(item => item.getFlag(MODULE_ID, FLAGS.COVER_EFFECTS_ITEM));
    const promises = [];
    if ( coverEffectItem ) {
      this.COVER_EFFECTS_ITEM = coverEffectItem.id;

      // Make sure all items are present
      const promises = [];
      this.coverObjectsMap.forEach(ce => promises.push(ce._addToCoverEffectItem()));

      return;
    } else {
      const item = await CONFIG.Item.documentClass.create({
        name: "Cover Effects",
        img: "icons/svg/ruins.svg",
        type: "base",
        flags: { [MODULE_ID]: { [FLAGS.COVER_EFFECTS_ITEM]: true} }
      });
      this.COVER_EFFECTS_ITEM = item.id;
      this.coverObjectsMap.forEach(ce => promises.push(ce._addToCoverEffectItem()));
    }

    return Promise.allSettled(promises);
  }

  /**
   * Initialize the cover effects for this game.
   */
  static async initialize() {
    await this._initializeCoverEffectsItem();
    await this._constructDefaultCoverObjects();
  }

  /**
   * Create default effects and store in the cover effects item.
   * Typically used on game load.
   * @param {boolean} [override=false]    Use existing cover effects unless enabled
   */
  static async _constructDefaultCoverObjects(override = false) {
    const data = this._defaultCoverTypeData();
    this.coverObjectsMap.clear();
    const promises = [];
    for ( const d of data ) {
      const ce = this.constructor.create(d);
      promises.push(ce.initialize(d, override));
    }
    return Promise.allSettled(promises);
  }
}

COVER.EFFECTS = CoverEffect.coverObjectsMap;

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
