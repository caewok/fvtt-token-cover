/* globals
CONFIG,
CONST,
foundry,
game,
readTextFromFile,
renderTemplate,
saveDataToFile,
TextEditor,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

// Much of this is from
// https://github.com/DFreds/dfreds-convenient-effects/blob/main/scripts/app/convenient-effects-controller.js

import { Settings } from "./settings.js";
import { log } from "./util.js";
import { MODULE_ID } from "./const.js";
import { ATCFolderConfig } from "./ATCFolderConfig.js";

/**
 * Controller class to handle app events and manipulate underlying Foundry data.
 */
export class CoverEffectsController {

  static ALL_COVERS_FOLDER = "all-covers";

  static FAVORITE_COVERS_FOLDER = "favorite-covers";

  /** @type {CoverEffectsApp} */
  #viewMvc;

  /**
   * Initializes the controller and its dependencies
   * @param {CoverEffectsApp} viewMvc - the app that the controller can interact with
   */
  constructor(viewMvc) {
    this.#viewMvc = viewMvc;
  }

  static canModifyFolder(folderId) {
    return !(folderId === this.ALL_COVERS_FOLDER && folderId === this.FAVORITE_COVERS_FOLDER);
  }

  /**
   * Rerender the application for this controller.
   * Need only rerender the directory listing.
   */
  rerender() { this.#viewMvc.render({ parts: ["directory"], force: true }); }

  /**
   * Configure and return data specific for the header.
   * @returns {Object} the data to pass to the template
   */
  headerData(context) {
    context.hasDefaults = Boolean(CONFIG[MODULE_ID].CoverEffect._resetDefaultEffects);
    return context;
  }

  /**
   * Configure and return data specific for the directories.
   * @returns {Object} the data to pass to the template
   */
  directoryData(context) {
    const covers = [...CONFIG[MODULE_ID].CoverEffect._instances.values()];
    this._sortCovers(covers);
    const folderData = [];

    // Folder holding all covers.
    folderData.push({
      folder: {
        name: game.i18n.localize(`${MODULE_ID}.coverbook.all-covers`),
        id: this.constructor.ALL_COVERS_FOLDER,
        color: "black",
      },
      effects: covers,
    });

    // Folder holding marked favorites
    folderData.push({
      folder: {
        name: game.i18n.localize(`${MODULE_ID}.coverbook.favorites`),
        id: this.constructor.FAVORITE_COVERS_FOLDER,
        color: "green",
      },
      effects: this._fetchFavorites(covers),
    });

    // User-defined folders
    CONFIG[MODULE_ID].CoverEffect.folders.forEach(folder => {
      folderData.push({
        folder,
        effects: folder.effects.map(id => CONFIG[MODULE_ID].CoverEffect._instances.get(id)),
      });
    });

    Object.assign(context, {
      folderData,
      entryPartial: this.#viewMvc.constructor._entryPartial,
      folderPartial: this.#viewMvc.constructor._folderPartial,
    });
  }


  _fetchFavorites(covers) {
    log("CoverEffectsController|_fetchFavorites");
    const favorites = Settings.favorites;
    return covers.filter(c => favorites.has(c.uniqueEffectId));
  }


  _sortCovers(covers) {
    covers.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if ( nameA < nameB ) return -1;
      if ( nameA > nameB ) return 1;
      return 0;
    });
    return covers;
  }

  // ----- NOTE: Buttons ---- //

  /**
   * Handles clicks on the create effect button
   * @param {MouseEvent} event
   */
  async onCreateCover(folderId) {
    log("CoverEffectsController|onCreateCover", { folderId });
    const cover = await CONFIG[MODULE_ID].CoverEffect.create();
    if ( folderId && this.constructor.canModifyFolder(folderId) ) await Settings.addFolder({
      id: folderId,
      effects: [cover.uniqueEffectId],
    });
    if ( folderId === this.constructor.FAVORITE_COVERS_FOLDER ) await Settings.addToFavorites(cover.uniqueEffectId);
    this.rerender();
    cover.document.sheet.render(true);
  }

  /**
   * Handles clicks on the create defaults button
   * @param {MouseEvent} event
   */
  async onCreateDefaults() {
    log("CoverEffectsController|onCreateDefaults");
    const confirmText = game.i18n.localize(`${MODULE_ID}.coverbook.are-you-sure`);
    const descriptionText = game.i18n.localize(`${MODULE_ID}.coverbook.create-defaults-description`);
    const proceed = await foundry.applications.api.DialogV2.confirm({
      title: "Replace Default Covers",
      content: `<h4>${confirmText}</h4><p>${descriptionText}`,
      rejectClose: false,
      modal: true,
    });
    if ( !proceed ) return;
    log("CoverEffectsController|onCreateDefaultsClick yes");
    await CONFIG[MODULE_ID].CoverEffect._resetDefaultEffects();
    this.rerender();
  }

  // ----- NOTE: Folder management ----- //


  async onCreateFolder() {
    const folderConfig = new ATCFolderConfig({ viewMvc: this.#viewMvc });
    folderConfig.render({ force: true });
  }

  async onEditFolder(folderId) {
    if ( !folderId ) return;
    const folderConfig = new ATCFolderConfig({ folderId, viewMvc: this.#viewMvc } );
    folderConfig.render({ force: true });
  }

  async onDeleteFolder(folderId) {
    if ( !folderId ) return;
    await CONFIG[MODULE_ID].CoverEffect.deleteFolder(folderId);
    this.rerender();
  }

  // ----- NOTE: Cover item management ----- //

  /**
   * Handle editing the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onEditCover(effectId) {
    log("CoverEffectsController|onEditEffectClick", { effectId });
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    cover.document.sheet.render(true);
  }

  /**
   * Handle deleting the custom effect
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDeleteCover(effectId) {
    log("CoverEffectsController|onDeleteEffectClick", { effectId });
    const confirmText = game.i18n.localize(`${MODULE_ID}.coverbook.are-you-sure`);
    const descriptionText = game.i18n.localize(`${MODULE_ID}.coverbook.remove-cover-description`);
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(`${MODULE_ID}.coverbook.delete-cover`) },
      content: `<h4>${confirmText}</h4><p>${descriptionText}`,
      rejectClose: false,
      modal: true,
    });
    if ( !proceed ) return;
    log("CoverEffectsController|onDeleteEffectClick yes");
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    await cover.destroy(true);
    this.rerender();
  }

  /**
   * Handle adding the effect to the favorites settings and to the favorites folder
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onAddFavorite(effectId) {
    log("CoverEffectsController|onAddFavorite", { effectId });
    await Settings.addToFavorites(effectId);
    this.rerender();
  }

  /**
   * Handle removing the effect from the favorites settings and from the favorites folder
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onRemoveFavorite(effectId) {
    log("CoverEffectsController|onRemoveFavorite", { effectId });
    await Settings.removeFromFavorites(effectId);
    this.rerender();
  }

  /**
   * Checks if the provided effect is favorited
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   * @returns true if the effect is favorited
   */
  isFavorited(effectItem) {
    log("CoverEffectsController|isFavorited");
    const effectId = effectItem.dataset.effectId;
    return Settings.isFavorite(effectId);
  }

  /**
   * Handle clicks on the import cover menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onImportCover(effectId) {
    log("CoverEffectsController|onImportCover", { effectId });
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    const res = await this.importFromJSONDialog(cover);
    if ( !res || res.type === "error" || res === "cancel" ) return;
    await cover.fromJSON(res);
    this.rerender();
  }

  /**
   * Handle clicks on the export cover menu item.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  onExportCover(effectId) {
    log("CoverEffectsController|onExportCover", { effectId });
    const cover = CONFIG[MODULE_ID].Cover._instances.get(effectId);
    const data = cover.toJSON();

    data.flags.exportSource = {
      world: game.world.id,
      system: game.system.id,
      coreVersion: game.version,
      systemVersion: game.system.version,
      tokencoverVersion: game.modules.get(MODULE_ID).version
    };
    const filename = `${MODULE_ID}_${cover.name}`;
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", `${filename}.json`);
  }

  /**
   * Handle duplicating an effect.
   * @param {jQuery} effectItem - jQuery element representing the effect list item
   */
  async onDuplicateCover(effectId) {
    log("CoverEffectsController|onDuplicate", { effectId });
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(effectId);
    await cover.duplicate();
    this.rerender();
  }

  // ----- NOTE: Drag / Drop ----- //

  canDragStart(_event) {
    return game.user.role >= CONST.USER_ROLES.ASSISTANT;
  }

  canDragDrop(_event) {
    return game.user.role >= CONST.USER_ROLES.ASSISTANT;
  }


  /**
   * Handles starting the drag for effect items
   * For non-nested effects, populates the dataTransfer with Foundry's expected
   * ActiveEffect type and data to make non-nested effects behave as core does
   * @param {DragEvent} event - event that corresponds to the drag start
   */
  onDragStart(event) {
    log(`CoverEffectsController|onEffectDragStart for ${event.target.dataset.entryName}`);
    const cover = CONFIG[MODULE_ID].CoverEffect._instances.get(event.target.dataset.entryId);
    event.dataTransfer.setData(
      "text/plain",
      JSON.stringify(cover.toDragData())
    );
  }


  /**
   * Callback actions which occur when a dragged element is dropped on a target.
   * @param {DragEvent} event       The originating DragEvent
   */
  async onEffectDrop(event) {
    log("CoverEffectsController|onEffectDrop");
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    await CONFIG[MODULE_ID].CoverEffect._processEffectDrop(data);
    this.rerender();
  }

  /**
   * Callback actions which occur when a dragged element is dragged over a target.
   * @param {DragEvent} event       The originating DragEvent
   */
  async onDragOver(_event) { return; } /* eslint-disable-line no-useless-return */

  // ----- NOTE: Search ----- //


  /**
   * @param {string} query
   * @param {Set<string>} entryIds
   * @param {HTMLElement} element
   * @param {object} options
   */
  _onMatchSearchEntry(query, entryIds, element, _options) {
    const entryId = element.dataset.entryId;
    if ( !entryId ) return;
    element.style.display = !query || entryIds.has(entryId) ? "flex" : "none";
  }

  /**
   * @param {KeyboardEvent} event
   * @param {string} query
   * @param {RegExp|undefined} rgx
   * @param {HTMLElement|null|undefined} html
   */
  _onSearchFilter(_event, query, rgx, html) {
    const entryIds = new Set();
    const folderIds = new Set();
    const autoExpandIds = new Set();
    const options = {};

    // Match entries and folders.
    if ( query ) {
      // First match search folders.
      this._matchSearchFolders(rgx, folderIds, autoExpandIds, options);

      // Next match entries.
      this._matchSearchEntries(rgx, entryIds, folderIds, autoExpandIds, options);
    }

    // Toggle each directory entry.
    for ( const elHTML of html?.querySelectorAll(".directory-item") ?? []) {
      if ( elHTML.hidden ) continue; // No current option to hide
      if ( elHTML.classList.contains("folder") ) {
        const folderId = elHTML.dataset.folderId;
        if ( !folderId ) continue;

        const match = CONFIG[MODULE_ID].CoverEffect.folders.has(folderId);
        elHTML.style.display = !query || match ? "flex" : "none";
        if ( autoExpandIds.has(folderId ?? "")) {
          if ( query && match ) elHTML.classList.add("expanded");
        } else elHTML.classList.toggle("expanded", Settings.isFolderExpanded(folderId));
      } else this._onMatchSearchEntry(query, entryIds, elHTML, options);
    }
  }

  /**
   * @param {RegExp|undefined} query
   * @param {Set<string>} folderIds
   * @param {Set<string>} autoExpandIds
   * @param {object} options
   */
  _matchSearchFolders(query, folderIds, autoExpandIds, _options) {
    const SearchFilter = foundry.applications.ux.SearchFilter;
    const folders = CONFIG[MODULE_ID].CoverEffect.folders;
    folders.forEach(folder => {
      if ( query?.test(SearchFilter.cleanQuery(folder.name)) ) {
        this.#onMatchFolder(folder, folderIds, autoExpandIds, { autoExpand: false });
      }
    });
  }

  /**
   * @param {object} folder
   * @param {Set<string>} folderIds
   * @param {Set<string>} autoExpandIds
   * @param {object} [opts]
   * @param {boolean} [opts.autoExpand=true]
   */
  #onMatchFolder(folder, folderIds, autoExpandIds, { autoExpand = true } = {}) {
    folderIds.add(folder.id);
    if ( autoExpand ) autoExpandIds.add(folder.id);
  }

  /**
   * @param {RegExp|undefined} query
   * @param {Set<string} entryIds
   * @param {Set<string>} folderIds
   * @param {Set<string>} autoExpandIds
   * @param {object} options
   */
  _matchSearchEntries(query, entryIds, folderIds, autoExpandIds, _options) {
    // Note: From FoundryVTT; we could do a different search.
    const SearchFilter = foundry.applications.ux.SearchFilter;
    const nameOnlySearch = true;

    // If we matched a folder, add its child entries
    const folders = CONFIG[MODULE_ID].CoverEffect.folders;
    for ( const folderId of folderIds ) {
      const folder = folders.get(folderId);
      folder.effects.forEach(id => entryIds.add(id));
    }

    // Search by effect name
    if ( nameOnlySearch ) {
      for ( const entry of CONFIG[MODULE_ID].CoverEffect._instances.values() ) {
        // If searching by name, match the entry name.
        if ( query?.test(SearchFilter.cleanQuery(entry.name)) ) {
          entryIds.add(entry.uniqueEffectId);
          const entryFolders = CONFIG[MODULE_ID].CoverEffect.findFoldersForEffect(entry.uniqueEffectId);
          entryFolders.forEach(folder => this.#onMatchFolder(folder, folderIds, autoExpandIds));
        }
      }
    }
    if ( nameOnlySearch ) return;

    // Search by effect description
    for ( const entry of CONFIG[MODULE_ID].CoverEffect._instances.values() ) {
      if ( query?.test(SearchFilter.cleanQuery(entry.document.description)) ) {
        entryIds.add(entry.uniqueEffectId);
        const entryFolders = CONFIG[MODULE_ID].CoverEffect.findFoldersForEffect(entry.uniqueEffectId);
        entryFolders.forEach(folder => this.#onMatchFolder(folder, folderIds, autoExpandIds));
      }
    }
  }


  // ----- NOTE: Sub-Dialogs ----- //

  /**
   * Open a dialog to import data into a cover.
   * @param {UniqueActiveEffect} cover    The cover for which to overwrite
   * @returns {string|"close"|null} The json from the imported text file. "close" if close button hit;
   *                                null if dialog closed.
   */
  async importFromJSONDialog(_cover) {
    // See https://github.com/DFreds/dfreds-convenient-effects/blob/c2d5e81eb1d28d4db3cb0889c22a775c765c24e3/scripts/effects/custom-effects-handler.js#L156
    const hint1 = game.i18n.localize(`${MODULE_ID}.coverbook.import-cover-description`);
    const content = await renderTemplate("templates/apps/import-data.hbs", { hint1 }); // Skip hint2.
    const dialogConfig = {
      window: { title: game.i18n.localize(`${MODULE_ID}.coverbook.import-cover`) },
      position: { width: 400 },
      content,
      buttons: [{
        action: "import",
        icon: '<i class="fas fa-file-import"></i>',
        label: game.i18n.localize("SIDEBAR.Import"),
        default: true,
        callback: async (event, button, _dialog) => {
          const form = button.form;
          if ( !form.data.files.length ) return ui.notifications.error("You did not upload a data file!");
          const json = await readTextFromFile(form.data.files[0]);
          log("importFromJSONDialog|Read text");
          return json;
        }
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-times"></i>',
        label: game.i18n.localize("Cancel"),
      }],
    };
    return foundry.applications.api.DialogV2.wait(dialogConfig);
  }
}
