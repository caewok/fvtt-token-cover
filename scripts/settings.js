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
import { SettingsSubmenu } from "./SettingsSubmenu.js";
import { registerArea3d, registerDebug, deregisterDebug } from "./patching.js";
import {
  LowCoverEffectConfig,
  MediumCoverEffectConfig,
  HighCoverEffectConfig } from "./EnhancedEffectConfig.js";

// Patches for the Setting class
export const PATCHES = {};
PATCHES.BASIC = {};

// ----- NOTE: Hooks ----- //

/**
 * Wipe the settings cache on update
 */
function updateSetting(document, change, options, userId) {  // eslint-disable-line no-unused-vars
  const [module, ...arr] = document.key.split(".");
  const key = arr.join("."); // If the key has periods, multiple will be returned by split.
  if ( module === MODULE_ID && Settings.cache.has(key) ) Settings.cache.delete(key);
}

PATCHES.BASIC.HOOKS = { updateSetting };

export const SETTINGS = {
  SUBMENU: "submenu",

  // Taken from Alt. Token Visibility
  POINT_TYPES: {
    CENTER: "points-center",
    FOUR: "points-four", // Five without center
    FIVE: "points-five", // Corners + center
    EIGHT: "points-eight", // Nine without center
    NINE: "points-nine" // Corners, midpoints, center
  },

  LOS: {
    VIEWER: {
      NUM_POINTS: "los-points-viewer",
      INSET: "los-inset-viewer"
    },

    TARGET: {
      ALGORITHM: "los-algorithm",
      LARGE: "los-large-target",
      TYPES: {
        POINTS: "los-points",
        AREA2D: "los-area-2d",
        AREA3D: "los-area-3d",
        AREA3D_GEOMETRIC: "los-area-3d-geometric",
        AREA3D_WEBGL1: "los-area-3d-webgl1",
        AREA3D_WEBGL2: "los-area-3d-webgl2",
        AREA3D_HYBRID: "los-area-3d-hybrid"
      },
      POINT_OPTIONS: {
        NUM_POINTS: "los-points-target",
        INSET: "los-inset-target",
        POINTS3D: "los-points-3d"
      }
    }
  },

  DEBUG: "debug-cover",
  PRONE_STATUS_ID: "prone-status-id",

  // Other cover settings
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
      // ATTRIBUTE: "cover-token-prone-attribute",
      TYPES: {
        NONE: "cover-token-live-none",
        HALF: "cover-token-live-half",
        FULL: "cover-token-live-full"
      }
    },

    PRONE: "cover-prone",
  },

  // Hidden settings
  AREA3D_USE_SHADOWS: "area3d-use-shadows", // For benchmarking and debugging for now.
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

export class Settings {
  /** @type {Map<string, *>} */
  static cache = new Map();

  /** @type {object} */
  static KEYS = SETTINGS;


  static toggleDebugGraphics(enabled = false) {
    if ( enabled ) registerDebug();
    else {
      if ( canvas.tokens?.placeables ) {
        canvas.tokens.placeables.forEach(token => {
          const calc = token[MODULE_ID]?.coverCalc.calc;
          if ( !calc ) return;
          calc.clearDebug();
        });
      }
      deregisterDebug();
    }
  }

  // ----- NOTE: Cover helper static methods ---- //

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

  /** @type {object} */
  static get coverNames() {
    const statusEffects = STATUS_EFFECTS[game.system.id] || STATUS_EFFECTS.generic;
    return {
      LOW: statusEffects.LOW.id,
      MEDIUM: statusEffects.MEDIUM.id,
      HIGH: statusEffects.HIGH.id
    };
  }

  /**
   * Retrieve from GM settings the cover effect for the provided type for this game system.
   * @param {string} type   LOW, MEDIUM, or HIGH
   * @returns {object} Status effect
   */
  static getCoverEffect(type = "LOW") {
    const allStatusEffects = this.get(SETTINGS.COVER.EFFECTS);
    const statusEffects = allStatusEffects[game.system.id] || allStatusEffects.generic;
    return statusEffects[type];
  }

  /**
   * Helper function to get the cover effect name from settings.
   * @param {string} type   LOW, MEDIUM, HIGH
   * @returns {string} Label for the cover effect
   */
  static getCoverName(type = "LOW") {
    if ( type === "NONE" ) return game.i18n.localize("None");
    if ( type === "TOTAL" ) return game.i18n.localize("tokenvisibility.phrases.Total");

    const effect = this.getCoverEffect(type);
    return game.i18n.localize(effect.name ?? effect.label);
  }

