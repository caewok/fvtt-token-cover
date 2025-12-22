/* globals
foundry,
game,
ui,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FA_ICONS } from "./const.js";
import { CoverEffectsController } from "./CoverEffectsController.js";
import { Settings } from "./settings.js";

// See
// https://github.com/DFreds/dfreds-convenient-effects/blob/main/src/ts/ui/ce-app/convenient-effects-v2.ts

/**
 * Application class for handling the UI of the terrain effects.
 * Based on AbstractSidebarTab.
 */
const apps = foundry.applications;
export class CoverEffectsApp extends apps.api.HandlebarsApplicationMixin(apps.sidebar.AbstractSidebarTab) {

  /**
   * Re-render if the app is open.
   * Needed when terrain effects are updated in the effects app.
   * See https://github.com/DFreds/dfreds-convenient-effects/blob/c2d5e81eb1d28d4db3cb0889c22a775c765c24e3/scripts/foundry-helpers.js#L51
   */
  static rerender() {
    const app = ui.sidebar.popouts[MODULE_ID];
    if ( app ) app.render(true);
  }

  /**
   * Initializes the application and its dependencies
   */
  constructor() {
    super();
    this._controller = new CoverEffectsController(this);
  }

  static tabName = MODULE_ID;

  static DEFAULT_OPTIONS = {
    classes: ["directory", "flexcol"],
    window: {
      title: `${MODULE_ID}.phrases.covers`,
      icon: FA_ICONS.MODULE,
      frame: true, // If true, will be popout.
      positioned: true,
    },
    resizable: true,
    position: {
      top: 60,
      left: 100,
      width: 300,
      height: 600,
    },
    dragDrop: [
      {
        dragSelector: ".tokencover"
      }
    ],
    filters: [
      {
        contentSelector: ".directory-list"
      }
    ],
    actions: {
      createEffect: CoverEffectsApp.#onCreateEffect,
      resetDefaults: CoverEffectsApp.#onResetDefaults,
    },
  };

  static _entryPartial = `modules/${MODULE_ID}/templates/cover-effects-menu-app-document-partial.html`;

  static PARTS = {
    header: {
      template: `modules/${MODULE_ID}/templates/cover-effects-menu-app-header.html`,
    },
    directory: {
      template: `modules/${MODULE_ID}/templates/cover-effects-menu-app-directory.html`,
      templates: [
        this._entryPartial,
      ],
      scrollable: [""],
    },
  };

  /**
   * Add context menus at first render.
   *
   * -----
   * Actions performed after a first render of the Application.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @returns {Promise<void>}
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this._createContextMenus();
  }

  /**
   * Add drag-drop functionality.
   *
   * ----
   * Actions performed after any render of the Application.
   * @param {ApplicationRenderContext} context      Prepared context data
   * @param {RenderOptions} options                 Provided render options
   * @returns {Promise<void>}
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Drag-drop.
    if ( options.parts?.includes("directory") ) {
      new apps.ux.DragDrop.implementation({
        dragSelector: ".directory-item",
        dropSelector: ".directory-list",
        permissions: {
          dragstart: this._controller.canDragStart,
          drop: this._controller.canDragDrop,
        },
        callbacks: {
          dragstart: this._controller.onDragStart,
          dragover: this._controller.onDragOver,
          drop: this._controller.onEffectDrop,
        },
      }).bind(this.element);
    }
  }

  _createContextMenus() {
    this._createContextMenu(
      this._getCoverEntryContextOptions,
      ".directory-item[data-entry-id]",
      {
        fixed: true,
      },
    );
  }

  /**
   * Context menu (right-click) options for terrain entries.
   */
  _getCoverEntryContextOptions() {
    return [
      {
        name: `${MODULE_ID}.coverbook.edit-terrain`,
        icon: '<i class="fas fa-edit fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: async li => {
          const effectId = this.#effectIdFromElement(li);
          return this._controller.onEditCover(effectId);
        }
      },
      {
        name: "SIDEBAR.Duplicate",
        icon: '<i class="far fa-copy fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: async li => {
          const effectId = this.#effectIdFromElement(li);
          return this._controller.onDuplicateCover(effectId);
        }
      },
      {
        name: `${MODULE_ID}.coverbook.import-terrain`,
        icon: '<i class="far fa-file-arrow-up"></i>',
        condition: () => game.user.isGM,
        callback: async li => {
          const effectId = this.#effectIdFromElement(li);
          return this._controller.onImportCover(effectId);
        },
      },
      {
        name: `${MODULE_ID}.coverbook.export-terrain`,
        icon: '<i class="far fa-file-arrow-down"></i>',
        condition: () => game.user.isGM,
        callback: async li => {
          const effectId = this.#effectIdFromElement(li);
          return this._controller.onExportCover(effectId);
        },
      },
      {
        name: `${MODULE_ID}.coverbook.delete-terrain`,
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: async li => {
          const effectId = this.#effectIdFromElement(li);
          return this._controller.onDeleteCover(effectId);
        },
      }
    ];
  }

  #folderIdFromElement(li) {
    const folderHTML = li.closest(".directory-item.folder");
    return folderHTML.dataset.folderId;
  }

  #effectIdFromElement(li) {
    const effectHTML = li.closest("[data-entry-id]");
    return effectHTML.dataset.entryId;
  }

  /**
   * Data for the terrain sidebar.
   *
   * -----
   * Prepare application rendering context data for a given render request. If exactly one tab group is configured for
   * this application, it will be prepared automatically.
   * @param {RenderOptions} options                 Options which configure application rendering behavior
   * @returns {Promise<ApplicationRenderContext>}   Context data for the render operation
   */
  // async _prepareContext(options)

  /**
   * Prepare context specific to the header and the folder directory parts.
   *
   * -----
   * @param {string} partId                         The part being rendered
   * @param {ApplicationRenderContext} context      Shared context provided by _prepareContext
   * @param {HandlebarsRenderOptions} options       Options which configure application rendering behavior
   * @returns {Promise<ApplicationRenderContext>}   Context data for a specific part
   */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    switch ( partId ) {
      case "directory": this._controller.directoryData(context); break;
      case "header": this._controller.headerData(context); break;
    }
    return context;
  }

  static async #onCreateEffect(event, _target) {
    event.stopPropagation();
    return this._controller.onCreateTerrain();
  }

  static async #onResetDefaults(event, _target) {
    event.stopPropagation();
    return this._controller.onCreateDefaults();
  }
}
