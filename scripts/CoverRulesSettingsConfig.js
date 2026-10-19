/* globals
foundry,
fromUuid,
game,
ui
*/
"use strict";

import { MODULE_ID } from "./const.js";
import { Settings, DEFAULT_PRESET_RULES } from "./settings.js";
import { getBackend, EFFECT_BACKENDS } from "./effect_backends.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { DragDrop, TextEditor, FormDataExtended } = foundry.applications.ux;

/**
 * Settings submenu: drop ActiveEffects/Items here, set a percent-cover threshold for each.
 * Edits a working copy; nothing is saved until Save is pressed.
 */
export class CoverRulesConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-cover-rules`,
    tag: "form",
    window: { title: "Cover Effects", icon: "fa-solid fa-shield-halved", resizable: true },
    position: { width: 560, height: "auto" },
    form: { handler: CoverRulesConfig.#onSubmit, closeOnSubmit: true },
    actions: {
      removeRule: CoverRulesConfig.#onRemoveRule,
      resetPresets: CoverRulesConfig.#onResetPresets
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/cover-rules.hbs` }
  };

  /** @type {object[]} Working copy of every stored rule (presets and dropped ones alike). */
  #rules = foundry.utils.deepClone(Settings.get(Settings.KEYS.COVER_RULES_SETTING) ?? []);

  #dragDrop = new DragDrop.implementation({
    dropSelector: ".cover-rules-drop",
    callbacks: { drop: this.#onDrop.bind(this) }
  });

  /** True when cover comes from the system's built-in statuses, so there's nothing to drag. */
  get #usesPresets() { return getBackend("cover") === EFFECT_BACKENDS.dnd5eStatus; }

  // ----- NOTE: Rendering ----- //

  async _prepareContext(_options) {
    const usesPresets = this.#usesPresets;
    // Rows are filtered by mode but keep their index into the full working copy, so hidden rows
    // (e.g. dropped effects while presets are active) survive a save untouched.
    const rows = this.#rules
      .map((rule, index) => ({ ...rule, index }))
      .filter(r => usesPresets ? Boolean(r.statusId) : Boolean(r.uuid));
    return { rows, usesPresets, canDrop: !usesPresets };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#dragDrop.bind(this.element);
  }

  // ----- NOTE: Drag and drop ----- //

  async #onDrop(event) {
    if ( this.#usesPresets ) return;
    const data = TextEditor.implementation.getDragEventData(event);
    if ( !["ActiveEffect", "Item"].includes(data.type) || !data.uuid ) {
      return ui.notifications.warn("Drop an Active Effect or an Item.");
    }
    if ( this.#rules.some(r => r.uuid === data.uuid) ) {
      return ui.notifications.warn("That effect is already in the list.");
    }

    let doc;
    try { doc = await fromUuid(data.uuid); } catch( _err ) { doc = null; }
    if ( !doc ) return ui.notifications.error("Could not resolve the dropped document.");

    this.#syncFromForm(); // keep unsaved edits to other rows
    this.#rules.push({
      uuid: doc.uuid,
      statusId: null,
      documentType: doc.documentName,
      name: doc.name,
      img: doc.img,
      minPercent: 50,
      displayIcon: true
    });
    this.render();
  }

  // ----- NOTE: Form handling ----- //

  /** Copy the current inputs into the working copy before any re-render. */
  #syncFromForm() {
    const form = new FormDataExtended(this.element).object;
    const expanded = foundry.utils.expandObject(form);
    for ( const [i, vals] of Object.entries(expanded.rules ?? {}) ) {
      const rule = this.#rules[Number(i)];
      if ( !rule ) continue;
      rule.minPercent = Number(vals.minPercent);
      rule.displayIcon = Boolean(vals.displayIcon);
    }
  }

  static async #onSubmit(_event, _form, _formData) {
    this.#syncFromForm();
    // Display order doesn't matter at runtime (lookup is by threshold), but keep storage tidy.
    const rules = this.#rules.toSorted((a, b) => a.minPercent - b.minPercent);
    await Settings.set(Settings.KEYS.COVER_RULES_SETTING, rules);
  }

  static #onRemoveRule(_event, target) {
    this.#syncFromForm();
    this.#rules.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onResetPresets() {
    this.#rules = this.#rules.filter(r => !r.statusId).concat(foundry.utils.deepClone(DEFAULT_PRESET_RULES));
    this.render();
  }
}