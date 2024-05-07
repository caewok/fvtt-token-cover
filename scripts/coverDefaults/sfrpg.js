/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const SYSTEM_ID = "sfrpg";
const coverTypes = {};
const coverEffects = {};
export const defaultCoverTypes = new Map();
export const defaultCoverEffects = new Map();

// A low obstacle (wall half your height) provides cover w/in 30'
// Is not really a distinct cover type, so handle in TypeFromPercentFn.

// Creatures between you and the source of the attack
coverTypes.soft = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Soft",
  id: `${MODULE_ID}.${SYSTEM_ID}.soft`,
  percentThreshold: .01,
  icon: ICONS.SHIELD_THICK_GRAY.SPLAT,
  tint: null,
  canOverlap: true,
  includeWalls: false,
  includeTokens: true,
  priority: null
};

// More than half visible
// Cover is ≥ 25%. But partial is less than 50%. So anything ≥ 50% would be cover.
coverTypes.partial = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Partial",
  id: `${MODULE_ID}.${SYSTEM_ID}.partial`,
  percentThreshold: 0.25,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 1
};

// Normal cover.
// Any corner of the viewer square --> any corner of token square is blocked. (dnd5e DMG rule)
coverTypes.cover = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Cover",
  id: `${MODULE_ID}.${SYSTEM_ID}.cover`,
  percentThreshold: 0.5,
  icon: ICONS.SHIELD_THIN_GRAY.HALF,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 2
};

// Certain cases such as target hiding behind defensive wall, bonuses doubled.
coverTypes.improved = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Improved",
  id: `${MODULE_ID}.${SYSTEM_ID}.improved`,
  percentThreshold: 0.9,
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 3
};

// No line of sight
coverTypes.total = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Total",
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  percentThreshold: 1,
  icon: ICONS.SHIELD_THIN_GRAY.FULL,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 4
};


// Each effect lists an id by which to find the effect using the flag COVER_EFFECT_ID
// Each effect is associated with 0+ cover types, used to trigger the effect.
coverEffects.soft = {
  id: `${MODULE_ID}.${SYSTEM_ID}.soft`,
  compendiumId: "aolmL82yGMgAlEcf",
  documentData: {
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.soft`,
        [FLAGS.COVER_TYPES]: [coverTypes.soft.id]
      }
    }
  }
};

coverEffects.partial = {
  id: `${MODULE_ID}.${SYSTEM_ID}.partial`,
  compendiumId: "WhC815WlllSW8tT0",
  documentData: {
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.partial`,
        [FLAGS.COVER_TYPES]: [coverTypes.partial.id]
      }
    }
  }
};

coverEffects.cover = {
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  compendiumId: "bjq4ho7JXhgUDvG6",
  documentData: {
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.cover`,
        [FLAGS.COVER_TYPES]: [coverTypes.cover.id]
      }
    }
  }
};

coverEffects.improved = {
  id: `${MODULE_ID}.${SYSTEM_ID}.improved`,
  compendiumId: "kaIYAWHJ7up8rwOy",
  documentData: {
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.improved`,
        [FLAGS.COVER_TYPES]: [coverTypes.improved.id]
      }
    }
  }
};

coverEffects.total = {
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  compendiumId: "o0CFBHsprfadKuyd",
  documentData: {
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.total`,
        [FLAGS.COVER_TYPES]: [coverTypes.total.id]
      }
    }
  }
};

Object.values(coverTypes).forEach(obj => defaultCoverTypes.set(obj.id, obj));
Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));


/*
const documentIndex = game.packs.get("my-pack").index.getName("My Rolltable Name");
const doc = await game.packs.get("my-pack").getDocument(documentIndex._id);


softCover = game.items.get("aolmL82yGMgAlEcf")
await softCover.setFlag(MODULE_ID, FLAGS.COVER_TYPES, [coverTypes.soft.id])
await softCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID, `${MODULE_ID}.${SYSTEM_ID}.soft`)

partialCover = game.items.get("WhC815WlllSW8tT0")
await partialCover.setFlag(MODULE_ID, FLAGS.COVER_TYPES, [coverTypes.partial.id])
await partialCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID, `${MODULE_ID}.${SYSTEM_ID}.partial`)

cover = game.items.get("bjq4ho7JXhgUDvG6")
await cover.setFlag(MODULE_ID, FLAGS.COVER_TYPES, [coverTypes.cover.id])
await cover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID, `${MODULE_ID}.${SYSTEM_ID}.half`)

improvedCover = game.items.get("kaIYAWHJ7up8rwOy")
await improvedCover.setFlag(MODULE_ID, FLAGS.COVER_TYPES, [coverTypes.improved.id])
await improvedCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID, `${MODULE_ID}.${SYSTEM_ID}.improved`)

totalCover = game.items.get("o0CFBHsprfadKuyd")
await totalCover.setFlag(MODULE_ID, FLAGS.COVER_TYPES, [coverTypes.total.id])
await totalCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT_ID, `${MODULE_ID}.${SYSTEM_ID}.total`)

To update the compendium, select the folder of cover items, right click, export to compendium.
Compendium must be unlocked.

*/


