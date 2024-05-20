/* globals
Hooks,
game,
canvas
*/
"use strict";

// Ignores Cover
import { IgnoresCover } from "./IgnoresCover.js";

export const MODULE_ID = "tokencover";
export const EPSILON = 1e-08;
export const DOCUMENTATION_URL = "https://github.com/caewok/fvtt-token-cover/blob/master/README.md";
export const ISSUE_URL = "https://github.com/caewok/fvtt-token-cover/issues";
export const SOCKETS = { socket: null };

export const FLAGS = {
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
    MAX_GRANT: "maximumCoverGrant"
  },

  COVER_EFFECT: {
    /**
     * Store an identifier that links an active effect to its stored data.
     * @type {string}
     */
    ID: "coverEffectId",

    /**
     * Identify a specific item as one that holds cover effects.
     * @type {boolean}
     */
    ITEM: "coverEffectItem",

    /**
     * Cover effect applies when cover equals or exceeds this threshold.
     * @type {number}
     */
    PERCENT_THRESHOLD: "percentThreshold",

    /**
     * Cover effect priority, when multiple covers apply.
     * @type {number}
     */
    PRIORITY: "priority",

    /**
     * Cover effect can overlap with another.
     * @type {boolean}
     */
    CAN_OVERLAP: "canOverlap",

    /**
     * Cover effect includes walls in the cover calculation.
     * @type {boolean}
     */
    INCLUDE_WALLS: "includeWalls",

    /**
     * Cover effect includes tokens in the cover calculation.
     * @type {boolean}
     */
    INCLUDE_TOKENS: "includeTokens",

    /**
     * Cover effect has been applied locally.
     * @param {boolean}
     */
    LOCAL: "coverEffectLocal"
  },

  /**
   * For updating flag data to new versions of the module.
   * @type {string} Version of the module that saved this data.
   */
  VERSION: "version"
};

export const TEMPLATES = {
  TOKEN_CONFIG: `modules/${MODULE_ID}/templates/token-config.html`,
  SETTINGS_BUTTONS: `modules/${MODULE_ID}/templates/settings-buttons.html`,
  SETTINGS_MENU_PARTIAL: `modules/${MODULE_ID}/templates/settings-menu-tab-partial.html`,
  SETTINGS_MENU: `modules/${MODULE_ID}/templates/settings-menu.html`
}

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
  }
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
  rsak: "DND5E.ActionRSAK"
};

export const MODULES_ACTIVE = { API: {} };

// Hook init b/c game.modules is not initialized at start.
Hooks.once("init", function() {
  MODULES_ACTIVE.WALL_HEIGHT = game.modules.get("wall-height")?.active;
  MODULES_ACTIVE.TOKEN_VISIBILITY = game.modules.get("tokenvisibility")?.active;
  MODULES_ACTIVE.LEVELS = game.modules.get("levels")?.active;
  MODULES_ACTIVE.DFREDS_CE = game.modules.get("dfreds-convenient-effects")?.active;
  MODULES_ACTIVE.SIMBULS_CC = game.modules.get("simbuls-cover-calculator")?.active;
  MODULES_ACTIVE.MIDI_QOL = game.modules.get("midi-qol")?.active;
  MODULES_ACTIVE.ELEVATED_VISION = game.modules.get("elevatedvision")?.active;
  MODULES_ACTIVE.RIDEABLE = game.modules.get("Rideable")?.active;
});

// API not necessarily available until ready hook. (Likely added at init.)
Hooks.once("ready", function() {
  if ( MODULES_ACTIVE.RIDEABLE ) MODULES_ACTIVE.API.RIDEABLE = game.modules.get("Rideable").api;
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
