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
export function coverTypesForToken(attackingToken, targetToken, { actionType }) {
  const type = genericCoverTypesForToken(attackingToken, targetToken);
  if ( !attackingToken ) return type;

  // Test for ignored cover.

  // Need to handle action type.



  return type;
}

// https://5thsrd.org/combat/cover/
// If a target is behind multiple sources of cover, only the most protective degree of cover applies;
// the degrees aren't added together.
export const coverTypes = {};

// Optional rule that tokens provide at most half-cover.
coverTypes.halfToken = {
  name: "DND5E.CoverHalf",
  id: "DND5E.CoverHalfTokenOnly",
  percentThreshold: 0.5,
  icon: "modules/tokencover/assets/shield_low_gray.svg",
  tint: null,
  canOverlap: false,
  priority: 0,
  includeWalls: false,
  includeTokens: true,
  activeEffectData: null
};

// A target has half cover if an obstacle blocks at least half of its body.
coverTypes.half = {
  name: "DND5E.CoverHalf",
  id: "DND5E.CoverHalf",
  percentThreshold: 0.5,
  icon: "modules/tokencover/assets/shield_low_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 1,
  activeEffectData: null
};

// A target has three-quarters cover if about three-quarters of it is covered by an obstacle.
coverTypes.threeQuarters = {
  name: "DND5E.CoverThreeQuarters",
  id: "DND5E.CoverThreeQuarters",
  percentThreshold: 0.75,
  icon: "modules/tokencover/assets/shield_medium_gray.svg",
  tint: null,
  canOverlap: false,
  priority: 2,
  includeWalls: true,
  includeTokens: false,
  activeEffectData: null
};

// A target has total cover if it is completely concealed by an obstacle.
coverTypes.total = {
  name: "DND5E.CoverTotal",
  id: "DND5E.CoverTotal",
  percentThreshold: 1,
  icon: "modules/tokencover/assets/shield_high_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 3,
  activeEffectData: null
};


