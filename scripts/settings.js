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


const USE_CHOICES = {
  NEVER: "never",
  COMBAT: "combat",
  COMBATANT: "combatant",
  ATTACK: "attack",
  ALWAYS: "always"
};

const CONFIRM_CHOICES = {
  USER: "cover-workflow-confirm-user",
  USER_CANCEL: "cover-workflow-confirm-user-cancel",
  GM: "cover-workflow-confirm-gm",
  AUTO: "cover-workflow-confirm-automatic"
}

export const SETTINGS = {
  CONTROLS: {
    COVER_EFFECTS: "cover-effects-control"
  },

  SUBMENU: "submenu",

  COVER_TYPES: {
    USE: "use-cover-types",
    CHOICES: USE_CHOICES,
    DATA: "cover-types-data",
    TARGETING: "cover-types-targeting"
  },

  COVER_EFFECTS: {
    USE: "use-cover-effects",
    CHOICES: USE_CHOICES,
    DATA: "cover-effects-data",
    TARGETING: "cover-effects-targeting"
  },

  COVER_WORKFLOW: {
    CHAT: "cover-chat-message",
    CONFIRM: "cover-workflow-confirm",
    CONFIRM_CHANGE_ONLY: "cover-workflow-confirm-change-only",
    CONFIRM_NO_COVER: "cover-workflow-confirm-no-cover",
    CONFIRM_CHOICES,
  },

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
      if ( canvas.tokens?.placeables ) canvas.tokens.placeables
        .filter(t => t[MODULE_ID]?.coverCalc) // Don't create a new coverCalc here.
        .forEach(t => t.coverCalculator.clearDebug());
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

    const coverTypeUseChoices = {};
    const coverEffectUseChoices = {};
    const coverConfirmChoices = {};

    Object.values(RTYPES).forEach(type => rangeChoices[type] = localize(type));
    Object.values(LTYPES).forEach(type => losChoices[type] = localize(type));
    Object.values(PT_TYPES).forEach(type => ptChoices[type] = localize(type));

    Object.values(USE_CHOICES).forEach(type => coverTypeUseChoices[type] = localize(type));
    Object.values(USE_CHOICES).forEach(type => coverEffectUseChoices[type] = localize(type));
    Object.values(CONFIRM_CHOICES).forEach(type => coverConfirmChoices[type] = localize(type));

    // For most systems, no hooks set up into their attack sequence, so applying effects on attack is out.
    if ( game.system.id !== "dnd5e" ) {
      delete coverTypeUseChoices[USE_CHOICES.ATTACK];
      delete coverEffectUseChoices[USE_CHOICES.ATTACK];
    }

    register(KEYS.COVER_TYPES.USE, {
      name: localize(`${KEYS.COVER_TYPES.USE}.Name`),
      hint: localize(`${KEYS.COVER_TYPES.USE}.Hint`),
      scope: "user",
      config: true,
      type: String,
      choices: coverTypeUseChoices,
      default: KEYS.COVER_TYPES.CHOICES.ALWAYS,
      requiresReload: true // Otherwise, would need to clear all icons from all users.
    });

    register(KEYS.COVER_TYPES.TARGETING, {
      name: localize(`${KEYS.COVER_TYPES.TARGETING}.Name`),
      hint: localize(`${KEYS.COVER_TYPES.TARGETING}.Hint`),
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    // ----- Main Settings Menu ----- //
    registerMenu(KEYS.SUBMENU, {
      name: localize(`${KEYS.SUBMENU}.Name`),
      label: localize(`${KEYS.SUBMENU}.Label`),
      icon: "fas fa-user-gear",
      type: SettingsSubmenu,
      restricted: true
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

    register(KEYS.COVER_EFFECTS.USE, {
      name: localize(`${KEYS.COVER_EFFECTS.USE}.Name`),
      hint: localize(`${KEYS.COVER_EFFECTS.USE}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: coverEffectUseChoices,
      default: KEYS.COVER_EFFECTS.CHOICES.NEVER,
      tab: "workflow"
    });

    register(KEYS.COVER_EFFECTS.TARGETING, {
      name: localize(`${KEYS.COVER_EFFECTS.TARGETING}.Name`),
      hint: localize(`${KEYS.COVER_EFFECTS.TARGETING}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      tab: "workflow"
    });

    if ( game.system.id === "dnd5e" ) {
      register(KEYS.COVER_WORKFLOW.CHAT, {
        name: localize(`${KEYS.COVER_WORKFLOW.CHAT}.Name`),
        hint: localize(`${KEYS.COVER_WORKFLOW.CHAT}.Hint`),
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        tab: "workflow"
      });

      register(KEYS.COVER_WORKFLOW.CONFIRM, {
        name: localize(`${KEYS.COVER_WORKFLOW.CONFIRM}.Name`),
        hint: localize(`${KEYS.COVER_WORKFLOW.CONFIRM}.Hint`),
        scope: "world",
        config: false,
        type: String,
        choices: coverConfirmChoices,
        default: KEYS.COVER_WORKFLOW.CONFIRM_CHOICES.AUTO,
        tab: "workflow"
      });

      register(KEYS.COVER_WORKFLOW.CONFIRM_NO_COVER, {
        name: localize(`${KEYS.COVER_WORKFLOW.CONFIRM_NO_COVER}.Name`),
        hint: localize(`${KEYS.COVER_WORKFLOW.CONFIRM_NO_COVER}.Hint`),
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        tab: "workflow"
      });

      register(KEYS.COVER_WORKFLOW.CONFIRM_CHANGE_ONLY, {
        name: localize(`${KEYS.COVER_WORKFLOW.CONFIRM_CHANGE_ONLY}.Name`),
        hint: localize(`${KEYS.COVER_WORKFLOW.CONFIRM_CHANGE_ONLY}.Hint`),
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

    register(KEYS.COVER_EFFECTS.DATA, {
      scope: "world",
      config: false,
      default: {}
    });

    register(KEYS.COVER_TYPES.DATA, {
      scope: "world",
      config: false,
      default: {}
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
    canvas.tokens.placeables
      .filter(t => t[MODULE_ID]?.coverCalc) // Don't create a new coverCalc here.
      .forEach(token => token.coverCalculator._updateAlgorithm());
  }

  static losSettingChange(key, value) {
    this.cache.delete(key);
    const cfg = { [key]: value };
    canvas.tokens.placeables
      .filter(t => t[MODULE_ID]?.coverCalc) // Don't create a new coverCalc here.
      .forEach(token => token.coverCalculator._updateConfiguration(cfg));
  }

  static setProneStatusId(value) {
    CONFIG.GeometryLib.proneStatusId = value;
    if ( MODULES_ACTIVE.TOKEN_VISIBILITY) game.settings.set("tokenvisibility", SETTINGS.PRONE_STATUS_ID, value);
  }
}


