/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const SYSTEM_ID = "sfrpg";
const coverEffects = {};
export const defaultCoverEffects = new Map();

// A low obstacle (wall half your height) provides cover w/in 30'
// Is not really a distinct cover type, so handle in TypeFromPercentFn.

// Each effect lists an id by which to find the effect using the flag COVER_EFFECT.ID
// Each effect is associated with 0+ cover types, used to trigger the effect.

// Creatures between you and the source of the attack
coverEffects.soft = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Soft",
  id: `${MODULE_ID}.${SYSTEM_ID}.soft`,
  compendiumId: "aolmL82yGMgAlEcf",

  documentData: {
    icon: ICONS.SHIELD_THICK_GRAY.SPLAT,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.01,
        [FLAGS.COVER_EFFECT.PRIORITY]: 0,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: true
      }
    }
  }
};

// More than half visible
// Cover is ≥ 25%. But partial is less than 50%. So anything ≥ 50% would be cover.
coverEffects.partial = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Partial",
  id: `${MODULE_ID}.${SYSTEM_ID}.partial`,
  compendiumId: "WhC815WlllSW8tT0",

  documentData: {
    icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.25,
        [FLAGS.COVER_EFFECT.PRIORITY]: 1,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: true
      }
    }
  }
};

// Normal cover.
// Any corner of the viewer square --> any corner of token square is blocked. (dnd5e DMG rule)
coverEffects.cover = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Cover",
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  compendiumId: "bjq4ho7JXhgUDvG6",

  documentData: {
    icon: ICONS.SHIELD_THIN_GRAY.HALF,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.5,
        [FLAGS.COVER_EFFECT.PRIORITY]: 2,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: true
      }
    }
  }
};

// Certain cases such as target hiding behind defensive wall, bonuses doubled.
coverEffects.improved = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Improved",
  id: `${MODULE_ID}.${SYSTEM_ID}.improved`,
  compendiumId: "kaIYAWHJ7up8rwOy",

  documentData: {
    icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.9,
        [FLAGS.COVER_EFFECT.PRIORITY]: 3,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: true
      }
    }
  }
};

// No line of sight
coverEffects.total = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Total",
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  compendiumId: "o0CFBHsprfadKuyd",

  documentData: {
    icon: ICONS.SHIELD_THIN_GRAY.FULL,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 1,
        [FLAGS.COVER_EFFECT.PRIORITY]: 4,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: true
      }
    }
  }
};

Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));


/*
const documentIndex = game.packs.get("my-pack").index.getName("My Rolltable Name");
const doc = await game.packs.get("my-pack").getDocument(documentIndex._id);


softCover = game.items.get("aolmL82yGMgAlEcf")
await softCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID, `${MODULE_ID}.${SYSTEM_ID}.soft`)

partialCover = game.items.get("WhC815WlllSW8tT0")
await partialCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID, `${MODULE_ID}.${SYSTEM_ID}.partial`)

cover = game.items.get("bjq4ho7JXhgUDvG6")
await cover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID, `${MODULE_ID}.${SYSTEM_ID}.half`)

improvedCover = game.items.get("kaIYAWHJ7up8rwOy")
await improvedCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID, `${MODULE_ID}.${SYSTEM_ID}.improved`)

totalCover = game.items.get("o0CFBHsprfadKuyd")
await totalCover.setFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID, `${MODULE_ID}.${SYSTEM_ID}.total`)

To update the compendium, select the folder of cover items, right click, export to compendium.
Compendium must be unlocked.

*/


