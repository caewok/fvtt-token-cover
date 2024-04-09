/* globals
Application,
ContextMenu,
foundry,
game,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { CoverEffectsController } from "./CoverEffectsController.js";

export class CoverEffectsApp extends Application {
  /**
   * Initializes the application and its dependencies
   */
  constructor() {
    super();
    this._controller = new CoverEffectsController(this);
  }

  /**
   * Set the options for how the application is displayed.
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      width: 300,
      height: 600,
      top: 100,
      left: 200,
      popOut: true,
      minimizable: true,
      resizable: true,
      id: "tokencover",
      classes: ["sidebar-popout"],
      dragDrop: [
        {
          dragSelector: ".tokencover"
        }
      ],
      filters: [
        {
          inputSelector: 'input[name="search"]',
          contentSelector: ".directory-list"
        }
      ],
      title: "Cover Effects",
      template:
        `modules/${MODULE_ID}/templates/cover-effects-menu-app.html`,
      scrollY: ["ol.directory-list"]
    });
  }

  /** @override */
  getData() { return this._controller.data; }

  /** @override */
  activateListeners(html) {
    this._rootView = html;
    this._initClickListeners();
    this._initContextMenus();
  }

  /** @override */
  _onDragStart(event) { this._controller.onEffectDragStart(event); }

  /** @override */
  _canDragStart(_selector) { return this._controller.canDragStart(); }

  /**
   * Listeners for buttons in the menu
   */
  _initClickListeners() {
    this._createEffectButton.on("click", this._controller.onCreateCoverEffect.bind(this._controller));
    this._listCoverTypesButton.on("click", this._controller.onListCoverTypes.bind(this._controller));
  }

  /**
   * Menu items when right-clicking on an active effect.
   */
  _initContextMenus() {
    new ContextMenu(this._rootView, ".tokencover-effect", [
      {
        name: "Edit Cover Effect",
        icon: '<i class="fas fa-edit fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onEditCoverEffect.bind(this._controller)
      },

      {
        name: "Duplicate",
        icon: '<i class="far fa-copy fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onDuplicateCoverEffect.bind(this._controller)
      },

      {
        name: "Import Cover Effect",
        icon: '<i class="far fa-file-arrow-up"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onImportCoverEffect.bind(this._controller)
      },

      {
        name: "Export Cover Effect",
        icon: '<i class="far fa-file-arrow-down"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onExportCoverEffect.bind(this._controller)
      },

      {
        name: "Delete Cover Effect",
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onDeleteCoverEffect.bind(this._controller)
      }
    ]);
  }

  /**
   * The button used to create a new active effect.
   */
  get _createEffectButton() { return this._rootView.find(".create-effect"); }

  /**
   * The button used to display a listing of all cover types.
   */
  get _listCoverTypesButton() { return this._rootView.find(".list-cover-types"); }
}
