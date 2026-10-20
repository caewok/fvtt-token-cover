/* globals
CONFIG,
CONST,
foundry,
fromUuid,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "./const.js";
import { Settings, DEFAULT_PRESET_DEFINITIONS } from "./settings.js";

/*
A "backend" is the ONLY place that knows two things for a given game system:
  1. Where unique-effect *definitions* (templates: name, icon, changes, flags) are stored.
  2. What kind of Document gets manufactured on a token's actor when a definition is applied,
     how to build that document's data, and how to recognize an applied copy later.

Nothing outside this file branches on game.system.id or reads CONFIG.statusEffects directly.

A GM who wants a *persistent* manually-applied condition should drag the definition's document
onto the actor sheet the normal Foundry way; that's a distinct, infrequent, already-async-safe
operation this module does not need to reimplement.
*/

const SHOW_ICON = CONST.ACTIVE_EFFECT_SHOW_ICON;

/**
 * Resolve GM's dropped effects/items into definition descriptors.
 * Runs at load and when the setting changes.
 * @param {"ActiveEffect"|"Item"} documentType
 */
async function loadDocumentDefinitions(documentType) {
  const defs = [];
  for ( const def of Settings.coverDefinitions ) {
    if ( !def.uuid || def.documentType !== documentType ) continue;
    const doc = await fromUuid(def.uuid);
    if ( !doc ) continue; // Source deleted or compendium missing.
    defs.push({
      id: def.uuid,
      name: doc.name,
      img: doc.img,
      category: "cover",
      allowsDuplicates: false,
      displayIcon: def.displayIcon ?? true,
      minPercent: def.minPercent,
      document: doc,
    });
  }
  return defs;
}


/**
 * @typedef {object} EffectBackend
 *
 * Properties and functions required to define token effects for a system.
 */

// ----- NOTE: ActiveEffect-backed system (default) ----- //
// Definitions are arbitrary ActiveEffect documents—world or compendium—picked by the GM via
// settings (see UniqueEffectDefinition.addSource). We never author or store our own copy of
// them; v14 lets any document live wherever it likes and be reached with fromUuid, so a
// definition is nothing more than a UUID plus a little of our own display metadata.

const activeEffectBackend = {
  documentName: "ActiveEffect",

  /**
   * Load definition descriptors (id, name, img, category).
   * @returns {Promise<object[]>}
   */
  async loadDefinitions() { return loadDocumentDefinitions("ActiveEffect"); },

  /**
   * Where local copies live on a token's actor.
   * @returns {EmbeddedCollection|undefined}
   */
  tokenCollection(actor) { return actor?.effects; },

  /**
   * Identity of a local copy, if it's one of ours: the uuid of the source definition it
   * was cloned from, stashed int he core `origin` field.
   * @param {ActiveEffect} doc
   * @returns {string|undefined}
   */
  getAppliedId(doc) { return doc.origin ?? undefined; },

  /**
   * Build source data for a local (non-persisted) copy of a definition, for one token.
   * @param {UniqueEffectDefinition} definition
   * @param {Token} token
   * @param {object} [data] Extra data supplied by the caller (rare)
   * @returns {object} The merged data
   */
  buildTokenData(definition, token, data = {}) {
    const doc = definition.document.toObject();
    delete doc._id;
    doc.transfer = false;
    doc.origin = definition.id;  // = definition.document.uuid


    // Icon visibility is *separate* from statuses/duration as of v14's `showIcon.`
    // Previously this was forced by modifying statuses; this is no longer necessary.
    const hideIcon = !definition.displayIcon || token.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET;
    doc.showIcon = hideIcon ? SHOW_ICON.NEVER : SHOW_ICON.ALWAYS;

    foundry.utils.setProperty(doc, `flags.${MODULE_ID}.${FLAGS.UNIQUE_EFFECT.IS_LOCAL}`, true);
    return foundry.utils.mergeObject(doc, data, { inplace: true });
  },
};

// ----- NOTE: Item-backed systems (pf2e, sfrpg) ----- //
// These systems rely on real items and don't process bare core ActiveEffects.
// Definition and token copy must be real items.

