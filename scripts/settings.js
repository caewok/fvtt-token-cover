/* globals
game,
duplicate,
CONFIG
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { log } from "./util.js";
import { MODULE_ID, MODULES_ACTIVE, COVER } from "./const.js";
import { STATUS_EFFECTS } from "./status_effects.js";
import {
  LowCoverEffectConfig,
  MediumCoverEffectConfig,
  HighCoverEffectConfig } from "./EnhancedEffectConfig.js";

export function getSetting(settingName) {
  return game.settings.get(MODULE_ID, settingName);
}

export async function setSetting(settingName, value) {
  return game.settings.set(MODULE_ID, settingName, value);
}

export const SETTINGS = {
  AREA3D_USE_SHADOWS: "area3d-use-shadows", // For benchmarking and debugging for now.

  // For Area2d and Area3d
  LOS: {
    PERCENT_AREA: "los-percent-area"
  },

  COVER: {
    ALGORITHM: "cover-algorithm",
    TYPES: {
      CENTER_CORNERS_TARGET: "cover-center-to-target-corners",
      CORNER_CORNERS_TARGET: "cover-corner-to-target-corners",
      CENTER_CORNERS_GRID: "cover-center-to-target-grid-corners",
      CORNER_CORNERS_GRID: "cover-corner-to-target-grid-corners",
      CENTER_CENTER: "cover-center-to-center",
      AREA: "cover-area",
      AREA3D: "cover-area-3d"
    },

    EFFECTS: "cover-effects",

    MENU: {
      LOW: "menu-cover-effects-low",
      MEDIUM: "menu-cover-effects-medium",
      HIGH: "menu-cover-effects-high"
    },

    TRIGGER_CENTER: "cover-trigger-center",

    TRIGGER_PERCENT: {
      LOW: "cover-trigger-percent-low",
      MEDIUM: "cover-trigger-percent-medium",
      HIGH: "cover-trigger-percent-high"
    },

    MIDIQOL: {
      COVERCHECK: "midiqol-covercheck",
      COVERCHECK_CHOICES: {
        NONE: "midiqol-covercheck-none",
        USER: "midiqol-covercheck-user",
        USER_CANCEL: "midiqol-covercheck-user-cancel",
        GM: "midiqol-covercheck-gm",
        AUTO: "midiqol-covercheck-auto"
      },
      COVERCHECK_IF_CHANGED: "midiqol-covercheck-if-changed"
    },

    COMBAT_AUTO: "cover-combat-auto",
    CHAT: "cover-chat-message",

    DEAD_TOKENS: {
      ALGORITHM: "cover-token-dead",
      ATTRIBUTE: "cover-token-dead-attribute"
    },

    LIVE_TOKENS: {
      ALGORITHM: "cover-token-live",
      ATTRIBUTE: "cover-token-prone-attribute",
      TYPES: {
        NONE: "cover-token-live-none",
        HALF: "cover-token-live-half",
        FULL: "cover-token-live-full"
      }
    },

    PRONE: "cover-prone"
  },

  CHANGELOG: "changelog",

  WELCOME_DIALOG: {
    v020: "welcome-dialog-v0-20",
    v030: "welcome-dialog-v0-30"
  },

  MIGRATION: {
    v032: "migration-v032",
    v054: "migration-v054"
  }
};


/* Range testing types:
1. Center point -- Only test the center point of tokens.
2. Foundry -- Use the Foundry 8 points.
3. 3d Foundry -- Add additional points to top and bottom, 27 total

For 3d, test points in 3 dimensions.
*/

/* LOS testing types:
1. Points --- Use the same points from range, test if contained in LOS polygon.
3. Area -- Use token area.

For area, provide a slider for 0–100% of token area.
Each token should have a setting for bounds scale for vision.

For 3d points, don't test los contains for extra 3d Foundry points. (They would obv. be the same. )
For 3d points, do test wall collisions for non-infinite walls.
(Infinite walls included in LOS.)
*/

