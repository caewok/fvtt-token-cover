/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, ICONS } from "../const.js";


const SYSTEM_ID = "pf2e";

const coverTypes = {};
const coverEffects = {};
export const defaultCoverTypes = new Map();
export const defaultCoverEffects = new Map();


// Cover is typically measured as center --> center.
// Which means only standard cover would apply.
// Lesser is substituted in when tokens are present.
// Greater is ignored but handled by the Cover Effect.

coverTypes.lesser = {
  name: "Lesser",
  id: `${MODULE_ID}.${SYSTEM_ID}.lesser`,
  percentThreshold: 0.25,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  tint: null,
  canOverlap: false,
  priority: 1,
  includeWalls: false,
  includeTokens: true
};

coverTypes.standard = {
  name: "Standard",
  id: `${MODULE_ID}.${SYSTEM_ID}.standard`,
  percentThreshold: 0.5,
  icon: ICONS.SHIELD_THIN_GRAY.HALF,
  tint: null,
  priority: 2,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false
};

// Will not be automatically applied b/c it cannot overlap and standard would get applied instead.
coverTypes.greater = {
  name: "Greater",
  id: `${MODULE_ID}.${SYSTEM_ID}.greater`,
  percentThreshold: 1,
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  tint: null,
  priority: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false
};

/* Cover items

To create, drag the Cover Effect to an actor sheet, then select each option in turn.
Copy the UUID of the created cover item on the actor sheet.
Get the uuid: coverItem = fromUuidSync("UUID")
Export the JSON: coverItem.exportToJSON()
Create a new effect item in the items tab.
Import the JSON into that item.
Now you can use it like a regular item and store it in a compendium.
*/

coverEffects.lesser = {
  id: `${MODULE_ID}.${SYSTEM_ID}.lesser`,
  compendiumId: "3wuJNcYqrY1IEYm8",
};

coverEffects.standard = {
  id: `${MODULE_ID}.${SYSTEM_ID}.standard`,
  compendiumId: "AhFNqnvBZ9K46LUK",
};

coverEffects.greater = {
  id: `${MODULE_ID}.${SYSTEM_ID}.greater`,
  compendiumId: "hPLXDSGyHzlupBS2",
};

Object.values(coverTypes).forEach(obj => defaultCoverTypes.set(obj.id, obj));
Object.values(coverEffects).forEach(obj => defaultCoverEffects.set(obj.id, obj));
