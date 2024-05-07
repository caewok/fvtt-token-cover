/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const SYSTEM_ID = "dnd5e"

// https://5thsrd.org/combat/cover/
// If a target is behind multiple sources of cover, only the most protective degree of cover applies;
// the degrees aren't added together.


// ----- NOTE: Cover types ----- //
const coverTypes = {};
const coverEffects = {};
export const defaultCoverTypes = new Map();
export const defaultCoverEffects = new Map();

// Optional rule that tokens provide at most half-cover.
coverTypes.halfToken = {
  name: "Tokens Max Half",
  id: `${MODULE_ID}.${SYSTEM_ID}.half_token_only`,
  percentThreshold: 0.5,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  tint: null,
  canOverlap: false,
  priority: 0,
  includeWalls: false,
  includeTokens: true
};

// A target has half cover if an obstacle blocks at least half of its body.
coverTypes.half = {
  name: "DND5E.CoverHalf",
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  percentThreshold: 0.5,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 1
};

// A target has three-quarters cover if about three-quarters of it is covered by an obstacle.
coverTypes.threeQuarters = {
  name: "DND5E.CoverThreeQuarters",
  id: `${MODULE_ID}.${SYSTEM_ID}.three_quarters`,
  percentThreshold: 0.75,
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  tint: null,
  canOverlap: false,
  priority: 2,
  includeWalls: true,
  includeTokens: false
};

// A target has total cover if it is completely concealed by an obstacle.
coverTypes.total = {
  name: "DND5E.CoverTotal",
  id: `${MODULE_ID}.${SYSTEM_ID}.full`,
  percentThreshold: 1,
  icon: ICONS.SHIELD_THIN_GRAY.FULL,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 3
};

// ----- NOTE: Cover effects ----- //

// documentData property is what the active effect or item uses.
// Everything else is for the cover object class only, which should have name, id, and icon for display.
//
coverEffects.half = {
  name: "DND5E.CoverHalf",
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  dFredsName: "Cover (Half)",
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  documentData: {
    name: "DND5E.CoverHalf",
    icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.half`,
        [FLAGS.COVER_TYPES]: [coverTypes.half.id, coverTypes.halfToken.id]
      }
    },
    changes: [
      {
        key: "system.attributes.ac.cover",
        mode: 2,
        value: "+2"
      },

      {
        key: "system.abilities.dex.bonuses.save",
        mode: 2,
        value: "+2"
      }
    ]
  }
};

coverEffects.threeQuarters = {
  name: "DND5E.CoverThreeQuarters",
  id: `${MODULE_ID}.${SYSTEM_ID}.three_quarters`,
  dFredsName: "Cover (Three-Quarters)",
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  documentData: {
    name: "DND5E.CoverThreeQuarters",
    icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.three_quarters`,
        [FLAGS.COVER_TYPES]: [coverTypes.threeQuarters.id]
      }
    },
    changes: [
      {
        key: "system.attributes.ac.cover",
        mode: 2,
        value: "+5"
      },

      {
        key: "system.abilities.dex.bonuses.save",
        mode: 2,
        value: "+5"
      }
    ]
  }
};

coverEffects.total = {
  name: "DND5E.CoverTotal",
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  dFredsName: "Cover (Total)",
  icon: ICONS.SHIELD_THIN_GRAY.FULL,
  documentData: {
    name: "DND5E.CoverTotal",
    icon: ICONS.SHIELD_THIN_GRAY.FULL,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT_ID]: `${MODULE_ID}.${SYSTEM_ID}.total`,
        [FLAGS.COVER_TYPES]: [coverTypes.total.id]
      }
    },
    changes: [
      {
        key: "system.attributes.ac.cover",
        mode: 2,
        value: "+99"
      },

      {
        key: "system.abilities.dex.bonuses.save",
        mode: 2,
        value: "+99"
      },

      {
        key: "flags.midi-qol.grants.attack.fail.all",
        mode: 0,
        value: "1"
      }
    ]
  }
};

Object.values(coverTypes).forEach(obj => defaultCoverTypes.set(obj.id, obj));
Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));
