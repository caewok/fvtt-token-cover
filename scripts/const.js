/* globals
Hooks,
game,
canvas
*/
"use strict";

import { ENUMS as LOS_ENUMS, pointIndicesLabels } from "./LOS/const.js";
import { IgnoresCover } from "./IgnoresCover.js";
export { pointIndicesLabels } from "./LOS/const.js";

export const MODULE_ID = "tokencover";
export const EPSILON = 1e-08;
export const DOCUMENTATION_URL = "https://github.com/caewok/fvtt-token-cover/blob/master/README.md";
export const ISSUE_URL = "https://github.com/caewok/fvtt-token-cover/issues";
export const SOCKETS = { socket: null };

/**
 * Checks for libGeometery.
 * @type {object}
 */
export const GEOMETRY_LIB_OPTS = {
  // What geometries we need to track.
  // All of these potentially provide cover.
  placeableGeometries: [
    "Tile",
    "Token",
    "Region",
    "Wall",
    "Level",
  ],

  wallHeightRequired: true,
  tokenHeightRequired: true,
};

export const FLAGS = {
  DND5E: {
    SPELL_CONFIG: {
      USE_COVER: "useCover",
      CHOICES: {
        NO: "no",
        CASTER: "caster",
        TEMPLATE: "template"
      }
    }
  },
  OPACITY: "opacity",

  DRAWING: { IS_HOLE: "isHole" },
  COVER: {
    IGNORE: {
      ALL: "ignoreCoverAll",
      MWAK: "ignoreCoverMWAK",
      MSAK: "ignoreCoverMSAK",
      RWAK: "ignoreCoverRWAK",
      RSAK: "ignoreCoverRSAK"
    },

    IGNORE_DND5E: "helpersIgnoreCover",
    SPELLSNIPER: "spellSniper",
    SHARPSHOOTER: "sharpShooter",
  },

  UNIQUE_EFFECT: {
    ID: "uniqueEffectId",
    TYPE: "uniqueEffectType",
    DUPLICATES_ALLOWED: "duplicatesAllowed",
    IS_LOCAL: "isLocal",
    DISPLAY_ICON: "displayStatusIcon"
  },

  /**
   * For updating flag data to new versions of the module.
   * @type {string} Version of the module that saved this data.
   */
  VERSION: "version"
};

export const LABELS = {
  DND5E: {
    SPELL_CONFIG: {
      USE_COVER: {
        no: `${MODULE_ID}.dnd5e.spell-configuration.useCover.no`,
        caster: `${MODULE_ID}.dnd5e.spell-configuration.useCover.caster`,
        template: `${MODULE_ID}.dnd5e.spell-configuration.useCover.template`
      }
    }
  }
};

export const TEMPLATES = {
  TOKEN_CONFIG: `modules/${MODULE_ID}/templates/token-config.html`,
  WALL_CONFIG: `modules/${MODULE_ID}/templates/wall-config.html`,
  SETTINGS_BUTTONS: `modules/${MODULE_ID}/templates/settings-buttons.html`,
  SETTINGS_MENU_PARTIAL: `modules/${MODULE_ID}/templates/settings-menu-tab-partial.html`,
  SETTINGS_MENU: `modules/${MODULE_ID}/templates/settings-menu.html`,
  SPELL_CONFIG_DND5E: `modules/${MODULE_ID}/templates/dnd5e-spell-config.html`,
  SETTINGS_COVER_RULES: `modules/${MODULE_ID}/templates/settings-cover-rules.html`,
};

