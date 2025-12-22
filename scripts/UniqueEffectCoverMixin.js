/* globals
CONFIG,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { ICONS, MODULE_ID, FLAGS } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";

/**
 * A mixin which extends the UniqueEffect with specialized terrain behaviors
 * @category - Mixins
 * @param {AbstractUniqueEffect} Base         The base class mixed with terrain features
 * @returns {Cover}                           The mixed Cover class definition
 */
export function CoverMixin(Base) {
  return class Cover extends Base {

    /**
     * Initialize an item to store flags related to terrains and the Terrain Book.
     * May be the same item used to store active effect terrains.
     */
    static async _initializeStorageMap() {
      await super._initializeStorageMap();
      await this._initializeFlagStorage();
    }

    static _flagStorageDocument;

    static async _initializeFlagStorage() {
      if ( this._storageMap.model instanceof foundry.documents.Item ) this._flagStorageDocument = this._storageMap.model;
      else {
        const data = {
          name: "Unique Active Effects",
          img: "icons/svg/ruins.svg",
          type: "base",
        };
        let item = game.items.find(item => item.name === data.name);
        if ( !item ) {
          const uuid = await createDocument("CONFIG.Item.documentClass", undefined, data);
          if ( uuid ) item = await fromUuid(uuid);
        }
        this._flagStorageDocument = item;
      }
    }

    /** @type {number} */
    get percentThreshold() {
      return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD] || 0;
    }

    /** @type {number} */
    get priority() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PRIORITY] || 0; }

    /** @type {boolean} */
    get canOverlap() { return Boolean(this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.CAN_OVERLAP]); }

    /** @type {boolean} */
    get includeWalls() {
      // Default to true if no flag.
      return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.INCLUDE_WALLS] ?? true;
    }

    /** @type {boolean} */
    get liveTokensBlock() { return Boolean(this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.LIVE_TOKENS_BLOCK]); }

    /** @type {boolean} */
    get deadTokensBlock() { return Boolean(this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.DEAD_TOKENS_BLOCK]); }

    /** @type {boolean} */
    get proneTokensBlock() { return Boolean(this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PRONE_TOKENS_BLOCK]); }

    /** @type {boolean} */
    get includeTokens() { return this.liveTokensBlock || this.deadTokensBlock; }

    /** @type {AlternativeLOSConfig} */
    get calcConfig() {
      return {
        blocking: {
          walls: this.includeWalls,
          tiles: this.includeWalls,
          regions: this.includeWalls,
          tokens: {
            dead: this.deadTokensBlock,
            live: this.liveTokensBlock,
            prone: this.proneTokensBlock,
          },
        },
        // Others:
        // tokenShapeType
        // senseType
        // largeTarget
        // radius
      };
    }

 // ----- NOTE: Folder management ----- //

    static _folders = new Map();

    static get folders() {
      const folderArray = this._flagStorageDocument.getFlag(MODULE_ID, FLAGS.COVER_BOOK.FOLDERS) || [];
      this._folders.clear();
      folderArray.forEach(folder => this._folders.set(folder.id, folder));
      return this._folders;
    }

    static async setFolders(value) {
      if ( value instanceof Map ) value = [...value.values()];
      await this._flagStorageDocument.setFlag(MODULE_ID, FLAGS.COVER_BOOK.FOLDERS, value);
    }

    static async _saveFolders() {
      return this._flagStorageDocument.setFlag(MODULE_ID, FLAGS.COVER_BOOK.FOLDERS, [...this._folders.values()]);
    }

    static getFolderById(id) { return this.folders.get(id); }

    /**
     * Add a folder if not yet present. Update otherwise.
     */
    static async addFolder(data = {}) {
      data.id ??= foundry.utils.randomID();
      const folders = this.folders;
      if ( folders.has(data.id) ) {
        const folder = folders.get(data.id);
        if ( data.effects ) folder.effects = [...(new Set(folder.effects)).union(new Set(data.effects ?? []))]; // Combine the effects set.
        delete data.effects;
        foundry.utils.mergeObject(folders.get(data.id), data);
      }
      else {
        data.name ??= game.i18n.localize("FOLDER.ExportNewFolder");
        data.color ??= "black";
        data.effects ??= [];
        folders.set(data.id, data);
      }
      return this._saveFolders();
    }

    static async deleteFolder(id) {
      const folders = this.folders;
      folders.delete(id);
      return this._saveFolders();
    }

    static async addEffectToFolder(folderId, effectId) {
      const folders = this.folders;
      if ( !folders.has(folderId) ) this.addFolder({ id: folderId });
      const folder = folders.get(folderId);
      if ( folder.effects.includes(effectId) ) return;
      folder.effects.push(effectId);
      return this._saveFolders();
    }

    static async removeEffectFromFolder(folderId, effectId) {
      const folders = this.folders;
      if ( !folders.has(folderId) ) return;
      const folder = folders.get(folderId);
      const idx = folder.effects.findIndex(effectId);
      if ( !~idx ) return;
      folder.effects.splice(idx, 1);
      return this._saveFolders;
    }

    static async removeEffectFromAllFolders(effectId) {
      const folders = this.folders;
      let needsSave = false;
      for ( const folder of folders.values() ) {
        const idx = folder.effects.findIndex(effectId);
        if ( !~idx ) continue;
        folder.effects.splice(idx, 1);
        needsSave ||= true;
      }
      if ( needsSave ) await this._saveFolders;
    }

    static findFoldersForEffect(effectId) {
      const out = new Set();
      this.folders.values().forEach(folder => {
        if ( folder.effects.includes(effectId) ) out.add(folder);
      });
      return out;
    }


    // ----- NOTE: Calculation methods ----- //

    /**
     * Percent cover given this cover effect's settings for a pair of tokens.
     * @param {Viewer} attacker
     * @param {Token} targetToken
     * @returns {number}
     */
    percentCover(attacker, targetToken) {
      const calc = attacker.tokencover?.coverCalculator ?? new CoverCalculator(attacker);
      return calc.percentCover(targetToken, this.calcConfig);
    }

    /**
     * Test if this cover effect could apply to a target token given an attacking token.
     * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
     * @param {Viewer} attacker      Token from which cover is sought
     * @param {Token} targetToken         Token to which cover would apply
     * @param {object} [_opts]            Options parameter that can be used by child classes.
     * @returns {boolean}
     */
    _couldApply(attacker, targetToken, _opts) {
      return this.percentCover(attacker, targetToken) >= this.percentThreshold;
    }

    /** @alias {Map<string, UniqueEffect} */
    static get coverObjectsMap() { return this._instances; }

    /**
     * @alias
     * Test if a token has this terrain already.
     * @param {Token} token
     * @returns {boolean}
     */
    tokenHasCover(token) { return this.isOnToken(token); }

    /** @type {string} */
    static type = "Cover";

    /**
     * Get all effects ordered by priority as well as unordered effects.
     * @type {object}
     *   - @prop {AbstractCoverObject[]} ordered          From highest to lowest priority
     *   - @prop {Set<AbstractCoverObject> unordered}     All objects with priority === 0
     */
    static get sortedCoverObjects() {
      const ordered = [];
      const unordered = new Set();
      for ( const coverEffect of this._instances.values() ) {
        if ( !coverEffect.priority ) unordered.add(coverEffect);
        else ordered.push(coverEffect);
      }
      ordered.sort((a, b) => b.priority - a.priority);
      return { ordered, unordered };
    }


    /**
     * Determine what cover effects apply to a target token given an attacking token.
     * @param {Token} attackingToken
     * @param {Token} targetToken
     * @returns {Set<CoverEffect>}
     */
    static coverForToken(attackingToken, targetToken, opts = {}) {
      const effects = new Set();
      const { ordered, unordered } = this.sortedCoverObjects;

      // Test cover effects in priority order.
      for ( const coverEffect of ordered ) {
        if ( coverEffect._couldApply(attackingToken, targetToken, opts) ) {
          effects.add(coverEffect);
          if ( !coverEffect.canOverlap ) break;
        }
      }

      // Test cover effects without a set priority.
      for ( const coverEffect of unordered ) {
        // If there is already an effect, cannot use a non-overlapping effect.
        if ( !coverEffect.canOverlap && effects.size ) continue;
        if ( coverEffect._couldApply(attackingToken, targetToken, opts) ) effects.add(coverEffect);
      }
      return effects;
    }

    /**
     * Determine if the GM has added a cover effect override to a token.
     * Cover effect overrides have a UNIQUE_EFFECT.ID flag but no local flag.
     * @param {Token} actor
     * @returns {boolean}
     */
    static coverOverrideApplied(token) {
      // TODO: Either add LOCAL Flag or re-do so it is not needed. Maybe compare to source?
      const { ID, IS_LOCAL } = FLAGS.UNIQUE_EFFECT;
      for ( const effectDoc of CONFIG[MODULE_ID].CoverEffect._allUniqueEffectDocumentsOnToken(token) ) {
        const modFlags = effectDoc?.flags?.[MODULE_ID];
        if ( !modFlags ) continue;
        if ( modFlags[ID] && !modFlags[IS_LOCAL] ) return true;
      }
      return false;
    }

    /**
     * Default data required to be present in the base effect document.
     * @param {string} [activeEffectId]   The id to use
     * @returns {object}
     */
    static newDocumentData(activeEffectId) {
      const data = Base.newDocumentData.call(this, activeEffectId);
      data.name = game.i18n.localize(`${MODULE_ID}.phrases.newEffect`);
      data.img = ICONS.MODULE;

      // Cover Rules flags
      const modFlags = data.flags[MODULE_ID];
      modFlags[FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD] = 0;
      modFlags[FLAGS.COVER_EFFECT.RULES.PRIORITY] = 0;
      modFlags[FLAGS.COVER_EFFECT.RULES.CAN_OVERLAP] = false;
      modFlags[FLAGS.COVER_EFFECT.RULES.INCLUDE_WALLS] = true;
      modFlags[FLAGS.COVER_EFFECT.RULES.LIVE_TOKENS_BLOCK] = false;
      modFlags[FLAGS.COVER_EFFECT.RULES.DEAD_TOKENS_BLOCK] = false;
      modFlags[FLAGS.COVER_EFFECT.RULES.PRONE_TOKENS_BLOCK] = false;
      return data;
    }

    /**
     * Transition a single document stored in the storage object
     */
    static async _transitionDocument(doc) {
      const coverEffectId = doc.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID);
      if ( coverEffectId ) await doc.setFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID, coverEffectId);
    }
  };
}
