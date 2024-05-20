/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const SYSTEM_ID = "generic";
const coverEffects = {};
export const defaultCoverEffects = new Map();

// ----- NOTE: Cover effects ----- //

coverEffects.low = {
  name: `${MODULE_ID}.cover.low`,
  id: `${MODULE_ID}.${SYSTEM_ID}.low`,

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.5,
        [FLAGS.COVER_EFFECT.PRIORITY]: 1,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
      }
    }
  }
};

coverEffects.medium = {
  name:  `${MODULE_ID}.cover.medium`,
  id: `${MODULE_ID}.${SYSTEM_ID}.medium`,

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.75,
        [FLAGS.COVER_EFFECT.PRIORITY]: 2,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
      }
    }
  }
};

coverEffects.high = {
  name: `${MODULE_ID}.cover.high`,
  id: `${MODULE_ID}.${SYSTEM_ID}.high`,

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.FULL,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 1,
        [FLAGS.COVER_EFFECT.PRIORITY]: 3,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
      }
    }
  }
};

Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));