export const ICONS = {
  SHIELD_THIN_GRAY: {
    ONE_QUARTER: `modules/${MODULE_ID}/assets/shield_low_gray.svg`,
    HALF: `modules/${MODULE_ID}/assets/shield_half_gray.svg`,
    THREE_QUARTERS: `modules/${MODULE_ID}/assets/shield_medium_gray.svg`,
    FULL: `modules/${MODULE_ID}/assets/shield_high_gray.svg`
  },

  SHIELD_THICK_GRAY: {
    HEART: `modules/${MODULE_ID}/assets/shield_heart_gray.svg`,
    SPLAT: `modules/${MODULE_ID}/assets/shield_virus_gray.svg`,
    HALF: `modules/${MODULE_ID}/assets/shield_halved_gray.svg`,
    FULL: `modules/${MODULE_ID}/assets/shield_gray.svg`
  },

  SHIELD_THICK_BLACK: {
    HEART: `modules/${MODULE_ID}/assets/shield_heart.svg`,
    SPLAT: `modules/${MODULE_ID}/assets/shield_virus.svg`,
    HALF: `modules/${MODULE_ID}/assets/shield_halved.svg`,
    FULL: `modules/${MODULE_ID}/assets/shield.svg`
  },

  MODULE: "icons/svg/shield.svg"
};

export const FA_ICONS = {
  MODULE: "fa-solid fa-shield-halved",
  COVER_DIALOG: {
    YES: "fa-solid fa-check",
    NO: "fa-solid fa-xmark",
  },
  MENUS: {
    SUBMENU: "fa-solid fa-user-gear",
    COVER_RULES: "fa-solid fas-shield-halved",
    EXPORT_BUTTON: "far fa-file-arrow-down",
    IMPORT_BUTTON: "far fa-file-arrow-up",
  },
};

export const COVER = {};
COVER.NONE = 0;
COVER.EXCLUDE = -1;

// Deprecated but kept for midiqol and possibly other modules.
export const COVER_TYPES = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  TOTAL: 4
};

export let IGNORES_COVER_HANDLER = IgnoresCover;

export const WEAPON_ATTACK_TYPES = {
  all: `${MODULE_ID}.phrases.AllAttacks`,
  mwak: "DND5E.ActionMWAK",
  msak: "DND5E.ActionMSAK",
  rwak: "DND5E.ActionRWAK",
  rsak: "DND5E.ActionRSAK",
  save: "DND5E.ActionSave",
  abil: "DND5E.ActionAbil",
  ench: "DND5E.ActionEnch",
  heal: "DND5E.ActionHeal",
  other: "DND5E.ActionOther",
  summ: "DND5E.ActionSumm",
  util: "DND5E.ActionUtil"
};

// Track certain modules that complement features of this module.
export const OTHER_MODULES = {
  LEVELS: {
    KEY: "levels",
    FLAGS: {
      ALLOW_SIGHT: "noCollision",
    },
  },
  ATV: { KEY: "token_visibility" },
  SIMBULS_CC: { KEY: "simbuls-cover-calculator" },
  MIDI_QOL: { KEY: "midi-qol" },
};

// Hook init b/c game.modules is not initialized at start.
Hooks.once("init", function() {
  for ( const [key, obj] of Object.entries(OTHER_MODULES) ) {
    if ( !game.modules.get(obj.KEY)?.active ) delete OTHER_MODULES[key];
  }
});

// API not necessarily available until ready hook. (Likely added at init.)
Hooks.once("ready", function() {
  const { TERRAIN_MAPPER, RIDEABLE } = OTHER_MODULES;
  if ( TERRAIN_MAPPER ) TERRAIN_MAPPER.API = game.modules.get(TERRAIN_MAPPER.KEY).api;
  if ( RIDEABLE ) RIDEABLE.API = game.modules.get(RIDEABLE.KEY).api;
});

/**
 * Helper to set the cover ignore handler and, crucially, update all tokens.
 */
export function setCoverIgnoreHandler(handler) {
  if ( !(handler.prototype instanceof IgnoresCover ) ) {
    console.warn("setCoverIgnoreHandler: handler not recognized.");
    return;
  }

  IGNORES_COVER_HANDLER = handler;

  // Simplest just to revert any existing.
  if ( !canvas.tokens?.placeables ) return;
  canvas.tokens.placeables.forEach(t => t.tokencover.ignoresCover = undefined);
}

