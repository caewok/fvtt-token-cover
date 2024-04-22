/* globals
*/
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
    this.id = id ?? `${MODULE_ID}.${this.systemId}.${foundry.utils.randomID()}`;
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
    if ( !coverObjectsMap.has(id) ) await this.constructor.addStoredCoverObjectIds(id);
    const obj = new this(id);
    if ( !obj.#document ) this.#document = this.findStorageDocument();
    if ( !obj.#document ) this.#document = await this.loadStorageDocument();
    if ( !obj.#document ) this.#document = await this.createStorageDocument();
    return obj;
  }

  // ----- NOTE: Getters, setters, related properties ----- //

  /** @type {Document|object} */
  #document;

  get document() { return this.#document || (this.#document = this.findStorageDocument()); }

  // ----- NOTE: Methods ----- //

  /**
   * Find an existing local document to use for the storage.
   * @returns {Document|object|undefined}
   */
  findStorageDocument() { return { id: this.id }; }

  /**
   * Load an async document to use for storage.
   * @returns {Document|object|undefined}
   */
  async loadStorageDocument() { return { id: this.id }; }

  /**
   * Create a storage document from scratch.
   * @returns {Document|object}
   */
  async createStorageDocument() { return { id: this.id }; }

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
    await this.constructor.addStoredCoverObjectIds(newObj.id);
    newObj.update(this.toJSON())
    return newObj;
  }

  /**
   * Delete this cover object from the objects map and optionally remove stored data.
   * @param {boolean} {deleteStorageDocument = false}    If true, save data is deleted. Async if true.
   */
  async delete(deleteStorageDocument = false) {
    this.constructor.coverObjectsMap.delete(this.id);
    if ( deleteStorageDocument ) await this._deleteStorageDocument();
    await this.constructor.removeStoredCoverObjectIds(newObj.id);
  }

  /**
   * Delete the underlying stored document.
   */
  async _deleteStorageDocument() { this.#document = undefined; }

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

  /**
   * Render the cover effect configuration window.
   */
  async renderConfig() { console.error("AbstractCoverObject#renderConfig must be handled by child class.")}

  // ----- NOTE: Static getter, setters, related properties ----- //

  /** @type {string} */
  static get settingsKey() { console.error("Must be set by child class"); }

  /** @type {string[]} */
  static get storedCoverObjectIds() {
    return Settings.get(MODULE_ID, this.settingsKey) ?? [];
  }

  /** @type {string} */
  static get systemId() { return game.system.id; }

  /** @type {object} */
  static newCoverObjectData() { return {}; }

  // ----- NOTE: Static methods ----- //

  /**
   * Add an id to the stored cover object ids.
   * @param {string} id
   */
  async addStoredCoverObjectId(id) {
    const storedIds = new Set(this.storedCoverObjectIds);
    if ( storedIds.has(id) ) return;
    storedIds.add(id);
    return Settings.set(MODULE_ID, this.settingsKey, storedIds.values());
  }

  /**
   * Remove an id from the stored cover object ids.
   * @param {string} id
   */
  async removeStoredCoverObjectId(id) {
    const storedIds = new Set(this.storedCoverObjectIds);
    if ( !storedIds.has(id) ) return;
    storedIds.delete(id);
    return Settings.set(MODULE_ID, this.settingsKey, storedIds.values());
  }

  /**
   * Get default cover object data for different systems.
   * @returns {Map<string, object>} Map of objects with keys corresponding to cover type object ids.
   */
  static _defaultCoverObjectData() { return new Map(); }

  /**
   * Create an object for each stored id. If no ids in settings, create from default ids.
   */
  static async initialize() {
    let storedIds = this.storedCoverObjectIds;
    if ( !storedIds.length ) storedIds = this._defaultCoverTypeData.keys();
    for ( const id of this.storedCoverObjectIds ) await this.create(id);
  }

  /**
   * Import a cover effect from JSON. If it already exists in cover objects, update.
   * Otherwise, instantiate new object.
   */
//   static async importFromJSON(json) {
//
//   }

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
}
