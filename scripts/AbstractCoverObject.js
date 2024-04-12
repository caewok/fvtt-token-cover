/* globals
*/
"use strict";

import { Settings } from "./settings.js";
import { MODULE_ID } from "./const.js";

/**
 * Abstract class to manage saving and loading cover objects.
 * At least two children: CoverTypes and CoverEffects.
 * Both represent a set of data that can be saved to/loaded from Settings or a JSON.
 * Both are singletary, as only one instantiation per given id.
 */
export class AbstractCoverObject {
  /** @type {object} */
  config = {};

  /**
   * @param {object} [coverObjectData={}]
   */
  constructor(coverObjectData = {}) {
    const id = this.constructor.idFromData(coverObjectData);
    const coverObjectsMap = this.constructor.coverObjectsMap;
    if ( coverObjectsMap.has(id) ) return coverObjectsMap.get(id);

    // Construct the object
    this._configure(coverObjectData);

    // Unique cover type per id.
    coverObjectsMap.set(id, this);
  }

  /**
   * Configure the object using the default provided data.
   * @param {object} [coverObjectData={}]
   */
  _configure(coverObjectData = {}) {
    this.config = coverObjectData;
  }

  // ----- NOTE: Getters, setters, related properties ----- //

  /** @type {string} */
  get id() { return `${MODULE_ID}.${this.systemId}.${foundry.utils.randomID()}`; }

  /** @type {string} */
  get systemId() { return game.system.id; }


  // ----- NOTE: Methods ----- //

  /**
   * Update the cover type with a new full or partial config object.
   * @param {object} [config={}]
   */
  update(config = {}) {
    const id = this.constructor.idFromData(config);
    if ( id && id !== this.id ) { // If ids are the same, can result in infinite loop. See _updateCoverTypesFromSettings.
      const coverObjectsMap = this.constructor.coverObjectsMap;
      coverObjectsMap.delete(this.id);
      coverObjectsMap.set(id, this);
    }
    for ( const [key, value] of Object.entries(config) ) this.config[key] = value;
  }

  /**
   * Sync from the stored setting, if any.
   */
  fromSettings() {
    const allCoverObjects = Settings.get(this.constructor.settingsKey);
    const data = allCoverObjects[this.systemId]?.[this.id];
    if ( data ) this.update(data);
  }

  /**
   * Save to the stored setting.
   */
  async saveToSettings() {
    const settingsKey = this.constructor.settingsKey;
    const systemId = this.systemId;
    const allCoverObjects = Settings.get(settingsKey);
    allCoverObjects[systemId] ??= {};
    allCoverObjects[systemId][this.id] = this.toJSON();
    await Settings.set(settingsKey, allCoverObjects);
  }

  /**
   * Delete the setting associated with this cover type.
   * Typically used if destroying the cover type or resetting to defaults.
   */
  async deleteSetting() {
    const settingsKey = this.constructor.settingsKey;
    const systemId = this.systemId;
    const allCoverObjects = Settings.get(settingsKey);
    allCoverObjects[systemId] ??= {};
    delete allCoverObjects[systemId][this.id];
    return Settings.set(settingsKey, allCoverObjects);
  }

  /**
   * Export this cover type data to JSON.
   * @returns {object}
   */
  toJSON() { return this.config; }

  /**
   * Import data from JSON and overwrite.
   */
  fromJSON(json) {
    try {
      json = JSON.parse(json);
    } catch ( error ) {
      console.error(`${MODULE_ID}|CoverType#fromJSON`, error);
      return;
    }
    this.update(json);
  }

  // ----- NOTE: Static getter, setters, related properties ----- //

  /** @type {string} */
  static get settingsKey() { console.error("AbstractCoverObject#settingsKey|Must be handled by child class.")}

  // ----- NOTE: Static methods ----- //

  /**
   * Retrieve an id from cover data.
   * @param {object} coverObjectData
   */
  static idFromData(coverObjectData) { return coverObjectData.id; }

  /**
   * Update the cover types from settings.
   */
  static _updateCoverTypesFromSettings() {
    this.coverObjectsMap.forEach(ct => ct.fromSettings());
  }

  /**
   * Save cover types to settings.
   */
  static async _saveCoverTypesToSettings() {
    const promises = [];
    this.coverObjectsMap.forEach(ct => promises.push(ct.saveToSettings()));
    return Promise.allSettled(promises);
  }

  /**
   * Save all cover types to a json file.
   */
  static saveToJSON() {
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
  static importFromJSON(json) {
    json = JSON.parse(json);
    if ( !json.flags?.exportSource?.[`${MODULE_ID}Version`] ) {
      console.error("JSON file not recognized.");
      return;
    }
    this.coverObjectsMap.clear();
    json.coverObjects.forEach(ct => new this(ct));
  }

  static async importFromJSONDialog() {
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
   * Create default effects and store in the map. Resets anything already in the map.
   * Typically used on game load.
   */
  static _constructDefaultCoverObjects() {
    const data = this._defaultCoverTypeData()
    this.coverObjectsMap.clear();
    Object.values(data).forEach(d => new this(d));
  }

  static _defaultCoverTypeData() {
    console.error("AbstractCoverObject#_defaultCoverTypeData|Must be handled by subclass.");
    return {};
  }
}
