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
   * Re-render if the app is open.
   * Needed when terrain effects are updated in the effects app.
   * See https://github.com/DFreds/dfreds-convenient-effects/blob/c2d5e81eb1d28d4db3cb0889c22a775c765c24e3/scripts/foundry-helpers.js#L51
   */
  static rerender() {
    const openApps = Object.values(ui.windows);
    const app = openApps.find(app => app instanceof CoverEffectsApp);
    if ( app ) app.render(true);
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

  /** @override */
  _onDrop(event) { return this._controller.onEffectDrop(event); }

  /**
   * Listeners for buttons in the menu
   */
  _initClickListeners() {
    this._createEffectButton.on("click", this._controller.onCreateEffect.bind(this._controller));
    this._createDefaultsButton.on("click", this._controller.onCreateDefaults.bind(this._controller));
    this._coverEffectItem.on("click", this._controller.onEdit.bind(this._controller));
  }

  /**
   * Menu items when right-clicking on an active effect.
   */
  _initContextMenus() {
    new ContextMenu(this._rootView, ".tokencover-effect", [
      {
        name: "Edit Cover Rules",
        icon: '<i class="fas fa-edit fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onEdit.bind(this._controller)
      },

      {
        name: "Duplicate",
        icon: '<i class="far fa-copy fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onDuplicate.bind(this._controller)
      },

      {
        name: "Import Cover Effect",
        icon: '<i class="far fa-file-arrow-up"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onImport.bind(this._controller)
      },

      {
        name: "Export Cover Effect",
        icon: '<i class="far fa-file-arrow-down"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onExport.bind(this._controller)
      },

      {
        name: "Delete Cover Effect",
        icon: '<i class="fas fa-trash fa-fw"></i>',
        condition: () => game.user.isGM,
        callback: this._controller.onDelete.bind(this._controller)
      }
    ]);
  }

  /**
   * The button used to create a new active effect.
   */
  get _createEffectButton() { return this._rootView.find(".create-effect"); }

  /**
   * The button used to reset effects to default for the system.
   */
  get _createDefaultsButton() { return this._rootView.find(".create-defaults"); }

  /**
   * The listed active effect target.
   */
  get _coverEffectItem() { return this._rootView.find(".tokencover-effect"); }
}
