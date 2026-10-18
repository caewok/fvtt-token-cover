/* globals
CONST,
foundry,
fromUuid,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS } from "../const.js";
import {
  createDocument,
  updateDocument,
  deleteDocument,
  createEmbeddedDocuments,
  updateEmbeddedDocuments,
  deleteEmbeddedDocuments } from "./documents.js";

/*
A "backend" is the ONLY place that knows two things for a given game system:
  1. Where unique-effect *definitions* (templates: name, icon, changes, flags) are stored.
  2. What kind of Document gets manufactured on a token's actor when a definition is applied,
     and how to build that document's data.

Nothing outside this file branches on game.system.id. Everything else (dedupe, exclusivity,
JSON import/export, drag data) is generic and lives in UniqueEffectDefinition / TokenEffects.

Definition storage is read/written rarely (a GM configuring cover/terrain types) and is fine
to be async / hit the database, exactly like any other Foundry document CRUD.

Token application (buildTokenData, and everything in TokenEffects.js) is called every time a
viewer token's cover is recalculated - i.e. potentially every animation frame while a token is
dragged. It is therefore ALWAYS local: it never calls createEmbeddedDocuments/updateDocument/
deleteDocument/etc. against a token's actor. A GM who wants a *persistent* manually-applied
condition should drag the definition's document onto the actor sheet the normal Foundry way;
that's a distinct, infrequent, already-async-safe operation this module doesn't need to wrap.
*/

const SHOW_ICON = CONST.ACTIVE_EFFECT_SHOW_ICON;

/**
 * @typedef {object} EffectBackend
 *
 * Properties and functions required to define token effects for a system.
 * @prop {string} documentName                                  Name of the defining Foundry document
 * @prop {Item|null} _storageItem                               Hidden item that houses all definitions
 * @prop {function} initializeStorage                           One-time setup of the hidden item
 * @prop {EmbeddedCollection|Map|undefined} storageCollection   Collection of effects
 * @prop {function} createDefinitionDocument                    Create effect document from data
 * @prop {function} updateDefinitionDocument                    Update a specific effect document from dat
 * @prop {function} deleteDefinitionDocument                    Delete effect document
 * @prop {function} tokenCollection                             Where local copies live on token's actor
 * @prop {function} buildTokenData                              Build source data for local (non-persisted) effect
 */

// ----- NOTE: ActiveEffect-backed system (default for dnd5e and most others) ----- //

const activeEffectBackend = {
  documentName: "ActiveEffect",

  /** @type {Item|null} Hidden world item storing effect definitions */
  _storageItem: null,

  /**
   * One-time setup. Find or create the hidden item that houses all definitions.
   */
  async initializeStorage() {
    const name = "Unique Active Effects";
    let item = game.items.find(i => i.name === name);
    if ( !item ) {
      const uuid = await createDocument("CONFIG.Item.documentClass", undefined,
        { name, img: "icons/svg/ruins.svg", type: "base" });
      item = uuid ? await fromUuid(uuid) : null;
    }
    this._storageItem = item;
  },

  /** @returns {EmbeddedCollection|undefined} */
  storageCollection() { return this._storageItem?.effects; },

  /**
   * Create an active effect for given data.
   * @param {object} data
   * @returns {ActiveEffect}
   */
  async createDefinitionDocument(data) {
    const res = await createEmbeddedDocuments(this._storageItem.uuid, "ActiveEffect", undefined, [data]);
    return fromUuid(res[0]);
  },

  /**
   * Update active effect definition.
   * @param {ActiveEffect} doc
   * @param {object} data
   */
  async updateDefinitionDocument(doc, data) {
    data = { ...data, _id: doc.id };
    await updateEmbeddedDocuments(this._storageItem.uuid, "ActiveEffect", [data]);
  },

  /**
   * Remove an active effect definition.
   * @param {ActiveEffect} doc
   */
  async deleteDefinitionDocument(doc) {
    await deleteEmbeddedDocuments(this._storageItem.uuid, "ActiveEffect", [doc.id]);
  },

  /**
   * Where local copies live on a token's actor.
   * @returns {EmbeddedCollection|undefined}
   */
  tokenCollection(actor) { return actor?.effects; },

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
    doc.origin = definition.document.uuid;

    // Identity tag: Lets TokenEffects or other modules recognize this as definition X regardless of icon shown.
    doc.statuses = Array.from(new Set([...(doc.statuses ??[]), definition.id]));

    // Icon visibility is *separate* from statuses/duration as of v14's `showIcon.`
    // Previously this was forced by modifying statuses; this is no longer necessary.
    const hideIcon = !definition.displayIcon || token.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET;
    doc.showIcon = hideIcon ? SHOW_ICON.NEVER : SHOW_ICON.ALWAYS;

    foundry.utils.setProperty(doc, `flags.${MODULE_ID}.${FLAGS.UNIQUE_EFFECT.ID}`, definition.id);
    foundry.utils.setProperty(doc, `flags.${MODULE_ID}.${FLAGS.UNIQUE_EFFECT.IS_LOCAL}`, true);
    return foundry.utils.mergeObject(doc, data, { inplace: true });
  },
};

// ----- NOTE: Item-backed systems (pf2e, sfrpg) ----- //
// These systems rely on real items and don't process bare core ActiveEffects.
// Definition and token copy must be real items.

const itemBackend = {
  documentName: "Item",

  async initializeStorage() { /* Definitions ARE world items; nothing to set up */ },

  /** @returns {Map<string, Item>} */
  storageCollection() {
    const map = new Map();
    for ( const item of game.items ) {
      if ( item.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID) ) map.set(item.id, item);
    }
    return map;
  },

  async createDefinitionDocument(data) {
    const uuid = await createDocument("CONFIG.Item.documentClass", undefined, data);
    return fromUuid(uuid);
  },

  async updateDefinitionDocument(doc, data) { await updateDocument(doc.uuid, data); },

  async deleteDefinitionDocument(doc) { await deleteDocument(doc.uuid); },

  tokenCollection(actor) { return actor?.items; },

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

// ----- NOTE: Exports ----- //

export const EFFECT_BACKENDS = {
  default: activeEffectBackend,
  pf2e: itemBackend,
  sfrpg: itemBackend,
};

/**
 * @returns {object} The backend for the current game system
 */
export function getBackend() { return EFFECT_BACKENDS[game.system.id] ?? EFFECT_BACKENDS.default; }
