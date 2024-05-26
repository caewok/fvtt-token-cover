/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const RULES = FLAGS.COVER_EFFECT.RULES;
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
        [RULES.PERCENT_THRESHOLD]: 0.5,
        [RULES.PRIORITY]: 1,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: false,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: false
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
        [RULES.PERCENT_THRESHOLD]: 0.75,
        [RULES.PRIORITY]: 2,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: false,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: false
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
        [RULES.PERCENT_THRESHOLD]: 1,
        [RULES.PRIORITY]: 3,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: true,
        [RULES.LIVE_TOKENS_BLOCK]: false,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: false
      }
    }
  }
};

Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));
