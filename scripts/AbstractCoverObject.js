/* globals
foundry,
Dialog,
duplicate,
game,
readTextFromFile,
renderTemplate,
saveDataToFile,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { Settings } from "./settings.js";
import { MODULE_ID } from "./const.js";

/**
 * Abstract class to manage cover objects.
 * Singleton: one instantiation per id.
 * Child CoverType uses an object for the document, saved to settings.
 * Child CoverEffect uses a Document.
 * All cover object ids are stored in its settings key so they can be located and loaded.
 */
export class AbstractCoverObject {
  /** @type {string} */
  id;

  /**
   * @param {object} [coverObjectData={}]
   */
  constructor(id) {
    // Enforce unique cover type per id.
    this.id = id ?? `${MODULE_ID}.${this.constructor.systemId}.${foundry.utils.randomID()}`;
    const coverObjectsMap = this.constructor.coverObjectsMap;
    if ( coverObjectsMap.has(this.id) ) return coverObjectsMap.get(this.id);
    coverObjectsMap.set(this.id, this);
  }

  /**
   * Create a new cover object. To be used instead of the constructor in most situations.
   * If the storage document is local, constructor can be used instead.
   * @param {string} [id]                     Optional id to use for this cover object.
   *                                          Cover objects are singletons, so if this id is recognized,
   *                                          an existing object will be returned.
   * @return {AbstractCoverObject}
   */
  static async create(id) {
    const obj = new this(id);
    await this.addStoredCoverObjectId(id); // Must happen after creation so coverObjectsMap is updated.
    await obj.initializeStorageDocument();
    return obj;
  }

  // ----- NOTE: Getters, setters, related properties ----- //

  /** @type {Document|object} */
  #document;

