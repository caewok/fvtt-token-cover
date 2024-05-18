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

// ----- NOTE: Cover effects ----- //

// documentData property is what the active effect or item uses.
// Everything else is for the cover object class only, which should have name, id, and icon for display.

// Optional rule that tokens provide at most half-cover.
coverEffects.halfToken = {
  name: `${MODULE_ID}.cover.HalfToken`,
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  dFredsName: "Cover (Half)",

  documentData: {
    name: "DND5E.CoverHalf",
    icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.5,
        [FLAGS.COVER_EFFECT.PRIORITY]: 0,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: true
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

  documentData: {
    name: "DND5E.CoverHalf",
    icon: ICONS.SHIELD_THIN_GRAY.HALF,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.5,
        [FLAGS.COVER_EFFECT.PRIORITY]: 1,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
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

  documentData: {
    icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.75,
        [FLAGS.COVER_EFFECT.PRIORITY]: 2,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
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

  documentData: {
    icon: ICONS.SHIELD_THIN_GRAY.FULL,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 1,
        [FLAGS.COVER_EFFECT.PRIORITY]: 3,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
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
