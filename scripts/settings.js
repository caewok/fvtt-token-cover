/* globals
canvas,
CONFIG,
duplicate,
game,
PIXI
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, MODULES_ACTIVE, COVER } from "./const.js";
import { Draw } from "./geometry/Draw.js";
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

export const DEBUG_GRAPHICS = {
  LOS: new PIXI.Graphics(),
  RANGE: new PIXI.Graphics()
};

export const SETTINGS = {
  AREA3D_USE_SHADOWS: "area3d-use-shadows", // For benchmarking and debugging for now.

  // Taken from Alt. Token Visibility
  POINT_TYPES: {
    CENTER: "points-center",
    FOUR: "points-four", // Five without center
    FIVE: "points-five", // Corners + center
    EIGHT: "points-eight", // Nine without center
    NINE: "points-nine" // Corners, midpoints, center
  },

  LOS: {
    ALGORITHM: "los-algorithm",
    LARGE_TARGET: "los-large-target",
    TYPES: {
      POINTS: "los-points",
      AREA2D: "los-area-2d",
      AREA3D: "los-area-3d"
    },

    VIEWER: {
      NUM_POINTS: "los-points-viewer",
      INSET: "los-inset-viewer"
    },

    POINT_OPTIONS: {
      NUM_POINTS: "los-points-target",
      INSET: "los-inset-target",
      POINTS3D: "los-points-3d"
    }
  },

  DEBUG: {
    LOS: "debug-los"
  },

  COVER: {
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

  BUTTONS: {
    PF2E: "button-pf2e",
    DND_5E_DMG: "button-dnd5e-dmg",
    THREE_D: "button-three-d",
    DOCUMENTATION: "button-documentation"
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

export function registerSettings() {
  const localize = key => game.i18n.localize(`${MODULE_ID}.settings.${key}`);
  const coverNames = getCoverNames();

  // ----- NOTE: Cover Percent Triggers ----- //

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

  // ----- NOTE: Line-of-sight (Cover mechanics) ----- //
  const PT_OPTS = SETTINGS.LOS.POINT_OPTIONS;
  const PT_TYPES = SETTINGS.POINT_TYPES;
  const LTYPES = SETTINGS.LOS.TYPES;
  const losChoices = {};
  const ptChoices = {};
  Object.values(LTYPES).forEach(type => losChoices[type] = localize(type));
  Object.values(PT_TYPES).forEach(type => ptChoices[type] = localize(type));

  game.settings.register(MODULE_ID, SETTINGS.LOS.ALGORITHM, {
    name: localize(`${SETTINGS.LOS.ALGORITHM}.Name`),
    hint: localize(`${SETTINGS.LOS.ALGORITHM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: losChoices,
    default: LTYPES.NINE
  });

  game.settings.register(MODULE_ID, PT_OPTS.NUM_POINTS, {
    name: localize(`${PT_OPTS.NUM_POINTS}.Name`),
    hint: localize(`${PT_OPTS.NUM_POINTS}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: ptChoices,
    default: PT_TYPES.NINE
  });

  game.settings.register(MODULE_ID, PT_OPTS.INSET, {
    name: localize(`${PT_OPTS.INSET}.Name`),
    hint: localize(`${PT_OPTS.INSET}.Hint`),
    range: {
      max: 0.99,
      min: 0,
      step: 0.01
    },
    scope: "world",
    config: true, // () => getSetting(SETTINGS.LOS.ALGORITHM) !== LTYPES.POINTS,
    default: 0.75,
    type: Number
  });

  game.settings.register(MODULE_ID, PT_OPTS.POINTS3D, {
    name: localize(`${PT_OPTS.POINTS3D}.Name`),
    hint: localize(`${PT_OPTS.POINTS3D}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.LOS.VIEWER.NUM_POINTS, {
    name: localize(`${SETTINGS.LOS.VIEWER.NUM_POINTS}.Name`),
    hint: localize(`${SETTINGS.LOS.VIEWER.NUM_POINTS}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: ptChoices,
    default: PT_TYPES.CENTER
  });

  game.settings.register(MODULE_ID, SETTINGS.LOS.VIEWER.INSET, {
    name: localize(`${SETTINGS.LOS.VIEWER.INSET}.Name`),
    hint: localize(`${SETTINGS.LOS.VIEWER.INSET}.Hint`),
    range: {
      max: 0.99,
      min: 0,
      step: 0.01
    },
    scope: "world",
    config: true,
    default: 0.75,
    type: Number
  });


  game.settings.register(MODULE_ID, SETTINGS.LOS.LARGE_TARGET, {
    name: localize(`${SETTINGS.LOS.LARGE_TARGET}.Name`),
    hint: localize(`${SETTINGS.LOS.LARGE_TARGET}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });


  // ----- NOTE: Menus (Cover effects) ----- //

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

  game.settings.register(MODULE_ID, SETTINGS.DEBUG.LOS, {
    name: localize(`${SETTINGS.DEBUG.LOS}.Name`),
    hint: localize(`${SETTINGS.DEBUG.LOS}.Hint`),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: value => {
      if ( value ) canvas.stage.addChild(DEBUG_GRAPHICS.LOS);
      else {
        const draw = new Draw(DEBUG_GRAPHICS.LOS);
        draw.clearDrawings();
        canvas.stage.removeChild(DEBUG_GRAPHICS.LOS);
      }
    }
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
}

function getCoverNames() {
  const statusEffects = STATUS_EFFECTS[game.system.id] || STATUS_EFFECTS.generic;

  return {
    LOW: statusEffects.LOW.id,
    MEDIUM: statusEffects.MEDIUM.id,
    HIGH: statusEffects.HIGH.id
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
