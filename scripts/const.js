/* globals
duplicate
*/
"use strict";

export const MODULE_ID = "tokenvisibility";
export const EPSILON = 1e-08;

export const FLAGS = {
  DRAWING: { IS_HOLE: "is-hole" }
};

export const COVER_TYPES = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  TOTAL: 4
};

// Default status effects for different systems.
export const STATUS_EFFECTS = {
  generic: {
    LOW: {
      id: `${MODULE_ID}.cover.LOW`,
      label: "Low",
      icon: `modules/${MODULE_ID}/assets/shield_low_gray.svg`
    },

    MEDIUM: {
      id: `${MODULE_ID}.cover.MEDIUM`,
      label: "Medium",
      icon: `modules/${MODULE_ID}/assets/shield_medium_gray.svg`
    },

    HIGH: {
      id: `${MODULE_ID}.cover.HIGH`,
      label: "High",
      icon: `modules/${MODULE_ID}/assets/shield_high_gray.svg`
    }
  }
};

STATUS_EFFECTS.dnd5e = duplicate(STATUS_EFFECTS.generic);
STATUS_EFFECTS.dnd5e.LOW.label = "Half";
STATUS_EFFECTS.dnd5e.MEDIUM.label = "Three-quarters";
STATUS_EFFECTS.dnd5e.HIGH.label = "Total";

STATUS_EFFECTS.dnd5e.LOW.changes = [
  {
    key: "system.attributes.ac.bonus",
    mode: 2,
    value: "+2"
  },

  {
    key: "system.attributes.dex.saveBonus",
    mode: 2,
    value: "+2"
  }
];


STATUS_EFFECTS.dnd5e.MEDIUM.changes = [
  {
    key: "system.attributes.ac.bonus",
    mode: 2,
    value: "+5"
  },

  {
    key: "system.attributes.dex.saveBonus",
    mode: 2,
    value: "+5"
  }
];

STATUS_EFFECTS.pf2e = duplicate(STATUS_EFFECTS.generic);
STATUS_EFFECTS.pf2e.LOW.label = "Lesser";
STATUS_EFFECTS.pf2e.MEDIUM.label = "Standard";
STATUS_EFFECTS.pf2e.HIGH.label = "Greater";
