/* globals
*/
"use strict";

import { coverTypes as dnd5eCoverTypes, coverTypesForToken as dnd5eCoverTypesForToken } from "./coverDefaults/dnd5e.js";
import { coverTypes as pf2eCoverTypes, coverTypesForToken as pf2eCoverTypesForToken } from "./coverDefaults/pf2e.js";
import { coverTypes as sfrpgCoverTypes, coverTypesForToken as sfrpgCoverTypesForToken } from "./coverDefaults/sfrpg.js";
import { coverTypes as genericCoverTypes } from "./coverDefaults/generic.js";

/**
 * @typedef {object} CoverType
 *
 * Object that stores properties for a given cover type.
 * Custom properties are permitted.
 *
 * @prop {string} name                          Name of the category. Will be localized.
 * @prop {string} id                            Id for the category. Must be unique.
 * @prop {number} percentThreshold              A token has cover from an attacker if the attacker cannot
 *                                              see more than this percentage of the token.
 *                                              How visibility is measured is controlled by the Cover Settings.
 * @prop {string} icon                          Icon that represents this category. Displayed on the token.
 * @prop {number|null} tint                     Optional tint applied to the icon
 * @prop {boolean} canOverlap                   If true, this cover can be applied *in addition to* other cover types
 * @prop {ActiveEffect|null} activeEffectData   Data used to create an active effect associated with this cover type
 * @prop {number|null} priority                 When evaluating the percent threshold, higher-priority cover types
 *                                              are evaluated first.
 * @prop {boolean} includeWalls                 Should walls be considered blocking for this category?
 * @prop {boolean} includeTokens                Should tokens be considered blocking for this category?
 */

/* Cover handling

Default CoverTypes are defined for given systems but can be modified by the GM by changing
variables in `CONFIG.tokencover`.

Cover types are stored in an array in `CONFIG.tokencover.COVER.TYPES.` By default, these are tested
in order from left to right in the array. If a token's percent cover is less than or equal to the percentThreshold
for that cover type, it is considered to have that cover type. This can be modified by changing
`COVER.typeFromPercentFn`.

There are also two preset values:
`CONFIG.tokencover.COVER.NONE = 0`          No cover applies.
`CONFIG.tokencover.COVER.EXCLUDE = -1`      The token cannot be attacked, and thus no cover applies.

`CONFIG.tokencover.COVER.typeFromPercentFn` can be modified to determine cover given system-specific rules.
It returns a cover type, or no cover, for a given
   This function determines cover type given a percent cover between 0 and 1.
   If coverToken and attackingToken is provided, this function can adjust the cover for system-specific,
   token-specific rules.
   - @param {number} percentCover     A percent cover from a given token
   - @param {Token} [coverToken]      Optional token for which cover should be measured
   - @param {Token} [attackingToken]  Optional token from which cover should be measured
   - @returns {CoverType|COVER.NONE}  The cover type for that percentage.

// TODO: This is probably not correct if walls and tokens block. Ideally, this function could
// be passed blocking objects.

*/

/* TODO:
- percentCover should take an option to include walls, include tokens.
- percentCover should take a flag to not clear the blocked objects, for expert use.
- CoverCalculator should have a method to test if an array of tokens block.
  - run cover calculator as normal.
  - if no tokens in blocking objects, return 0
  - otherwise, remove blocking tokens not in the array and re-run
  - take a flag to avoid running cover calc as normal first
- When running CoverCalculator on limited set, it should always reset to the full objects after
*/


export const COVER = {};
COVER.NONE = 0;
COVER.EXCLUDE = -1;

/**
 * Determine what cover types apply to a target token given an attacking token.
 * @param {Token} attackingToken
 * @param {Token} targetToken
 * @returns {coverType[]}
 */
export function coverTypesForToken(attackingToken, targetToken) {
  const calc = attackingToken.coverCalculator;
  calc.target = targetToken;
  const percentCoverFn = coverTypePercentTestFn(calc);
  const types = [];

  // Test cover types in priority order.
  for ( const type of COVER.ORDER ) {
    if ( percentCoverFn(type) <= type.percentThreshold ) {
      types.push(type);
      break;
    }
  }

  // Test cover types without a set priority.
  for ( const type of COVER.OTHER ) {
    // If there is already a type, cannot use a non-overlapping type.
    if ( !type.canOverlap && types.length ) continue;
    if ( percentCoverFn(type) <= type.percentThreshold ) types.push(type);
  }
  return types;

  // TODO: Handle ignore cover flags.
}

/**
 * Helper that tests for percent cover, caching it for the combinations of
 * including walls and tokens.
 * @param {CoverCalculator} calc    Cover calculator to use; must have target set
 * @returns {function}
 *   - @param {CoverType} coverType     Cover type to test
 *   - @returns {number} percentCover   Percent cover for this type
 */
function coverTypePercentTestFn(calc) {
  const coverCategories = Array(4);

  return type => {
    let percentCover;
    const { includeWalls, includeTokens } = type;
    const option = (includeWalls * 2) + includeTokens;
    switch ( option ) {
      case 0: percentCover = coverCategories[option] ??= calc.percentCover({ includeWalls: false, includeTokens: false }); break;
      case 1: percentCover = coverCategories[option] ??= calc.percentCover({ includeWalls: false, includeTokens: true }); break;
      case 2: percentCover = coverCategories[option] ??= calc.percentCover({ includeWalls: true, includeTokens: false }); break;
      case 3: percentCover = coverCategories[option] ??= calc.percentCover({ includeWalls: true, includeTokens: true }); break;
    }
    return percentCover;
  }
}


export function defaultCoverTest(percentCover) {
  for ( const type of COVER.ORDER ) {
    if ( percentCover <= type.percentThreshold ) return type;
  }
  return COVER.NONE;
}

export function updateCoverOrder() {
  COVER.OTHER = [];
  COVER.ORDER = [];
  for ( const type of Object.values(COVER.TYPES) ) {
    if ( type.priority == null ) COVER.OTHER.push(type);
    else COVER.ORDER.push(type);
  }
  COVER.ORDER.sort((a, b) => b.priority - a.priority);
}

export function setDefaultCoverData() {
  switch ( game.system.id ) {
    case "dnd5e": {
      COVER.TYPES ??= dnd5eCoverTypes;
      COVER.coverTypesForToken ??= dnd5eCoverTypesForToken;
      break;
    }

    case "pf2e": {
      COVER.TYPES ??= pf2eCoverTypes;
      COVER.coverTypesForToken ??= pf2eCoverTypesForToken;
      break;
    }

    case "sfrpg": {
      COVER.TYPES ??= sfrpgCoverTypes;
      COVER.coverTypesForToken ??= sfrpgCoverTypesForToken;
      break;
    }

    default: {
      COVER.TYPES ??= genericCoverTypes;
      COVER.coverTypesForToken ??= coverTypesForToken;
      break;
    }
  }

  updateCoverOrder();
}