const itemBackend = {
  documentName: "Item",

  async loadDefinitions() { return loadDocumentDefinitions("Item"); },

  tokenCollection(actor) { return actor?.items; },

  /** Items have no `origin` field, so identity is our own flag instead. */
  getAppliedId(doc) { return doc.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID) ?? undefined; },

  buildTokenData(definition, token, data = {}) {
    const doc = definition.document.toObject();
    delete doc._id;
    foundry.utils.setProperty(doc, `flags.${MODULE_ID}.${FLAGS.UNIQUE_EFFECT.ID}`, definition.id);
    foundry.utils.setProperty(doc, `flags.${MODULE_ID}.${FLAGS.UNIQUE_EFFECT.IS_LOCAL}`, true);

    // Icon display for item-based conditions/effects is governed by the system itself
    // (e.g. pf2e draws its own effect icons from actor.items)—nothing to set here.
    return foundry.utils.mergeObject(doc, data, { inplace: true });
  }
};

// ----- NOTE: dnd5e built-in status backend ----- //
// dnd5e ships CONFIG.statusEffects.coverHalf / coverThreeQuarters / coverTotal. Adding one of
// those ids to an actor's `statuses` is all dnd5e needs to apply the matching AC/Dex-save
// modifiers itself - there is nothing for this module to define, store, or configure. This
// builds the same shape core's `ActiveEffect.fromStatusEffect` would, just inline and
// synchronously instead of calling that (async) API, since this runs on the per-frame hot path

const DND5E_COVER_STATUS_IDS = new Set(["coverHalf", "coverThreeQuarters", "coverTotal"]);

const dnd5eStatusBackend = {

  documentName: "ActiveEffect",

  loadDefinitions() {
    const stored = new Map(Settings.coverDefinitions.filter(d => d.statusId).map(d => [d.statusId, d]));
    const defaults = new Map(DEFAULT_PRESET_DEFINITIONS.map(d => [d.statusId, d]));
    return [...DND5E_COVER_STATUS_IDS]
      .filter(id => CONFIG.statusEffects[id])
      .map(id => {
        const status = CONFIG.statusEffects[id];
        const def = stored.get(id) ?? defaults.get(id);
        return {
          id,
          name: game.i18n.localize(status.name ?? status.label ?? id),
          img: status.img ?? status.icon,
          category: "cover",
          displayIcon: def.displayIcon ?? true,
          minPercent: def.minPercent,
        };
      });
  },

  tokenCollection(actor) { return actor?.effects; },

  /** Identity is core: is one of our known status ids present? */
  getAppliedId(doc) { return doc.statuses?.find(id => DND5E_COVER_STATUS_IDS.has(id)); },

  buildTokenData(definition, token, data = {}) {
    const status = CONFIG.statusEffects[definition.id];
    const { id, hud: _hud, ...effectData } = foundry.utils.deepClone(status);
    effectData.name = game.i18n.localize(effectData.name ?? effectData.label ?? id);
    effectData.statuses = Array.from(new Set([id, ...(effectData.statuses ?? [])]));

    const hideIcon = !definition.displayIcon
      || token.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET;
    effectData.showIcon = hideIcon ? SHOW_ICON.NEVER : SHOW_ICON.ALWAYS;

    foundry.utils.setProperty(effectData, `flags.${MODULE_ID}.isLocal`, true);
    return foundry.utils.mergeObject(effectData, data, { inplace: true });
  },
};

// ----- NOTE: Exports ----- //

const ITEM_BACKEND_SYSTEMS = new Set(["pf2e", "sfrpg"]);

export const EFFECT_BACKENDS = {
  default: activeEffectBackend,
  item: itemBackend,
  dnd5eStatus: dnd5eStatusBackend,
};

/**
 * Which backend applies for a given category of effect.
 * Relies on current system/settings.
 * @param {string} [category="cover"]
 * @returns {object} The backend for the current game system
 */
export function getBackend(category = "cover") {
  const mode = Settings.get(Settings.KEYS.BACKEND_MODE) || "auto"; // "auto" |"activeEffect"

  if ( category === "cover" && game.system.id === "dnd5e" && mode !== "activeEffect" ) return EFFECT_BACKENDS.dnd5eStatus;
  if ( ITEM_BACKEND_SYSTEMS.has(game.system.id) ) return EFFECT_BACKENDS.item;
  return EFFECT_BACKENDS.default;
}
