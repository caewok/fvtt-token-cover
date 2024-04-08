/* globals
*/
"use strict";

import { MODULE_ID } from "../const.js";

export const coverTypes = {};
coverTypes.low = {
  name: `${MODULE_ID}.cover.low`,
  id: `${MODULE_ID}.cover.low`,
  percentThreshold: 0.5,
  icon: "modules/tokencover/assets/shield_low_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 1,
  activeEffectData: null
}

coverTypes.medium = {
  name:  `${MODULE_ID}.cover.medium`,
  id: `${MODULE_ID}.cover.medium`,
  percentThreshold: 0.75,
  icon: "modules/tokencover/assets/shield_medium_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 2,
  activeEffectData: null

}

coverTypes.high = {
  name: `${MODULE_ID}.cover.high`,
  id: `${MODULE_ID}.cover.high`,
  percentThreshold: 1,
  icon: "modules/tokencover/assets/shield_high_gray.svg",
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 3,
  activeEffectData: null
}

coverTypes.tokensBlock = {
  name: `${MODULE_ID}.cover.tokensBlock`,
  id: `${MODULE_ID}.cover.tokensBlock`,
  percentThreshold: 1,
  icon: "modules/tokencover/assets/shield_virus_gray.svg",
  tint: null,
  canOverlap: true,
  includeWalls: false,
  includeTokens: true,
  priority: null,
  activeEffectData: null
}