  /**
   * Store to GM settings the cover effect value provided for the provided type for this game system.
   * Also updates CONFIG.statusEffects array.
   * @param {string} type   LOW, MEDIUM, or HIGH
   * @param {object} value  Status effect
   */
  static async setCoverEffect(type, value) {
    const allStatusEffects = this.get(SETTINGS.COVER.EFFECTS);
    let systemId = game.system.id;
    if ( (systemId === "dnd5e" || systemId === "sw5e")
      && game.modules.get("midi-qol")?.active ) systemId = `${systemId}_midiqol`;

    if ( !Object.hasOwn(allStatusEffects, systemId) ) allStatusEffects[systemId] = duplicate(allStatusEffects.generic);

    allStatusEffects[systemId][type] = value;
    await this.set(SETTINGS.COVER.EFFECTS, allStatusEffects);
    this.updateConfigStatusEffects(type);
  }

  /**
   * Confirm if DFred's has the given cover type.
   * @param {"LOW"|"MEDIUM"|"HIGH"} key
   * @returns {boolean}
   */
  static dFredsHasCover(key) {
    if ( !MODULES_ACTIVE.DFREDS_CE ) return false;
    return Boolean(game.dfreds.effectInterface.findEffectByName(COVER.DFRED_NAMES[key]));
  }

  /**
   * Update the CONFIG.statusEffects array with the provided type, taken from GM settings.
   * @type {string} type    LOW, MEDIUM, or HIGH. If not defined, will update all three.
   */
  static updateConfigStatusEffects(type) {
    // Skip if using DFred's CE
    if ( this.dFredsHasCover(type) ) return;

    if ( !type ) {
      // Update all types
      this.updateConfigStatusEffects("LOW");
      this.updateConfigStatusEffects("MEDIUM");
      this.updateConfigStatusEffects("HIGH");
      return;
    }

    const coverEffect = this.getCoverEffect(type);
    coverEffect.id = `${MODULE_ID}.cover.${type}`;
    const currIdx = CONFIG.statusEffects.findIndex(effect => effect.id === coverEffect.id);
    coverEffect.name ??= coverEffect.label ?? coverEffect.id; // Ensure name is always present.

    if ( !~currIdx ) CONFIG.statusEffects.push(coverEffect);
    else CONFIG.statusEffects[currIdx] = coverEffect;
  }

  // ---- NOTE: Settings static methods ---- //

