/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const RULES = FLAGS.COVER_EFFECT.RULES;
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

  document: {
    img: ICONS.SHIELD_THICK_GRAY.SPLAT,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.01,
        [RULES.PRIORITY]: 0,
        [RULES.CAN_OVERLAP]: true,
        [RULES.INCLUDE_WALLS]: false,
        [RULES.LIVE_TOKENS_BLOCK]: true,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: true
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

  document: {
    img: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.25,
        [RULES.PRIORITY]: 1,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: true,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: true
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

  document: {
    img: ICONS.SHIELD_THIN_GRAY.HALF,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.5,
        [RULES.PRIORITY]: 2,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: true,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: true
      }
    }
  }
};

// Certain cases such as target hiding behind defensive wall, bonuses doubled.
coverEffects.improved = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Improved",
  id: `${MODULE_ID}.${SYSTEM_ID}.improved`,
  compendiumId: "kaIYAWHJ7up8rwOy",

  document: {
    img: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.9,
        [RULES.PRIORITY]: 3,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: true,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: true
      }
    }
  }
};

// No line of sight
coverEffects.total = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Total",
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  compendiumId: "o0CFBHsprfadKuyd",

  document: {
    img: ICONS.SHIELD_THIN_GRAY.FULL,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 1,
        [RULES.PRIORITY]: 4,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: true,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: true
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


