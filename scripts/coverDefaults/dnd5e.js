/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const SYSTEM_ID = "dnd5e"

// https://5thsrd.org/combat/cover/
// If a target is behind multiple sources of cover, only the most protective degree of cover applies;
// the degrees aren't added together.
const coverEffects = {};
export const defaultCoverEffects = new Map();

const RULES = FLAGS.COVER_EFFECT.RULES;

// ----- NOTE: Cover effects ----- //

// document property is what the active effect or item uses.
// Everything else is for the cover object class only, which should have name, id, and icon for display.

// Optional rule that tokens provide at most half-cover.
coverEffects.halfToken = {
  name: `${MODULE_ID}.cover.HalfToken`,
  id: `${MODULE_ID}.${SYSTEM_ID}.halfToken`,
  // No DFred's name b/c this cover is not defined.

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.5,
        [RULES.PRIORITY]: 0,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: false,
        [RULES.LIVE_TOKENS_BLOCK]: true,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: true
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

coverEffects.half = {
  name: "DND5E.CoverHalf",
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  dFredsName: "Cover (Half)",

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.HALF,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.5,
        [RULES.PRIORITY]: 1,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: false,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: false
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

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.75,
        [RULES.PRIORITY]: 2,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: false,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: false
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

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.FULL,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 1,
        [RULES.PRIORITY]: 3,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: false,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: false
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

Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));
