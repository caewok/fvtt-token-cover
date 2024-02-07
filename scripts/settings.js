/* globals
canvas,
CONFIG,
duplicate,
foundry,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { ModuleSettingsAbstract } from "./ModuleSettingsAbstract.js";
import { MODULE_ID, MODULES_ACTIVE, COVER } from "./const.js";
import { STATUS_EFFECTS } from "./status_effects.js";
import { SettingsSubmenu } from "./SettingsSubmenu.js";
import { registerArea3d, registerDebug, deregisterDebug } from "./patching.js";
import {
  LowCoverEffectConfig,
  MediumCoverEffectConfig,
  HighCoverEffectConfig } from "./EnhancedEffectConfig.js";

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
  TOKEN_HP_ATTRIBUTE: "token-hp-attribute",

  PRONE_MULTIPLIER: "prone-multiplier",
  VISION_HEIGHT_MULTIPLIER: "vision-height-multiplier",

  DEAD_TOKENS_BLOCK: "dead-tokens-block",
  PRONE_TOKENS_BLOCK: "prone-tokens-block",

  LIVE_TOKENS: {
    ALGORITHM: "cover-token-live",
    // ATTRIBUTE: "cover-token-prone-attribute",
    TYPES: {
      NONE: "cover-token-live-none",
      HALF: "cover-token-live-half",
      FULL: "cover-token-live-full"
    }
  },

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

    COMBAT_AUTO: "cover-combat-auto",
    CHAT: "cover-chat-message"
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

  // Hidden settings
  AREA3D_USE_SHADOWS: "area3d-use-shadows", // For benchmarking and debugging for now.
  CHANGELOG: "changelog",
  ATV_SETTINGS_MESSAGE: "atv-settings-message",
};

export class Settings extends ModuleSettingsAbstract {

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
    const coverEffect = statusEffects[type];
    coverEffect.id = `${MODULE_ID}.cover.${type}`;
    coverEffect.name ??= coverEffect.label ?? coverEffect.id; // Ensure name is always present.
    return coverEffect;
  }

  /**
   * Helper function to get the cover effect name from settings.
   * @param {string} type   LOW, MEDIUM, HIGH
   * @returns {string} Label for the cover effect
   */
  static getCoverName(type = "LOW") {
    if ( type === "NONE" ) return game.i18n.localize("None");
    if ( type === "TOTAL" ) return game.i18n.localize(`${MODULE_ID}.phrases.Total`);

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
    const currIdx = CONFIG.statusEffects.findIndex(effect => effect.id === coverEffect.id);
    if ( !~currIdx ) CONFIG.statusEffects.push(coverEffect);
    else CONFIG.statusEffects[currIdx] = coverEffect;
  }

  /**
   * Register all settings
   */
  static registerAll() {
    const { KEYS, register, registerMenu, localize } = this;
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
      default: LTYPES.POINTS,
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

    const MIDICHOICES = KEYS.MIDIQOL.COVERCHECK_CHOICES;
    const useCoverCheck = game.system.id === "dnd5e" || MODULES_ACTIVE.MIDI_QOL;
    if ( useCoverCheck ) {
      register(KEYS.MIDIQOL.COVERCHECK, {
        name: localize(`${KEYS.MIDIQOL.COVERCHECK}.Name`),
        hint: localize(`${KEYS.MIDIQOL.COVERCHECK}.Hint`),
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

      register(KEYS.MIDIQOL.COVERCHECK_IF_CHANGED, {
        name: localize(`${KEYS.MIDIQOL.COVERCHECK_IF_CHANGED}.Name`),
        hint: localize(`${KEYS.MIDIQOL.COVERCHECK_IF_CHANGED}.Hint`),
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        tab: "workflow"
      });
    }

    // ----- NOTE: Other cover settings tab ----- //
    const LIVECHOICES = KEYS.LIVE_TOKENS.TYPES;
    register(KEYS.LIVE_TOKENS.ALGORITHM, {
      name: localize(`${KEYS.LIVE_TOKENS.ALGORITHM}.Name`),
      hint: localize(`${KEYS.LIVE_TOKENS.ALGORITHM}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: {
        [LIVECHOICES.NONE]: localize(LIVECHOICES.NONE),
        [LIVECHOICES.FULL]: localize(LIVECHOICES.FULL),
        [LIVECHOICES.HALF]: localize(LIVECHOICES.HALF)
      },
      default: LIVECHOICES.FULL,
      onChange: value => this.losSettingChange(KEYS.LIVE_TOKENS.ALGORITHM, value),
      tab: "other"
    });

    register(KEYS.DEAD_TOKENS_BLOCK, {
      name: localize(`${KEYS.DEAD_TOKENS_BLOCK}.Name`),
      hint: localize(`${KEYS.DEAD_TOKENS_BLOCK}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      onChange: value => this.losSettingChange(KEYS.DEAD_TOKENS_BLOCK, value),
      tab: "other"
    });

    register(KEYS.PRONE_TOKENS_BLOCK, {
      name: localize(`${KEYS.PRONE_TOKENS_BLOCK}.Name`),
      hint: localize(`${KEYS.PRONE_TOKENS_BLOCK}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      onChange: value => this.losSettingChange(KEYS.PRONE_TOKENS_BLOCK, value),
      tab: "other"
    });

    if ( !MODULES_ACTIVE.TOKEN_VISIBILITY ) {
      register(KEYS.PRONE_MULTIPLIER, {
        name: localize(`${KEYS.PRONE_MULTIPLIER}.Name`),
        hint: localize(`${KEYS.PRONE_MULTIPLIER}.Hint`),
        scope: "world",
        config: false,
        type: Number,
        range: {
          max: 1,  // Prone equivalent to standing.
          min: 0,  // Prone equivalent to (almost) not being there at all. Will set to a single pixel.
          step: 0.1
        },
        default: CONFIG.GeometryLib.proneMultiplier ?? 0.33, // Same as Wall Height
        tab: "other",
        horizontalDivider: true,
        onChange: value => CONFIG.GeometryLib.proneMultiplier = value
      });

      register(KEYS.VISION_HEIGHT_MULTIPLIER, {
        name: localize(`${KEYS.VISION_HEIGHT_MULTIPLIER}.Name`),
        hint: localize(`${KEYS.VISION_HEIGHT_MULTIPLIER}.Hint`),
        scope: "world",
        config: false,
        type: Number,
        range: {
          max: 1,  // At token top.
          min: 0,  // At token bottom.
          step: 0.1
        },
        default: CONFIG.GeometryLib.visionHeightMultiplier ?? 0.9,
        tab: "other",
        onChange: value => CONFIG.GeometryLib.visionHeightMultiplier = value
      });

      register(KEYS.PRONE_STATUS_ID, {
        name: localize(`${KEYS.PRONE_STATUS_ID}.Name`),
        hint: localize(`${KEYS.PRONE_STATUS_ID}.Hint`),
        scope: "world",
        config: false,
        type: String,
        default: CONFIG.GeometryLib.proneStatusId || "prone",
        tab: "other",
        onChange: value => CONFIG.GeometryLib.proneMultiplier = value
      });

      register(KEYS.TOKEN_HP_ATTRIBUTE, {
        name: localize(`${KEYS.TOKEN_HP_ATTRIBUTE}.Name`),
        hint: localize(`${KEYS.TOKEN_HP_ATTRIBUTE}.Hint`),
        scope: "world",
        config: false,
        type: String,
        default: "system.attributes.hp.value",
        tab: "other",
        onChange: value => CONFIG.GeometryLib.tokenHPId = value
      });


      // Make sure these are linked at the start.
      CONFIG.GeometryLib.proneMultiplier = this.get(KEYS.PRONE_MULTIPLIER);
      CONFIG.GeometryLib.visionHeightMultiplier = this.get(KEYS.VISION_HEIGHT_MULTIPLIER);
      CONFIG.GeometryLib.proneStatusId = this.get(KEYS.PRONE_STATUS_ID);
      CONFIG.GeometryLib.tokenHPId = this.get(KEYS.TOKEN_HP_ATTRIBUTE);

    } else {
      register(KEYS.ATV_SETTINGS_MESSAGE, {
        name: localize(`${KEYS.ATV_SETTINGS_MESSAGE}.Name`),
        hint: localize(`${KEYS.ATV_SETTINGS_MESSAGE}.Hint`),
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        // TODO: Open ATV settings? onChange: value => this.losSettingChange(KEYS.PRONE_TOKENS_BLOCK, value),
        tab: "other"
      });
    }

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

  static losSettingChange(key, value) {
    this.cache.delete(key);
    const cfg = { [key]: value };
    canvas.tokens.placeables.forEach(token => token[MODULE_ID]?.coverCalc._updateConfiguration(cfg));
  }

  static setProneStatusId(value) {
    CONFIG.GeometryLib.proneStatusId = value;
    if ( MODULES_ACTIVE.TOKEN_VISIBILITY) game.settings.set("tokenvisibility", SETTINGS.PRONE_STATUS_ID, value);
  }
}
