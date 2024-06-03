/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

const RULES = FLAGS.COVER_EFFECT.RULES;
const SYSTEM_ID = "pf2e";
const coverEffects = {};
export const defaultCoverEffects = new Map();

/* Cover items

To create, drag the Cover Effect to an actor sheet, then select each option in turn.
Copy the UUID of the created cover item on the actor sheet.
Get the uuid: coverItem = fromUuidSync("UUID")
Export the JSON: coverItem.exportToJSON()
Create a new effect item in the items tab.
Import the JSON into that item.
Now you can use it like a regular item and store it in a compendium.
*/

// Cover is typically measured as center --> center.
// Which means only standard cover would apply.
// Lesser is substituted in when tokens are present.
// Greater is ignored but handled by the Cover Effect.

coverEffects.lesser = {
  name: "Lesser",
  id: `${MODULE_ID}.${SYSTEM_ID}.lesser`,
  compendiumId: "3wuJNcYqrY1IEYm8",

  document: {
    img: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.25,
        [RULES.PRIORITY]: 1,
        [RULES.CAN_OVERLAP]: false,
        [RULES.INCLUDE_WALLS]: false,
        [RULES.LIVE_TOKENS_BLOCK]: true,
        [RULES.DEAD_TOKENS_BLOCK]: false,
        [RULES.PRONE_TOKENS_BLOCK]: true
      }
    }
  }
};

coverEffects.standard = {
  name: "Standard",
  id: `${MODULE_ID}.${SYSTEM_ID}.standard`,
  compendiumId: "AhFNqnvBZ9K46LUK",

  document: {
    img: ICONS.SHIELD_THIN_GRAY.HALF,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 0.5,
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

// Will not be automatically applied b/c it cannot overlap and standard would get applied instead.
coverEffects.greater = {
  name: "Greater",
  id: `${MODULE_ID}.${SYSTEM_ID}.greater`,
  compendiumId: "hPLXDSGyHzlupBS2",

  document: {
    img: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [RULES.PERCENT_THRESHOLD]: 1,
        [RULES.PRIORITY]: 0,
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
