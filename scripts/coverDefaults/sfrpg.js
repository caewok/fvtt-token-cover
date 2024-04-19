/* globals
*/
"use strict";

import { MODULE_ID, ICONS } from "../const.js";

const SYSTEM_ID = "sfrpg";

/**
 * Determine what cover types apply to a target token given an attacking token.
 * @param {Token} attackingToken
 * @param {Token} targetToken
 * @returns {coverType[]}
 */
// export function coverTypesForToken(attackingToken, targetToken) {
//   const types = genericCoverTypesForToken(attackingToken, targetToken);
//
//   // Test for walls within 30' for low obstacles
//   if ( !types.some(t => t === coverTypes.cover || t === coverTypes.improved || t === coverTypes.total ) ) {
//
//
//   }
//
//   const a = attackingToken.center
//   const c = coverToken.center;
//   for ( const interveningToken of canvas.tokens.placeables ) {
//     if ( interveningToken === attackingToken || interveningToken === coverToken ) continue;
//     if ( interveningToken.constrainedTokenBorder.lineSegmentIntersects(a, c) ) return [type, soft];
//   }
//   return type;
// }

// https://www.aonsrd.com/Rules.aspx?ID=129

export const coverTypes = {};
export const coverEffects = {};

// A low obstacle (wall half your height) provides cover w/in 30'
// Is not really a distinct cover type, so handle in TypeFromPercentFn.

// Creatures between you and the source of the attack
coverTypes.soft = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Soft",
  id: `${MODULE_ID}.${SYSTEM_ID}.soft`,
  percentThreshold: .01,
  icon: ICONS.SHIELD_THICK_GRAY.SPLAT,
  tint: null,
  canOverlap: true,
  includeWalls: false,
  includeTokens: true,
  priority: null
};

// More than half visible
// Cover is ≥ 25%. But partial is less than 50%. So anything ≥ 50% would be cover.
coverTypes.partial = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Partial",
  id: `${MODULE_ID}.${SYSTEM_ID}.partial`,
  percentThreshold: 0.25,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 1
};

// Normal cover.
// Any corner of the viewer square --> any corner of token square is blocked. (dnd5e DMG rule)
coverTypes.cover = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Cover",
  id: `${MODULE_ID}.${SYSTEM_ID}.cover`,
  percentThreshold: 0.5,
  icon: ICONS.SHIELD_THIN_GRAY.HALF,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 2
};

// Certain cases such as target hiding behind defensive wall, bonuses doubled.
coverTypes.improved = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Improved",
  id: `${MODULE_ID}.${SYSTEM_ID}.improved`,
  percentThreshold: 0.9,
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 3
};

// No line of sight
coverTypes.total = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Total",
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  percentThreshold: 1,
  icon: ICONS.SHIELD_THIN_GRAY.FULL,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  priority: 4
};

coverEffects.soft = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Soft",
  id: `${MODULE_ID}.${SYSTEM_ID}.soft`,
  img: ICONS.SHIELD_THICK_GRAY.SPLAT,
  coverTypes: [
    coverTypes.soft.id
  ],
  type: "effect",
  system: {
    enabled: true,
    requirements: "Condition",
    showOnToken: true,
    source: "CRB.276",
    type: "condition",
    modifiers: [
      {
        effectType: "ranged-attacks",
        enabled: true,
        max: -4,
        modifier: "-4",
        modifierType: "constant",
        name: "SFRPG.Vehicles.VehicleCoverTypes.Soft",
        source: "Condition",
        subtab: "misc",
        type: "armor",
        valueAffected: ""
      }
    ]
  }
};

coverEffects.partial = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Partial",
  id: `${MODULE_ID}.${SYSTEM_ID}.partial`,
  img: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  coverTypes: [
    coverTypes.partial.id
  ],
  type: "effect",
  system: {
    enabled: true,
    requirements: "Condition",
    showOnToken: true,
    source: "CRB.276",
    type: "condition",
    modifiers: [
      {
        effectType: "ranged-attacks",
        enabled: true,
        max: -2,
        modifier: "-2",
        modifierType: "constant",
        name: "SFRPG.Vehicles.VehicleCoverTypes.Partial",
        source: "Condition",
        subtab: "misc",
        type: "armor",
        valueAffected: ""
      },

      {
        effectType: "save",
        enabled: true,
        max: 1,
        modifier: "+1",
        modifierType: "constant",
        name: "Partial Cover Reflex",
        source: "",
        subtab: "misc",
        type: "armor",
        valueAffected: "reflex"
      }
    ]
  }
};

