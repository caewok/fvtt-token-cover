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
  const types = genericCoverTypesForToken(attackingToken, targetToken);

  // Test for walls within 30' for low obstacles
  if ( !types.some(t => t === coverTypes.cover || t === coverTypes.improved || t === coverTypes.total ) ) {


  }

  const a = attackingToken.center
  const c = coverToken.center;
  for ( const interveningToken of canvas.tokens.placeables ) {
    if ( interveningToken === attackingToken || interveningToken === coverToken ) continue;
    if ( interveningToken.constrainedTokenBorder.lineSegmentIntersects(a, c) ) return [type, soft];
  }
  return type;
}

// https://www.aonsrd.com/Rules.aspx?ID=129

export const coverTypes = {};

// A low obstacle (wall half your height) provides cover w/in 30'
// Is not really a distinct cover type, so handle in TypeFromPercentFn.

// Creatures between you and the source of the attack
coverTypes.soft = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Soft",
  percentThreshold: .01,
  icon: "modules/tokencover/assets/shield_low_gray.svg",
  tint: null,
  canOverlap: true,
  activeEffectData: null,
  includeWalls: false,
  includeTokens: true,
  priority: null
};

// More than half visible
// Cover is ≥ 25%. But partial is less than 50%. So anything ≥ 50% would be cover.
coverTypes.partial = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Partial",
  percentThreshold: 0.25,
  icon: "modules/tokencover/assets/shield_low_gray.svg",
  tint: null,
  canOverlap: false,
  activeEffectData: null,
  includeWalls: true,
  includeTokens: true,
  priority: 1
};

// Normal cover.
// Any corner of the viewer square --> any corner of token square is blocked. (dnd5e DMG rule)
coverTypes.cover = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Cover",
  percentThreshold: 0.5,
  icon: "modules/tokencover/assets/shield_medium_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  activeEffectData: null,
  priority: 2
};

// Certain cases such as target hiding behind defensive wall, bonuses doubled.
coverTypes.improved = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Improved",
  percentThreshold: 0.9,
  icon: "modules/tokencover/assets/shield_high_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  activeEffectData: null,
  priority: 3
};

// No line of sight
coverTypes.total = {
  name: "SFRPG.Vehicles.VehicleCoverTypes.Total",
  percentThreshold: 1,
  icon: "modules/tokencover/assets/shield_high_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: true,
  activeEffectData: null,
  priority: 4
};
