/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS, FLAGS } from "../const.js";

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
    icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.25,
        [FLAGS.COVER_EFFECT.PRIORITY]: 1,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: true
      }
    }
  }
};

coverEffects.standard = {
  name: "Standard",
  id: `${MODULE_ID}.${SYSTEM_ID}.standard`,
  compendiumId: "AhFNqnvBZ9K46LUK",

  document: {
    icon: ICONS.SHIELD_THIN_GRAY.HALF,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 0.5,
        [FLAGS.COVER_EFFECT.PRIORITY]: 2,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
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
    icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
    flags: {
      [MODULE_ID]: {
        [FLAGS.COVER_EFFECT.PERCENT_THRESHOLD]: 1,
        [FLAGS.COVER_EFFECT.PRIORITY]: 0,
        [FLAGS.COVER_EFFECT.CAN_OVERLAP]: false,
        [FLAGS.COVER_EFFECT.INCLUDE_WALLS]: true,
        [FLAGS.COVER_EFFECT.INCLUDE_TOKENS]: false
      }
    }
  }
};

Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));