export const TRACKER_IDS = {
  COVER: "coverCalculator",
};

export const CONTROLS = {
  COVER_EFFECTS: "cover-effects-control"
};

export const MENUS = {
  SUBMENU: "submenu",
  EXPORT_BUTTON: "exportButton",
  IMPORT_BUTTON: "importButton",
  COVER_DEFINITIONS: "coverDefinitionsMenu",
};

export const ENUMS = {
  USE_CHOICES: {
    NEVER: "never",
    COMBAT: "combat",
    COMBATANT: "combatant",
    ATTACK: "attack",
    ALWAYS: "always"
  },
  CONFIRM_CHOICES: {
    USER: "cover-workflow-confirm-user",
    USER_CANCEL: "cover-workflow-confirm-user-cancel",
    GM: "cover-workflow-confirm-gm",
    AUTO: "cover-workflow-confirm-automatic"
  },

  ...LOS_ENUMS,
};

export const SETTINGS = {
  UNIQUE_EFFECTS_FLAGS_DATA: "uniqueEffectsFlagsData",

  DISPLAY_SECRET_COVER: "display-secret-cover",

  TEMPLATES_USE_COVER: "templates-use-cover",

  /**
   * @type {"auto"|"activeEffect"}
   * - Auto: Uses the system's built-in cover mechanism, if any.
   * - ActiveEffect: Always use dropped effects/items
   */
  BACKEND_MODE: "backend-mode",

  COVER_DEFINITIONS: "cover-definitions",

  COVER_EFFECTS: {
    USE: "use-cover-effects",
    // CHOICES: USE_CHOICES,
    DATA: "cover-effects-data",
    TARGETING: "cover-effects-targeting",
    RULES: "cover-rules",
    LIVE_TOKENS_BLOCK: "live-tokens-block",
    DEAD_TOKENS_BLOCK: "dead-tokens-block",
    PRONE_TOKENS_BLOCK: "prone-tokens-block",
  },

  COVER_WORKFLOW: {
    CHAT: "cover-chat-message",
    CONFIRM: "cover-workflow-confirm",
    CONFIRM_CHANGE_ONLY: "cover-workflow-confirm-change-only",
    CONFIRM_NO_COVER: "cover-workflow-confirm-no-cover",
  },

  // Taken from Alt. Token Visibility
  LOS: {
    VIEWER: {
      POINTS: "los-points-options-viewer",
      INSETS: {
        SIDES: "los-inset-viewer-sides",
        TOP: "los-inset-viewer-top",
        BOTTOM: "los-inset-viewer-bottom",
      },
    },

    TARGET: {
      ALGORITHM: "los-algorithm",
      LARGE: "los-large-target",
      POINT_OPTIONS: {
        POINTS: "los-points-options-target",
        INSET: "los-inset-target",
      },
    },
  },

  PRONE_STATUS_ID: "prone-status-id",
  TOKEN_HP_ATTRIBUTE: "token-hp-attribute",

  PRONE_MULTIPLIER: "prone-multiplier",
  VISION_HEIGHT_MULTIPLIER: "vision-height-multiplier",

  // Hidden settings
  AREA3D_USE_SHADOWS: "area3d-use-shadows", // For benchmarking and debugging for now.
  CHANGELOG: "changelog",
  ATV_SETTINGS_MESSAGE: "atv-settings-message",

  // Configuration of the application that controls the terrain listings.
  CONTROL_APP: {
    FAVORITES: "favorites", // Array of favorite terrains, by effect id.
    EXPANDED_FOLDERS: "app_expanded_folders", // Array of folders that are expanded, by id
    FOLDERS: "app_folders",
  },

  MIGRATION: {
    v0100: "migration-v0.10.0",
  },

  DEBUG: {
    LOS: "debug-cover", // For compatibility with older versions, keep as "debug-cover".
  },
};

