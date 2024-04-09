/* globals
*/
"use strict";

import { MODULE_ID, ICONS } from "../const.js";

const SYSTEM_ID = "generic";

export const coverTypes = {};
coverTypes.low = {
  name: `${MODULE_ID}.cover.low`,
  id: `${MODULE_ID}.${SYSTEM_ID}.low`,
  percentThreshold: 0.5,
  icon: ICONS.SHIELD_THIN_GRAY.ONE_QUARTER,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 1,
  activeEffectData: null
};

coverTypes.medium = {
  name:  `${MODULE_ID}.cover.medium`,
  id: `${MODULE_ID}.${SYSTEM_ID}.medium`,
  percentThreshold: 0.75,
  icon: ICONS.SHIELD_THIN_GRAY.THREE_QUARTERS,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 2,
  activeEffectData: null
};

coverTypes.high = {
  name: `${MODULE_ID}.cover.high`,
  id: `${MODULE_ID}.${SYSTEM_ID}.high`,
  percentThreshold: 1,
  icon: ICONS.SHIELD_THIN_GRAY.FULL,
  tint: null,
  canOverlap: false,
  includeWalls: true,
  includeTokens: false,
  priority: 3,
  activeEffectData: null
};

coverTypes.tokensBlock = {
  name: `${MODULE_ID}.cover.tokensBlock`,
  id: `${MODULE_ID}.${SYSTEM_ID}.tokens_block`,
  percentThreshold: 1,
  icon: "modules/tokencover/assets/shield_virus_gray.svg",
  tint: null,
  canOverlap: true,
  includeWalls: false,
  includeTokens: true,
  priority: null,
  activeEffectData: null
};