coverEffects.cover = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Cover",
  id: `${MODULE_ID}.${SYSTEM_ID}.half`,
  img: ICONS.SHIELD_THIN_GRAY.HALF,
  coverTypes: [
    coverTypes.cover.id
  ],
  type: "effect",
  system: {
    enabled: true,
    requirements: "Condition",
    showOnToken: true,
    source: "CRB.276",
    type: "condition",
    modifiers: [
      {
        effectType: "ranged-attacks",
        enabled: true,
        max: -4,
        modifier: "-4",
        modifierType: "constant",
        name: "SFRPG.Vehicles.VehicleCoverTypes.Cover",
        source: "Condition",
        subtab: "misc",
        type: "armor",
        valueAffected: ""
      },

      {
        effectType: "save",
        enabled: true,
        max: 2,
        modifier: "+2",
        modifierType: "constant",
        name: "Cover Reflex",
        source: "",
        subtab: "misc",
        type: "armor",
        valueAffected: "reflex"
      }
    ]
  }
};

coverEffects.improved = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Improved",
  id: `${MODULE_ID}.${SYSTEM_ID}.improved`,
  img: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  coverTypes: [
    coverTypes.improved.id
  ],
  type: "effect",
  system: {
    enabled: true,
    requirements: "Condition",
    showOnToken: true,
    source: "CRB.276",
    type: "condition",
    modifiers: [
      {
        effectType: "ranged-attacks",
        enabled: true,
        max: -8,
        modifier: "-8",
        modifierType: "constant",
        name: "SFRPG.Vehicles.VehicleCoverTypes.Improved",
        source: "Condition",
        subtab: "misc",
        type: "armor",
        valueAffected: ""
      },

      {
        effectType: "save",
        enabled: true,
        max: 4,
        modifier: "+4",
        modifierType: "constant",
        name: "Improved Cover Reflex",
        source: "condition",
        subtab: "misc",
        type: "armor",
        valueAffected: "reflex"
      }
    ]
  }
};

coverEffects.total = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Total",
  id: `${MODULE_ID}.${SYSTEM_ID}.total`,
  img: ICONS.SHIELD_THIN_GRAY.FULL,
  coverTypes: [
    coverTypes.total.id
  ],
  type: "effect",
  system: {
    enabled: true,
    requirements: "Condition",
    showOnToken: true,
    source: "CRB.276",
    type: "condition",
    modifiers: [
      {
        effectType: "all-attacks",
        enabled: true,
        max: -99,
        modifier: "-99",
        modifierType: "constant",
        name: "SFRPG.Vehicles.VehicleCoverTypes.Total",
        source: "Condition",
        subtab: "misc",
        type: "armor",
        valueAffected: ""
      },

      {
        effectType: "save",
        enabled: true,
        max: 99,
        modifier: "+99",
        modifierType: "constant",
        name: "Total Cover Reflex",
        source: "",
        subtab: "misc",
        type: "armor",
        valueAffected: "reflex"
      }
    ]
  }
};


data = {
  name: "My New Item",
  type: "effect",
  img: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  system: {
    enabled: true,
    showOnToken: true,
    type: "condition",
    requirements: "Condition",
    modifiers: [
      {
        effectType: "ranged-attacks",
        enabled: true,
        max: -2,
        modifier: "-2",
        modifierType: "constant",
        name: "SFRPG.Vehicles.VehicleCoverTypes.Partial",
        source: "Condition",
        subtab: "misc",
        type: "armor",
        valueAffected: ""
      },

      {
        effectType: "save",
        enabled: true,
        max: 1,
        modifier: "+1",
        modifierType: "constant",
        name: "Partial Cover Reflex",
        source: "",
        subtab: "misc",
        type: "armor",
        valueAffected: "reflex"
      }
    ]
  }
};

doc = (await CONFIG.Item.documentClass.create([{...data}]))[0]
