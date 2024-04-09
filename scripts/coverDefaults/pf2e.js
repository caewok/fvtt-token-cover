/* globals
*/
"use strict";

import { coverTypesForToken as genericCoverTypesForToken } from "../cover_types.js";

/**
 * Determine what cover types apply to a target token given an attacking token.
 * @param {Token} attackingToken
 * @param {Token} targetToken
 * @returns {coverType[]}
 */
export function coverTypesForToken(attackingToken, targetToken) {
  const types = genericCoverTypesForToken(percentCover);

  // If interveningToken is 2+ sizes larger than coverToken, keep standard cover.
  const lesserIdx = types.indexOf(coverTypes.lesser);
  if ( ~lesserIdx ) {
    const tokens = calc.blockingTokens; // TODO: method to return all blocking tokens for calc.
    // if ( tokens.some(t => t.size > targetToken.size + 1)) types[lesserIdx] = coverTypes.standard;
  }

  return types;
}

// Cover is typically measured as center --> center.
// Which means only standard cover would apply.
// Lesser is substituted in when tokens are present.
// Greater is ignored, as it is currently set equal to total.
// But to allow greater flexibility, list all 4 types in the order.
export const coverTypes = {};
coverTypes.lesser = {
  name: "Lesser",
  percentThreshold: 0.25,
  icon: "modules/tokencover/assets/shield_low_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: false,
  includeTokens: true,
  activeEffectData: null
};

coverTypes.standard = {
  name: "Standard",
  percentThreshold: 0.5,
  icon: "modules/tokencover/assets/shield_medium_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  activeEffectData: null
};

coverTypes.greater = {
  name: "Greater",
  percentThreshold: 1,
  icon: "modules/tokencover/assets/shield_high_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  activeEffectData: null
};

coverTypes.total = {
  name: "Total",
  percentThreshold: 1,
  icon: "modules/tokencover/assets/shield_high_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  activeEffectData: null
};
