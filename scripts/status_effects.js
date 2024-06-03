/* globals
foundry
*/
"use strict";

import { MODULE_ID } from "./const.js";

// Default status effects for different systems.
// {0: 'Custom', 1: 'Multiply', 2: 'Add', 3: 'Downgrade', 4: 'Upgrade', 5: 'Override'}
export const STATUS_EFFECTS = {
  generic: {
    LOW: {
      id: `${MODULE_ID}.cover.LOW`,
      icon: `modules/${MODULE_ID}/assets/shield_low_gray.svg`,
      name: `${MODULE_ID}.Cover.Low`
    },

    MEDIUM: {
      id: `${MODULE_ID}.cover.MEDIUM`,
      icon: `modules/${MODULE_ID}/assets/shield_medium_gray.svg`,
      name: `${MODULE_ID}.Cover.Medium`
    },

    HIGH: {
      id: `${MODULE_ID}.cover.HIGH`,
      icon: `modules/${MODULE_ID}/assets/shield_high_gray.svg`,
      name: `${MODULE_ID}.Cover.High`
    }
  }
};

STATUS_EFFECTS.dnd5e = foundry.utils.duplicate(STATUS_EFFECTS.generic);
STATUS_EFFECTS.dnd5e.LOW.name = "DND5E.CoverHalf";
STATUS_EFFECTS.dnd5e.MEDIUM.name = "DND5E.CoverThreeQuarters";
STATUS_EFFECTS.dnd5e.HIGH.name = "DND5E.CoverTotal";

STATUS_EFFECTS.dnd5e.LOW.changes = [
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
];


STATUS_EFFECTS.dnd5e.MEDIUM.changes = [
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
];

STATUS_EFFECTS.dnd5e.HIGH.changes = [
  {
    key: "system.attributes.ac.cover",
    mode: 2,
    value: "+99"
  },

  {
    key: "system.abilities.dex.bonuses.save",
    mode: 2,
    value: "+99"
  }
];

STATUS_EFFECTS.dnd5e_midiqol = foundry.utils.duplicate(STATUS_EFFECTS.dnd5e);
STATUS_EFFECTS.dnd5e_midiqol.HIGH.changes = [
  {
    key: "flags.midi-qol.grants.attack.fail.all",
    mode: 0,
    value: "1"
  }
];


STATUS_EFFECTS.pf2e = foundry.utils.duplicate(STATUS_EFFECTS.generic);
STATUS_EFFECTS.pf2e.LOW.name = "PF2E.Cover.Lesser";
STATUS_EFFECTS.pf2e.MEDIUM.name = "PF2E.Cover.Standard";
STATUS_EFFECTS.pf2e.HIGH.name = "PF2E.Cover.Greater";