/* Cover testing types:
1. Center to 4 Corners -- from the center point of the token to 4 corners
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
2. Corner to Four Corner -- DMG rules; vision from each occupied grid point
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
3. Center to Center -- PF2e version
3/4 (standard)
4. Area
Half trigger: % area
3/4 trigger: % area
full trigger: % area

3D versions ( same triggers )
5. Center to cube corners
6. Cube corner to cube corners
7. 3d Area


Other settings:
GM can provide the name of an active effect to apply when covered. Applies to the token with cover.
- low active effect
- medium active effect
- high active effect

Cover Names:
Generic: low, medium, high
PF2e: lesser, standard, greater
dnd5e: half, 3/4, full

*/

export function registerSettings() {
  log("Registering token cover settings.");

  game.settings.register(MODULE_ID, SETTINGS.LOS.PERCENT_AREA, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.LOS.PERCENT_AREA}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.LOS.PERCENT_AREA}.Hint`),
    range: {
      max: 1,
      min: 0,
      step: 0.05
    },
    scope: "world",
    config: false, // () => getSetting(SETTINGS.LOS.ALGORITHM) !== LTYPES.POINTS,
    default: 0,
    type: Number
  });

  const CTYPES = SETTINGS.COVER.TYPES;
  const coverNames = getCoverNames();

  game.settings.register(MODULE_ID, SETTINGS.COVER.ALGORITHM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.ALGORITHM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.ALGORITHM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CTYPES.CENTER_CENTER]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CENTER_CENTER}`),
      [CTYPES.CENTER_CORNERS_TARGET]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CENTER_CORNERS_TARGET}`),
      [CTYPES.CORNER_CORNERS_TARGET]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CORNER_CORNERS_TARGET}`),
      [CTYPES.CENTER_CORNERS_GRID]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CENTER_CORNERS_GRID}`),
      [CTYPES.CORNER_CORNERS_GRID]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CORNER_CORNERS_GRID}`),
      [CTYPES.AREA]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.AREA}`),
      [CTYPES.AREA3D]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.AREA3D}`)
    },
    default: game.system.id === "pf2e" ? CTYPES.CENTER_CENTER : CTYPES.CORNER_CORNERS_TARGET
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_CENTER, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_CENTER}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_CENTER}.Hint`),
    scope: "world",
    config: true, // () => getSetting(SETTINGS.COVER.ALGORITHM) === CTYPES.CENTER_CENTER,
    default: coverNames.MEDIUM,
    type: String,
    choices: {
      LOW: coverNames.LOW,
      MEDIUM: coverNames.MEDIUM,
      HIGH: coverNames.HIGH
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_PERCENT.LOW, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.LOW}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.LOW}.Hint`),
    range: {
      max: 1,
      min: 0.1,
      step: 0.05
    },
    scope: "world",
    config: true,
    default: .5,
    type: Number
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM}.Hint`),
    range: {
      max: 1,
      min: 0.1,
      step: 0.05
    },
    scope: "world",
    config: true,
    default: .75,
    type: Number
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_PERCENT.HIGH, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.HIGH}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.HIGH}.Hint`),
    range: {
      max: 1,
      min: 0.1,
      step: 0.05
    },
    scope: "world",
    config: true,
    default: 1,
    type: Number
  });


  const skipCoverMenus = game.system.id === "sfrpg";
  const skipLowMenu = skipCoverMenus || dFredsHasCover("LOW");
  const skipMediumMenu = skipCoverMenus || dFredsHasCover("MEDIUM");
  const skipHighMenu = skipCoverMenus || dFredsHasCover("HIGH");

  if ( !skipLowMenu ) {
    game.settings.registerMenu(MODULE_ID, SETTINGS.COVER.MENU.LOW, {
      name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MENU.LOW}.Name`),
      label: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MENU.LOW}.Label`),
      icon: "fas fa-shield-halved",
      type: LowCoverEffectConfig,
      restricted: true
    });
  }

  if ( !skipMediumMenu ) {
    game.settings.registerMenu(MODULE_ID, SETTINGS.COVER.MENU.MEDIUM, {
      name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MENU.MEDIUM}.Name`),
      label: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MENU.MEDIUM}.Label`),
      icon: "fas fa-shield-heart",
      type: MediumCoverEffectConfig,
      restricted: true
    });
  }

  if ( !skipHighMenu ) {
    game.settings.registerMenu(MODULE_ID, SETTINGS.COVER.MENU.HIGH, {
      name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MENU.HIGH}.Name`),
      hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MENU.HIGH}.Hint`),
      label: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MENU.HIGH}.Label`),
      icon: "fas fa-shield",
      type: HighCoverEffectConfig,
      restricted: true
    });
  }

  game.settings.register(MODULE_ID, SETTINGS.COVER.COMBAT_AUTO, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.COMBAT_AUTO}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.COMBAT_AUTO}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.CHAT, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.CHAT}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.CHAT}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  const MIDICHOICES = SETTINGS.COVER.MIDIQOL.COVERCHECK_CHOICES;
  const useCoverCheck = game.system.id === "dnd5e" || MODULES_ACTIVE.MIDI_QOL;
  game.settings.register(MODULE_ID, SETTINGS.COVER.MIDIQOL.COVERCHECK, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MIDIQOL.COVERCHECK}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MIDIQOL.COVERCHECK}.Hint`),
    scope: "world",
    config: useCoverCheck,
    type: String,
    choices: {
      [MIDICHOICES.NONE]: game.i18n.localize(`${MODULE_ID}.settings.${MIDICHOICES.NONE}`),
      [MIDICHOICES.USER]: game.i18n.localize(`${MODULE_ID}.settings.${MIDICHOICES.USER}`),
      [MIDICHOICES.USER_CANCEL]: game.i18n.localize(`${MODULE_ID}.settings.${MIDICHOICES.USER_CANCEL}`),
      [MIDICHOICES.GM]: game.i18n.localize(`${MODULE_ID}.settings.${MIDICHOICES.GM}`),
      [MIDICHOICES.AUTO]: game.i18n.localize(`${MODULE_ID}.settings.${MIDICHOICES.AUTO}`)
    },
    default: MIDICHOICES.NONE
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED}.Hint`),
    scope: "world",
    config: useCoverCheck,
    type: Boolean,
    default: false
  });

  const LIVECHOICES = SETTINGS.COVER.LIVE_TOKENS.TYPES;
  game.settings.register(MODULE_ID, SETTINGS.COVER.LIVE_TOKENS.ALGORITHM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.LIVE_TOKENS.ALGORITHM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.LIVE_TOKENS.ALGORITHM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: {
      [LIVECHOICES.NONE]: game.i18n.localize(`${MODULE_ID}.settings.${LIVECHOICES.NONE}`),
      [LIVECHOICES.FULL]: game.i18n.localize(`${MODULE_ID}.settings.${LIVECHOICES.FULL}`),
      [LIVECHOICES.HALF]: game.i18n.localize(`${MODULE_ID}.settings.${LIVECHOICES.HALF}`)
    },
    default: LIVECHOICES.FULL
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.DEAD_TOKENS.ALGORITHM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.DEAD_TOKENS.ALGORITHM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.DEAD_TOKENS.ALGORITHM}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.PRONE, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.PRONE}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.PRONE}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: "system.attributes.hp.value"
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.LIVE_TOKENS.ATTRIBUTE, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.LIVE_TOKENS.ATTRIBUTE}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.LIVE_TOKENS.ATTRIBUTE}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: "prone",
    onChange: value => CONFIG.GeometryLib.proneStatusId = value
  });

  // ----- HIDDEN SETTINGS ----- //
  game.settings.register(MODULE_ID, SETTINGS.COVER.EFFECTS, {
    scope: "world",
    config: false,
    default: STATUS_EFFECTS
  });

  game.settings.register(MODULE_ID, SETTINGS.AREA3D_USE_SHADOWS, {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.WELCOME_DIALOG.v030, {
    scope: "world",
    config: false,
    default: false,
    type: Boolean
  });

  game.settings.register(MODULE_ID, SETTINGS.MIGRATION.v032, {
    scope: "world",
    config: false,
    default: false,
    type: Boolean
  });

  game.settings.register(MODULE_ID, SETTINGS.MIGRATION.v054, {
    scope: "world",
    config: false,
    default: false,
    type: Boolean
  });

  log("Done registering settings.");
}

function getCoverNames() {
  const statusEffects = STATUS_EFFECTS[game.system.id] || STATUS_EFFECTS.generic;

  return {
    LOW: statusEffects.LOW.label,
    MEDIUM: statusEffects.MEDIUM.label,
    HIGH: statusEffects.HIGH.label
  };
}

/* Status effects
Stored in two places:
- SETTINGS.COVER.EFFECTS[][LOW, MEDIUM, HIGH]
--> by game system

- CONFIG.statusEffects
--> only current game system

When first loading the scene:
- Retrieve current status effect for the game system. Update CONFIG.statusEffects.

When user updates an effect:
- Store the updated effect to SETTINGS.COVER.EFFECTS for the type and game system
- Update CONFIG.statusEffects

*/

/**
 * Retrieve from GM settings the cover effect for the provided type for this game system.
 * @param {string} type   LOW, MEDIUM, or HIGH
 * @returns {object} Status effect
 */
export function getCoverEffect(type = "LOW") {
  const allStatusEffects = getSetting(SETTINGS.COVER.EFFECTS);
  const statusEffects = allStatusEffects[game.system.id] || allStatusEffects.generic;
  return statusEffects[type];
}

/**
 * Helper function to get the cover effect name from settings.
 * @param {string} type   LOW, MEDIUM, HIGH
 * @returns {string} Label for the cover effect
 */
export function getCoverName(type = "LOW") {
  if ( type === "NONE" ) return game.i18n.localize("None");
  if ( type === "TOTAL" ) return game.i18n.localize("tokenvisibility.phrases.Total");

  const effect = getCoverEffect(type);
  return game.i18n.localize(effect.name ?? effect.label);
}

/**
 * Store to GM settings the cover effect value provided for the provided type for this game system.
 * Also updates CONFIG.statusEffects array.
 * @param {string} type   LOW, MEDIUM, or HIGH
 * @param {object} value  Status effect
 */
export async function setCoverEffect(type, value) {
  if ( !type ) {
    console.error("setCoverEffect type must be defined.");
    return;
  }

  const allStatusEffects = getSetting(SETTINGS.COVER.EFFECTS);
  let systemId = game.system.id;
  if ( (systemId === "dnd5e" || systemId === "sw5e")
    && game.modules.get("midi-qol")?.active ) systemId = `${systemId}_midiqol`;

  if ( !Object.hasOwn(allStatusEffects, systemId) ) allStatusEffects[systemId] = duplicate(allStatusEffects.generic);

  allStatusEffects[systemId][type] = value;
  await setSetting(SETTINGS.COVER.EFFECTS, allStatusEffects);
  updateConfigStatusEffects(type);
}

/**
 * Confirm if DFred's has the given cover type.
 * @param {"LOW"|"MEDIUM"|"HIGH"} key
 * @returns {boolean}
 */
function dFredsHasCover(key) {
  if ( !MODULES_ACTIVE.DFREDS_CE ) return false;
  return Boolean(game.dfreds.effectInterface.findEffectByName(COVER.DFRED_NAMES[key]));
}

/**
 * Update the CONFIG.statusEffects array with the provided type, taken from GM settings.
 * @type {string} type    LOW, MEDIUM, or HIGH. If not defined, will update all three.
 */
export function updateConfigStatusEffects(type) {
  // Skip if using DFred's CE
  if ( dFredsHasCover(type) ) return;

  if ( !type ) {
    // Update all types
    updateConfigStatusEffects("LOW");
    updateConfigStatusEffects("MEDIUM");
    updateConfigStatusEffects("HIGH");
    return;
  }

  const coverEffect = getCoverEffect(type);
  coverEffect.id = `${MODULE_ID}.cover.${type}`;
  const currIdx = CONFIG.statusEffects.findIndex(effect => effect.id === coverEffect.id);
  coverEffect.name ??= coverEffect.label ?? coverEffect.id; // Ensure name is always present.

  if ( !~currIdx ) CONFIG.statusEffects.push(coverEffect);
  else CONFIG.statusEffects[currIdx] = coverEffect;
}

/*
Should probably switch to CSS:
https://ptb.discord.com/channels/170995199584108546/956243957816377414/1029782382225670201
No built-in way to do this. I would probably have config: true for all the settings,
then use a renderSettingsConfig hook to selectively hide the elements with CSS only and
add a listener which toggles that CSS hidden state.

*/