  /**
   * Retrive a specific setting.
   * Cache the setting.  For caching to work, need to clean the cache whenever a setting below changes.
   * @param {string} key
   * @returns {*}
   */
  static get(key) {
    const cached = this.cache.get(key);
    if ( typeof cached !== "undefined" ) {
      const origValue = game.settings.get(MODULE_ID, key);
      if ( origValue !== cached ) {
        console.debug(`Settings cache fail: ${origValue} !== ${cached} for key ${key}`);
        return origValue;
      }

      return cached;

    }
    const value = game.settings.get(MODULE_ID, key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * Set a specific setting.
   * @param {string} key
   * @param {*} value
   * @returns {Promise<boolean>}
   */
  static async set(key, value) {
    this.cache.delete(key);
    return game.settings.set(MODULE_ID, key, value);
  }

  /**
   * Register a specific setting.
   * @param {string} key        Passed to registerMenu
   * @param {object} options    Passed to registerMenu
   */
  static register(key, options) { game.settings.register(MODULE_ID, key, options); }

  /**
   * Register a submenu.
   * @param {string} key        Passed to registerMenu
   * @param {object} options    Passed to registerMenu
   */
  static registerMenu(key, options) { game.settings.registerMenu(MODULE_ID, key, options); }

  /**
   * Register all settings
   */
  static registerAll() {
    const { KEYS, register, registerMenu } = this;
    const localize = key => game.i18n.localize(`${MODULE_ID}.settings.${key}`);
    const PT_TYPES = KEYS.POINT_TYPES;
    const RTYPES = [PT_TYPES.CENTER, PT_TYPES.FIVE, PT_TYPES.NINE];
    const PT_OPTS = KEYS.LOS.TARGET.POINT_OPTIONS;
    const LTYPES = foundry.utils.filterObject(KEYS.LOS.TARGET.TYPES, { POINTS: 0, AREA2D: 0, AREA3D: 0 });
    const losChoices = {};
    const ptChoices = {};
    const rangeChoices = {};
    Object.values(RTYPES).forEach(type => rangeChoices[type] = localize(type));
    Object.values(LTYPES).forEach(type => losChoices[type] = localize(type));
    Object.values(PT_TYPES).forEach(type => ptChoices[type] = localize(type));

    // ----- Main Settings Menu ----- //
    registerMenu(KEYS.SUBMENU, {
      name: localize(`${KEYS.SUBMENU}.Name`),
      label: localize(`${KEYS.SUBMENU}.Label`),
      icon: "fas fa-user-gear",
      type: SettingsSubmenu,
      restricted: true
    });

    // ----- NOTE: Menus (Cover effects) ----- //
    const skipCoverMenus = game.system.id === "sfrpg";
    const skipLowMenu = skipCoverMenus || this.dFredsHasCover("LOW");
    const skipMediumMenu = skipCoverMenus || this.dFredsHasCover("MEDIUM");
    const skipHighMenu = skipCoverMenus || this.dFredsHasCover("HIGH");

    if ( !skipLowMenu ) registerMenu(KEYS.COVER.MENU.LOW, {
      name: localize(`${KEYS.COVER.MENU.LOW}.Name`),
      label: localize(`${KEYS.COVER.MENU.LOW}.Label`),
      icon: "fas fa-shield-halved",
      type: LowCoverEffectConfig,
      restricted: true
    });

    if ( !skipMediumMenu ) registerMenu(KEYS.COVER.MENU.MEDIUM, {
      name: localize(`${KEYS.COVER.MENU.MEDIUM}.Name`),
      label: localize(`${KEYS.COVER.MENU.MEDIUM}.Label`),
      icon: "fas fa-shield-heart",
      type: MediumCoverEffectConfig,
      restricted: true
    });


    if ( !skipHighMenu ) game.settings.registerMenu(MODULE_ID, KEYS.COVER.MENU.HIGH, {
      name: localize(`${KEYS.COVER.MENU.HIGH}.Name`),
      hint: localize(`${KEYS.COVER.MENU.HIGH}.Hint`),
      label: localize(`${KEYS.COVER.MENU.HIGH}.Label`),
      icon: "fas fa-shield",
      type: HighCoverEffectConfig,
      restricted: true
    });

    // ---- NOTE: Trigger percentages ---- //
    const coverNames = this.coverNames;
    register(KEYS.COVER.TRIGGER_CENTER, {
      name: localize(`${KEYS.COVER.TRIGGER_CENTER}.Name`),
      hint: localize(`${KEYS.COVER.TRIGGER_CENTER}.Hint`),
      scope: "world",
      config: true,
      default: coverNames.MEDIUM,
      type: String,
      choices: {
        LOW: coverNames.LOW,
        MEDIUM: coverNames.MEDIUM,
        HIGH: coverNames.HIGH
      }
    });

    register(KEYS.COVER.TRIGGER_PERCENT.LOW, {
      name: localize(`${KEYS.COVER.TRIGGER_PERCENT.LOW}.Name`),
      hint: localize(`${KEYS.COVER.TRIGGER_PERCENT.LOW}.Hint`),
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

    game.settings.register(MODULE_ID, KEYS.COVER.TRIGGER_PERCENT.MEDIUM, {
      name: localize(`${KEYS.COVER.TRIGGER_PERCENT.MEDIUM}.Name`),
      hint: localize(`${KEYS.COVER.TRIGGER_PERCENT.MEDIUM}.Hint`),
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

    game.settings.register(MODULE_ID, KEYS.COVER.TRIGGER_PERCENT.HIGH, {
      name: localize(`${KEYS.COVER.TRIGGER_PERCENT.HIGH}.Name`),
      hint: localize(`${KEYS.COVER.TRIGGER_PERCENT.HIGH}.Hint`),
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

    register(KEYS.DEBUG, {
      name: localize(`${KEYS.DEBUG}.Name`),
      hint: localize(`${KEYS.DEBUG}.Hint`),
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: value => this.toggleDebugGraphics(value)
    });

    // ----- NOTE: Submenu ---- //

    // ----- NOTE: Line-of-sight viewer tab ----- //
    const VIEWER = KEYS.LOS.VIEWER;
    register(VIEWER.NUM_POINTS, {
      name: localize(`${VIEWER.NUM_POINTS}.Name`),
      hint: localize(`${VIEWER.NUM_POINTS}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: ptChoices,
      default: PT_TYPES.CENTER,
      tab: "losViewer"
    });

    register(VIEWER.INSET, {
      name: localize(`${VIEWER.INSET}.Name`),
      hint: localize(`${VIEWER.INSET}.Hint`),
      range: {
        max: 0.99,
        min: 0,
        step: 0.01
      },
      scope: "world",
      config: false,
      default: 0.75,
      type: Number,
      tab: "losViewer"
    });

    // ----- NOTE: Line-of-sight target tab ----- //
    const TARGET = KEYS.LOS.TARGET;
    register(TARGET.LARGE, {
      name: localize(`${TARGET.LARGE}.Name`),
      hint: localize(`${TARGET.LARGE}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      tab: "losTarget",
      onChange: value => this.losSettingChange(TARGET.LARGE, value)
    });

    register(TARGET.ALGORITHM, {
      name: localize(`${TARGET.ALGORITHM}.Name`),
      hint: localize(`${TARGET.ALGORITHM}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: losChoices,
      default: LTYPES.NINE,
      tab: "losTarget",
      onChange: value => this.losAlgorithmChange(TARGET.ALGORITHM, value)
    });

    register(PT_OPTS.NUM_POINTS, {
      name: localize(`${PT_OPTS.NUM_POINTS}.Name`),
      hint: localize(`${PT_OPTS.NUM_POINTS}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: ptChoices,
      default: PT_TYPES.NINE,
      tab: "losTarget",
      onChange: value => this.losSettingChange(PT_OPTS.NUM_POINTS, value)
    });

    register(PT_OPTS.INSET, {
      name: localize(`${PT_OPTS.INSET}.Name`),
      hint: localize(`${PT_OPTS.INSET}.Hint`),
      range: {
        max: 0.99,
        min: 0,
        step: 0.01
      },
      scope: "world",
      config: false, // () => getSetting(KEYS.LOS.ALGORITHM) !== LTYPES.POINTS,
      default: 0.75,
      type: Number,
      tab: "losTarget",
      onChange: value => this.losSettingChange(PT_OPTS.INSET, value)
    });

    register(PT_OPTS.POINTS3D, {
      name: localize(`${PT_OPTS.POINTS3D}.Name`),
      hint: localize(`${PT_OPTS.POINTS3D}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      tab: "losTarget",
      onChange: value => this.losSettingChange(PT_OPTS.POINTS3D, value)
    });

    // ----- NOTE: Workflow tab ----- //
    register(KEYS.COVER.COMBAT_AUTO, {
      name: localize(`${KEYS.COVER.COMBAT_AUTO}.Name`),
      hint: localize(`${KEYS.COVER.COMBAT_AUTO}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      tab: "workflow"
    });

    register(KEYS.COVER.CHAT, {
      name: localize(`${KEYS.COVER.CHAT}.Name`),
      hint: localize(`${KEYS.COVER.CHAT}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      tab: "workflow"
    });

    const MIDICHOICES = KEYS.COVER.MIDIQOL.COVERCHECK_CHOICES;
    const useCoverCheck = game.system.id === "dnd5e" || MODULES_ACTIVE.MIDI_QOL;
    if ( useCoverCheck ) {
      register(KEYS.COVER.MIDIQOL.COVERCHECK, {
        name: localize(`${KEYS.COVER.MIDIQOL.COVERCHECK}.Name`),
        hint: localize(`${KEYS.COVER.MIDIQOL.COVERCHECK}.Hint`),
        scope: "world",
        config: false,
        type: String,
        choices: {
          [MIDICHOICES.NONE]: localize(MIDICHOICES.NONE),
          [MIDICHOICES.USER]: localize(MIDICHOICES.USER),
          [MIDICHOICES.USER_CANCEL]: localize(MIDICHOICES.USER_CANCEL),
          [MIDICHOICES.GM]: localize(MIDICHOICES.GM),
          [MIDICHOICES.AUTO]: localize(MIDICHOICES.AUTO)
        },
        default: MIDICHOICES.NONE,
        tab: "workflow"
      });

      register(KEYS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED, {
        name: localize(`${KEYS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED}.Name`),
        hint: localize(`${KEYS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED}.Hint`),
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        tab: "workflow"
      });
    }

    // ----- NOTE: Other cover settings tab ----- //
    const LIVECHOICES = KEYS.COVER.LIVE_TOKENS.TYPES;
    register(KEYS.COVER.LIVE_TOKENS.ALGORITHM, {
      name: localize(`${KEYS.COVER.LIVE_TOKENS.ALGORITHM}.Name`),
      hint: localize(`${KEYS.COVER.LIVE_TOKENS.ALGORITHM}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: {
        [LIVECHOICES.NONE]: localize(LIVECHOICES.NONE),
        [LIVECHOICES.FULL]: localize(LIVECHOICES.FULL),
        [LIVECHOICES.HALF]: localize(LIVECHOICES.HALF)
      },
      default: LIVECHOICES.FULL,
      tab: "other"
    });

    register(KEYS.COVER.DEAD_TOKENS.ALGORITHM, {
      name: localize(`${KEYS.COVER.DEAD_TOKENS.ALGORITHM}.Name`),
      hint: localize(`${KEYS.COVER.DEAD_TOKENS.ALGORITHM}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      tab: "other"
    });

    register(KEYS.COVER.PRONE, {
      name: localize(`${KEYS.COVER.PRONE}.Name`),
      hint: localize(`${KEYS.COVER.PRONE}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: true,
      tab: "other"
    });

    register(KEYS.COVER.DEAD_TOKENS.ATTRIBUTE, {
      name: localize(`${KEYS.COVER.DEAD_TOKENS.ATTRIBUTE}.Name`),
      hint: localize(`${KEYS.COVER.DEAD_TOKENS.ATTRIBUTE}.Hint`),
      scope: "world",
      config: false,
      type: String,
      default: "system.attributes.hp.value",
      tab: "other"
    });

    register(KEYS.PRONE_STATUS_ID, {
      name: localize(`${KEYS.PRONE_STATUS_ID}.Name`),
      hint: localize(`${KEYS.PRONE_STATUS_ID}.Hint`),
      scope: "world",
      config: false,
      type: String,
      default: CONFIG.GeometryLib.proneStatusId || "prone",
      onChange: value => this.setProneStatusId(value),
      tab: "other"
    });


    // ----- NOTE: Hidden settings ----- //
    register(KEYS.AREA3D_USE_SHADOWS, {
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    register(KEYS.COVER.EFFECTS, {
      scope: "world",
      config: false,
      default: STATUS_EFFECTS
    });

    register(KEYS.WELCOME_DIALOG.v030, {
      scope: "world",
      config: false,
      default: false,
      type: Boolean
    });

    register(KEYS.MIGRATION.v032, {
      scope: "world",
      config: false,
      default: false,
      type: Boolean
    });

    register(KEYS.MIGRATION.v054, {
      scope: "world",
      config: false,
      default: false,
      type: Boolean
    });

    // ----- NOTE: Triggers based on starting settings ---- //
    // Start debug
    if ( this.get(this.KEYS.DEBUG) ) registerDebug();

    // Register the Area3D methods on initial load.
    if ( this.typesWebGL2.has(this.get(TARGET.ALGORITHM)) ) registerArea3d();

  }

  static typesWebGL2 = new Set([
    SETTINGS.LOS.TARGET.TYPES.AREA3D,
    SETTINGS.LOS.TARGET.TYPES.AREA3D_WEBGL2,
    SETTINGS.LOS.TARGET.TYPES.AREA3D_HYBRID]);

  static losAlgorithmChange(key, value) {
    this.cache.delete(key);
    if ( this.typesWebGL2.has(value) ) registerArea3d();
    canvas.tokens.placeables.forEach(token => token[MODULE_ID]?.coverCalc._updateAlgorithm());
  }

  static losSettingChange(key, _value) {
    this.cache.delete(key);
    canvas.tokens.placeables.forEach(token => token[MODULE_ID]?.coverCalc._updateConfigurationSettings());
  }

  static setProneStatusId(value) {
    CONFIG.GeometryLib.proneStatusId = value;
    if ( MODULES_ACTIVE.TOKEN_VISIBILITY) game.settings.set("tokenvisibility", SETTINGS.PRONE_STATUS_ID, value);
  }
}