  get document() { return this.#document || (this.#document = this._findStorageDocument()); }

  /**
   * Retrieve the cover effect icon for use in the list of cover effects.
   * @returns {string}
   */
  get icon() { return this.document?.icon; }

  /**
   * Retrieve the name of the cover effect for use in the list of cover effects.
   * @returns {string}
   */
  get name() { return this.document?.name; }

  /** @type {object} */
  get newCoverObjectData() { return {}; }

  /** @type {object|undefined} */
  get defaultCoverObjectData() {
    const data = this.constructor.defaultCoverObjectData.get(this.id);
    if ( !data ) return undefined;
    return duplicate(data); // So the underlying is not modified accidentally.
  }

  // ----- NOTE: Methods ----- //

  /**
   * Initialize the storage document for this id.
   */
  async initializeStorageDocument() {
    if ( this.#document ) return;
    if ( !this.#document ) this.#document = this._findStorageDocument();
    if ( !this.#document ) this.#document = await this._loadStorageDocument();
    if ( !this.#document ) this.#document = await this._createStorageDocument();
    if ( !this.#document ) console.error("AbstractCoverObject#initializeStorageDocument|Storage document not initialized.");
  }

  /**
   * Find an existing local document to use for the storage.
   * @returns {Document|object|undefined}
   */
  _findStorageDocument() { return { id: this.id }; }

  /**
   * Load an async document to use for storage.
   * @returns {Document|object|undefined}
   */
  async _loadStorageDocument() { return { id: this.id }; }

  /**
   * Create a storage document from scratch.
   * @returns {Document|object}
   */
  async _createStorageDocument() { return { id: this.id }; }

  /**
   * Update this object with the given data.
   * @param {object} [config={}]
   */
  async update(config = {}) {
    foundry.utils.mergeObject(this.document, config);
  }

  /**
   * Revert this object to default data based on its id.
   */
  async revertToDefaultData() {
    // Delete and recreate the document entirely.
    // Updating is too unreliable given different system reqs for docs.
    await this._deleteStorageDocument();
    await this.loadStorageDocument();
    if ( !this.document ) await this.createStorageDocument();
  }

  /**
   * Duplicate this cover object but place in new object not connected to this one.
   * The duplicated item will have a new id, connected to a new document.
   * @return {AbstractCoverObject}
   */
  async duplicate() {
    const newObj = await this.constructor.create();
    await this.constructor.addStoredCoverObjectId(newObj.id);
    newObj.update(this.toJSON())
    return newObj;
  }

  /**
   * Delete this cover object from the objects map and optionally remove stored data.
   * @param {boolean} {deleteStorageDocument = false}    If true, save data is deleted. Async if true.
   */
  async delete() {
    this.constructor.coverObjectsMap.delete(this.id);
    if ( this.#document ) await this._deleteStorageDocument();
    this.#document = undefined;
    return this.constructor.removeStoredCoverObjectId(this.id); // Async
  }

  /**
   * Delete the underlying stored document.
   */
  async _deleteStorageDocument() {  }

  /**
   * Save a json file for this cover type.
   */
  exportToJSON() {
    const filename = `${MODULE_ID}_CoverObject_${this.id}`;
    const data = this.toJSON();
    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      [`${MODULE_ID}Version`]: game.modules.get(MODULE_ID).version
    };
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
   }

  /**
   * Export this cover type data to JSON.
   * @returns {object}
   */
  toJSON() { return this.document; }

  /**
   * Import data from JSON and overwrite.
   */
  async fromJSON(json) {
    try {
      json = JSON.parse(json);
    } catch ( error ) {
      console.error(`${MODULE_ID}|AbstractCoverObject#fromJSON`, error);
      return;
    }
    return this.update(json);
  }

  async importFromJSONDialog() {
    new Dialog({
      title: "Import Cover Objects",
      content: await renderTemplate("templates/apps/import-data.html", {
        hint1: "You may import a cover objects from an exported JSON file.",
        hint2: `This operation will update the cover object ${this.name} and cannot be undone.`
      }),
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: html => {
            const form = html.find("form")[0];
            if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
            readTextFromFile(form.data.files[0]).then(json => this.importFromJSON(json));
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "import"
    }, {
      width: 400
    }).render(true);
  }

  /**
   * Render the cover effect configuration window.
   */
  async renderConfig() { console.error("AbstractCoverObject#renderConfig must be handled by child class.")}

  // ----- NOTE: Static getter, setters, related properties ----- //

  /** @type {string} */
  static get settingsKey() { console.error("Must be set by child class"); return undefined; }

  /** @type {string[]} */
  static get storedCoverObjectIds() {
    const out = Settings.get(this.settingsKey);
    if ( out instanceof Array ) return out;
    return Object.keys(out);
  }

  /** @type {string} */
  static get systemId() { return game.system.id; }

  /**
   * Get default cover object data for different systems.
   * @returns {Map<string, object>} Map of objects with keys corresponding to cover type object ids.
   */
  static get defaultCoverObjectData() { return new Map(); }

  // ----- NOTE: Static methods ----- //

  /**
   * Add an id to the stored cover object ids.
   * @param {string} id
   */
  static async addStoredCoverObjectId(id) {
    const storedIds = new Set(this.storedCoverObjectIds);
    if ( storedIds.has(id) ) return;
    storedIds.add(id);
    return Settings.set(this.settingsKey, [...storedIds.values()]);
  }

  /**
   * Remove an id from the stored cover object ids.
   * @param {string} id
   */
  static async removeStoredCoverObjectId(id) {
    const storedIds = new Set(this.storedCoverObjectIds);
    if ( !storedIds.has(id) ) return;
    storedIds.delete(id);
    return Settings.set(this.settingsKey, [...storedIds.values()]);
  }

  /**
   * Create an object for each stored id. If no ids in settings, create from default ids.
   */
  static async initialize() {
    let storedIds = this.storedCoverObjectIds;
    if ( !storedIds.length ) storedIds = this.defaultCoverObjectData.keys();
    for ( const id of storedIds ) await this.create(id);
  }

  /**
   * Reset to the defaults for this cover object type.
   */
  static async resetToDefaults() {
    // Delete all existing.
    const promises = [];
    this.coverObjectsMap.forEach(c => promises.push(c.delete()));
    await Promise.allSettled(promises);
    return this.initialize();
  }

  /**
   * Save all cover objects to a json file.
   */
  static saveAllToJSON() {
    const filename = `${MODULE_ID}_CoverObjects`;
    const data = { coverObjects: [], flags: {} };
    this.coverObjectsMap.forEach(c => data.coverObjects.push(c.toJSON()));
    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      [`${MODULE_ID}Version`]: game.modules.get(MODULE_ID).version
    };
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
  }

  /**
   * Import all cover types from a json file.
   * @param {JSON} json   Data to import
   */
  static async importAllFromJSON(json) {
    json = JSON.parse(json);
    if ( !json.flags?.exportSource?.[`${MODULE_ID}Version`] ) {
      console.error("JSON file not recognized.");
      return;
    }
    this.coverObjectsMap.clear();
    const promises = [];
    for ( const ct of json.coverObjects ) {
      promises.push(this.constructor.create(ct));
    }
    return Promise.allSettled(promises);
  }

  static async importAllFromJSONDialog() {
    new Dialog({
      title: "Import Cover Objects",
      content: await renderTemplate("templates/apps/import-data.html", {
        hint1: "You may import cover objects from an exported JSON file.",
        hint2: "This operation will update the cover objects and cannot be undone."
      }),
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: html => {
            const form = html.find("form")[0];
            if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
            readTextFromFile(form.data.files[0]).then(json => this.importAllFromJSON(json));
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "import"
    }, {
      width: 400
    }).render(true);
  }

  static async resetToDefaultsDialog() {
    new Dialog({
      title: "Reset Cover Objects",
      content: "Reset cover objects to defaults? This cannot be undone.",
      buttons: {
        reset: {
          icon: '<i class="fas fa-rotate-left"></i>',
          label: "Reset",
          callback: _html => {
            return this.resetToDefaults();
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "reset"
    }, {
      width: 400
    }).render(true);
  }
}
