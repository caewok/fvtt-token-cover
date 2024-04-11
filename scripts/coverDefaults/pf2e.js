/* globals
*/
"use strict";

import { MODULE_ID, ICONS } from "../const.js";

const SYSTEM_ID = "pf2e";

/**
 * Determine what cover types apply to a target token given an attacking token.
 * @param {Token} attackingToken
 * @param {Token} targetToken
 * @returns {coverType[]}
 */
// export function coverTypesForToken(attackingToken, targetToken) {
//   const types = genericCoverTypesForToken(percentCover);
//
//   // If interveningToken is 2+ sizes larger than coverToken, keep standard cover.
//   const lesserIdx = types.indexOf(coverTypes.lesser);
//   if ( ~lesserIdx ) {
//     const tokens = calc.blockingTokens; // TODO: method to return all blocking tokens for calc.
//     // if ( tokens.some(t => t.size > targetToken.size + 1)) types[lesserIdx] = coverTypes.standard;
//   }
//
//   return types;
// }

// Cover is typically measured as center --> center.
// Which means only standard cover would apply.
// Lesser is substituted in when tokens are present.
// Greater is ignored, as it is currently set equal to total.
// But to allow greater flexibility, list all 4 types in the order.
export const coverTypes = {};
coverTypes.lesser = {
  name: "Lesser",
  id: `${MODULE_ID}.${SYSTEM_ID}.low`,
  percentThreshold: 0.25,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  tint: null,
  canOverlap: false,
  includeWalls: false,
  includeTokens: true
};

coverTypes.standard = {
  name: "Standard",
  id: `${MODULE_ID}.${SYSTEM_ID}.low`,
  percentThreshold: 0.5,
  icon: ICONS.SHIELD_THIN_GRAY.HALF,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false
};

coverTypes.greater = {
  name: "Greater",
  id: `${MODULE_ID}.${SYSTEM_ID}.low`,
  percentThreshold: 1,
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false
};

coverTypes.total = {
  name: "Total",
  id: `${MODULE_ID}.${SYSTEM_ID}.low`,
  percentThreshold: 1,
  icon: ICONS.SHIELD_THIN_GRAY.FULL,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false
};
