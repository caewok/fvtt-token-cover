/* globals
*/
"use strict";
import { MODULE_ID, ICONS } from "../const.js";

const SYSTEM_ID = "dnd5e"

// https://5thsrd.org/combat/cover/
// If a target is behind multiple sources of cover, only the most protective degree of cover applies;
// the degrees aren't added together.


// ----- NOTE: Cover types ----- //
export const coverTypes = {};

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
export const coverEffects = {};

// TODO: use system.attributes.ac.cover and modify the DND5e calculation somewhere?

coverEffects.half = {
  name: "DND5E.CoverHalf",
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  coverTypes: [
    coverTypes.half.id,
    coverTypes.halfToken.id
  ],
  changes: [
    {
      key: "system.attributes.ac.flat",
      mode: 2,
      value: "+2"
    },

    {
      key: "system.attributes.ac.armor",
      mode: 2,
      value: "+2"
    },

    {
      key: "system.abilities.dex.bonuses.save",
      mode: 2,
      value: "+2"
    }
  ]
};

coverEffects.threeQuarters = {
  name: "DND5E.CoverThreeQuarters",
  id: `${MODULE_ID}.${SYSTEM_ID}.three_quarters`,
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  coverTypes: [ coverTypes.threeQuarters.id ],
  changes: [
    {
      key: "system.attributes.ac.flat",
      mode: 2,
      value: "+5"
    },

    {
      key: "system.attributes.ac.armor",
      mode: 2,
      value: "+5"
    },

    {
      key: "system.abilities.dex.bonuses.save",
      mode: 2,
      value: "+5"
    }
  ]
};

coverEffects.total = {
  name: "DND5E.CoverTotal",
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  icon: ICONS.SHIELD_THIN_GRAY.FULL,
  coverTypes: [ coverTypes.total ],
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
    }
  ]
};

export const coverEffects_midiqol = duplicate(coverEffects);
coverEffects_midiqol.total.changes = [
  {
    key: "flags.midi-qol.grants.attack.fail.all",
    mode: 0,
    value: "1"
  }
];

