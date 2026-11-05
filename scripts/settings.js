/* globals
canvas,
CONFIG,
foundry,
game,
Hooks,
readTextFromFile
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, OTHER_MODULES, FA_ICONS, SETTINGS, CONTROLS, ENUMS, MENUS, pointIndicesLabels } from "./const.js";
import { ModuleSettingsAbstract } from "./ModuleSettingsAbstract.js";
import { ATCSettingsSubmenu } from "./ATCSettingsSubmenu.js";
import { registerTemplates, deregisterTemplates } from "./patching.js";
import { TokenCover } from "./TokenCover.js";
import { renderTemplateSync } from "./geometry/util.js";
import { CoverDefinitionsConfig } from "./CoverDefinitionsConfig.js";
import { UniqueEffectDefinition } from "./UniqueEffectDefinition.js";

// LOS folder
import { ViewerLOS } from "./LOS/ViewerLOS.js";

export const PATCHES_SidebarTab = {};
export const PATCHES_ItemDirectory = {};
PATCHES_SidebarTab.BASIC = {};
PATCHES_ItemDirectory.BASIC = {};

const { ArrayField, SchemaField, StringField, NumberField, BooleanField } = foundry.data.fields;

/**
 * A fake settings menu that acts as a button; downloading on render and displaying nothing.
 */
class exportSettingsButton extends foundry.applications.api.ApplicationV2 {
  async render() {
    Settings.exportSettingsToJSON();
    const moduleName = game.i18n.localize(`${MODULE_ID}.name`);
    ui.notifications.notify(`The ${moduleName} settings have been downloaded to a JSON file.`);
  }
}

/**
 * Simple import dialog class for importing settings.
 */
class importSettingsDialog extends foundry.applications.api.DialogV2 {
  _initializeApplicationOptions(options) {
    const moduleName = game.i18n.localize(`${MODULE_ID}.name`);
    const content = renderTemplateSync("templates/apps/import-data.hbs", {
      hint1: `Replace ${moduleName} settings with those in a JSON file.`,
      hint2: "This cannot be undone!"
    });
    const importCallBack = async (_event, _button, dialog) => {
      const fileInput = dialog.getElementsByTagName("input")[0];
      if ( !fileInput ) return console.error(`${MODULE_ID}|Error with the dialog input form.`);
      const file = fileInput.files[0];
      if ( !file ) return ui.notifications.error("You did not upload a data file!");
      const json = await readTextFromFile(file);
      await Settings.importSettingsFromJSON(json);
      ui.notifications.notify(`${moduleName} settings updated.`);
    };
    options ??= {};
    options.window = { title: `${moduleName}|Import Settings` };
    options.content = content;
    options.buttons = [
      { action: "Replace", label: "Replace Settings", icon: "fas fa-file-import", callback: importCallBack },
      { action: "Cancel", label: "Cancel", icon: "fas fa-xmark", default: true }
    ];
    return super._initializeApplicationOptions(options);
  }
}

/**
 * One row = one cover level.
 * Source is either
 * - uuid: An ActiveEffect or Item the GM dragged in from a compendium or world
 * - statusId: A build-int system status (e.g., dnd5e's coverHalf)
 * Only the cover characteristics live here (threshold, icon). Mechanics stay in the source doc.
 */
const ruleField = new SchemaField({
  uuid: new StringField({ required: false, nullable: true, initial: null }),
  statusId: new StringField({ required: false, nullable: true, initial: null }),
  documentType: new StringField({ choices: ["ActiveEffect", "Item"], initial: "ActiveEffect" }),

  // Cached for display so the config app doesn't have to resolve compendium uuids to render.
  name: new StringField({ initial: "" }),
  img: new StringField({ initial: "icons/svg/shield.svg" }),

  // Characteristic: apply when cover is at least this percent (0-1).
  minPercent: new NumberField({ required: true, nullable: false, integer: false, min: 0, max: 1, initial: 0.5 }),
  displayIcon: new BooleanField({ initial: true }),
});

export const DEFAULT_PRESET_DEFINITIONS = [
  { statusId: "coverHalf", name: "Half Cover", minPercent: 0.5 },
  { statusId: "coverThreeQuarters", name: "Three-Quarters Cover", minPercent: 0.75 },
  { statusId: "coverTotal", name: "Total Cover", minPercent: 1 }
];


export class Settings extends ModuleSettingsAbstract {

  /** @type {object} */
  static KEYS = SETTINGS;

  /** @type {object} */
  static ENUMS = ENUMS;

  /** @type {object} */
  static CONTROLS = CONTROLS;

  /**
   * Register all settings
   */
  static registerAll() {
    const { KEYS, register, registerMenu, localize } = this;
    const PT_TYPES = ENUMS.POINT_TYPES;
    const RTYPES = [PT_TYPES.CENTER, PT_TYPES.FIVE, PT_TYPES.NINE];
    const PT_OPTS = KEYS.LOS.TARGET.POINT_OPTIONS;
    const LTYPES = ENUMS.ALGORITHM_TYPES;
    const losChoices = {};
    const ptChoices = {};
    const rangeChoices = {};

    const coverTypeUseChoices = {};
    const coverEffectUseChoices = {};
    const coverConfirmChoices = {};

    Object.values(RTYPES).forEach(type => rangeChoices[type] = localize(type));
    Object.values(LTYPES).forEach(type => losChoices[type] = localize(type));
    Object.values(PT_TYPES).forEach(type => ptChoices[type] = localize(type));

    Object.values(ENUMS.USE_CHOICES).forEach(type => coverTypeUseChoices[type] = localize(type));
    Object.values(ENUMS.USE_CHOICES).forEach(type => coverEffectUseChoices[type] = localize(type));
    Object.values(ENUMS.CONFIRM_CHOICES).forEach(type => coverConfirmChoices[type] = localize(type));

    // For most systems, no hooks set up into their attack sequence, so applying effects on attack is out.
    if ( game.system.id !== "dnd5e" ) {
      delete coverTypeUseChoices[ENUMS.USE_CHOICES.ATTACK];
      delete coverEffectUseChoices[ENUMS.USE_CHOICES.ATTACK];
    }

    // ----- Main Settings Menu ----- //
    registerMenu(MENUS.SUBMENU, {
      name: localize(`${MENUS.SUBMENU}.Name`),
      label: localize(`${MENUS.SUBMENU}.Label`),
      icon: FA_ICONS.MENUS.SUBMENU,
      type: ATCSettingsSubmenu,
      restricted: true
    });

    register(KEYS.COVER_DEFINITIONS, {
      scope: "world",
      config: false, // Edited only through the cover rules menu below.
      type: new ArrayField(ruleField),
      default: DEFAULT_PRESET_DEFINITIONS,
      onChange: async () => UniqueEffectDefinition.initialize()
    });

    registerMenu(MENUS.COVER_DEFINITIONS, {
      name: localize(`${MENUS.COVER_DEFINITIONS}.Name`),
      label: localize(`${MENUS.COVER_DEFINITIONS}.Label`),
      hint: localize(`${MENUS.COVER_DEFINITIONS}.Hint`),
      icon: FA_ICONS.MENUS.COVER_DEFINITIONS,
      type: CoverDefinitionsConfig,
      restricted: true,
    });

    /* Currently unused:
    registerMenu(MENUS.EXPORT_BUTTON, {
      name: localize(`${MENUS.EXPORT_BUTTON}.Name`),
      label: localize(`${MENUS.EXPORT_BUTTON}.Label`),
      icon: FA_ICONS.MENUS.EXPORT_BUTTON,
      type: exportSettingsButton,
      restricted: true
    });

    registerMenu(MENUS.IMPORT_BUTTON, {
      name: localize(`${MENUS.IMPORT_BUTTON}.Name`),
      label: localize(`${MENUS.IMPORT_BUTTON}.Label`),
      icon: FA_ICONS.MENUS.IMPORT_BUTTON,
      type: importSettingsDialog,
      restricted: true
    });
    */

    register(KEYS.DISPLAY_SECRET_COVER, {
      name: localize(`${KEYS.DISPLAY_SECRET_COVER}.Name`),
      hint: localize(`${KEYS.DISPLAY_SECRET_COVER}.Hint`),
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: _value => canvas.tokens.placeables.forEach(token => {
        token[MODULE_ID].updateCoverIconDisplay();
        CONFIG[MODULE_ID].CoverEffect.refreshTokenDisplay(token);
      })
    });

    register(KEYS.TEMPLATES_USE_COVER, {
      name: localize(`${KEYS.TEMPLATES_USE_COVER}.Name`),
      hint: localize(`${KEYS.TEMPLATES_USE_COVER}.Hint`),
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: value => value ? registerTemplates() : deregisterTemplates()
    });

    register(KEYS.DEBUG.LOS, {
      name: localize(`${KEYS.DEBUG.LOS}.Name`),
      hint: localize(`${KEYS.DEBUG.LOS}.Hint`),
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: value => Hooks.callAll(`${MODULE_ID}.losDebugLOSChanged`, value),
    });

    register(KEYS.BACKEND_MODE, {
      name: localize(`${KEYS.BACKEND_MODE}.Name`),
      hint: localize(`${KEYS.BACKEND_MODE}.Hint`),
      scope: "world",
      config: true,
      type: String,
      choices: {
        auto: localize(`${KEYS.BACKEND_MODE}.auto`),
        activeEffect: localize(`${KEYS.BACKEND_MODE}.activeEffect`),
      },
      default: "auto",
      requiresReload: true,
    });


    // ----- NOTE: Submenu ---- //

    // ----- NOTE: Line-of-sight viewer tab ----- //
    const VIEWER = KEYS.LOS.VIEWER;
    const PI = ViewerLOS.POINT_INDICES;
    register(VIEWER.POINTS, {
      name: localize(`${VIEWER.POINTS}.Name`),
      hint: localize(`${VIEWER.POINTS}.Hint`),
      scope: "world",
      config: false,
      tab: "losViewer",
      default: [PI.CENTER],
      type: new foundry.data.fields.SetField(new foundry.data.fields.StringField({
        required: true,
        blank: false,
        initial: 0,
        choices: pointIndicesLabels(MODULE_ID),
      })),
    });

    register(VIEWER.INSETS.TOP, {
      name: localize(`${VIEWER.INSETS.TOP}.Name`),
      hint: localize(`${VIEWER.INSETS.TOP}.Hint`),
      range: {
        max: 0.99,
        min: 0,
        step: 0.01
      },
      scope: "world",
      config: false,
      default: 0,
      type: Number,
      tab: "losViewer",
    });

    register(VIEWER.INSETS.BOTTOM, {
      name: localize(`${VIEWER.INSETS.BOTTOM}.Name`),
      hint: localize(`${VIEWER.INSETS.BOTTOM}.Hint`),
      range: {
        max: 0.99,
        min: 0,
        step: 0.01
      },
      scope: "world",
      config: false,
      default: 0,
      type: Number,
      tab: "losViewer",
    });

    register(VIEWER.INSETS.SIDES, {
      name: localize(`${VIEWER.INSETS.SIDES}.Name`),
      hint: localize(`${VIEWER.INSETS.SIDES}.Hint`),
      range: {
        max: 0.99,
        min: 0,
        step: 0.01
      },
      scope: "world",
      config: false,
      default: 0,
      type: Number,
      tab: "losViewer",
    });

    // ----- NOTE: Line-of-sight target tab ----- //
    const TARGET = KEYS.LOS.TARGET;

    register(TARGET.ALGORITHM, {
      name: localize(`${TARGET.ALGORITHM}.Name`),
      hint: localize(`${TARGET.ALGORITHM}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: losChoices,
      default: LTYPES.POINTS,
      tab: "losTarget",
      onChange: value => Hooks.callAll(`${MODULE_ID}.losAlgorithmChanged`, value),
    });

    register(TARGET.LARGE, {
      name: localize(`${TARGET.LARGE}.Name`),
      hint: localize(`${TARGET.LARGE}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      tab: "losTarget",
    });

    register(PT_OPTS.POINTS, {
      name: localize(`${PT_OPTS.POINTS}.Name`),
      hint: localize(`${PT_OPTS.POINTS}.Hint`),
      scope: "world",
      config: false,
      tab: "losTarget",
      default: [PI.CENTER],
      type: new foundry.data.fields.SetField(new foundry.data.fields.StringField({
        required: true,
        blank: false,
        initial: 0,
        choices: pointIndicesLabels(MODULE_ID),
      })),
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
    });

    // ----- NOTE: Workflow tab ----- //

    register(KEYS.COVER_EFFECTS.USE, {
      name: localize(`${KEYS.COVER_EFFECTS.USE}.Name`),
      hint: localize(`${KEYS.COVER_EFFECTS.USE}.Hint`),
      scope: "world",
      config: false,
      type: String,
      choices: coverEffectUseChoices,
      default: ENUMS.USE_CHOICES.NEVER,
      tab: "workflow",
      onChange: _value => TokenCover._forceUpdateAllTokenCover()
    });

    register(KEYS.COVER_EFFECTS.TARGETING, {
      name: localize(`${KEYS.COVER_EFFECTS.TARGETING}.Name`),
      hint: localize(`${KEYS.COVER_EFFECTS.TARGETING}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      tab: "workflow",
      onChange: _value => TokenCover._forceUpdateAllTokenCover()
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
        default: ENUMS.CONFIRM_CHOICES.AUTO,
        horizontalDivider: true,
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

    register(KEYS.COVER_EFFECTS.LIVE_TOKENS_BLOCK, {
      name: localize(`${KEYS.COVER_EFFECTS.LIVE_TOKENS_BLOCK}.Name`),
      hint: localize(`${KEYS.COVER_EFFECTS.LIVE_TOKENS_BLOCK}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      tab: "other",
    });

    register(KEYS.COVER_EFFECTS.DEAD_TOKENS_BLOCK, {
      name: localize(`${KEYS.COVER_EFFECTS.DEAD_TOKENS_BLOCK}.Name`),
      hint: localize(`${KEYS.COVER_EFFECTS.DEAD_TOKENS_BLOCK}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      tab: "other",
    });

    register(KEYS.COVER_EFFECTS.PRONE_TOKENS_BLOCK, {
      name: localize(`${KEYS.COVER_EFFECTS.PRONE_TOKENS_BLOCK}.Name`),
      hint: localize(`${KEYS.COVER_EFFECTS.PRONE_TOKENS_BLOCK}.Hint`),
      scope: "world",
      config: false,
      type: Boolean,
      default: false,
      tab: "other",
    });

    if ( !OTHER_MODULES.ATV ) {
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
        default: CONFIG.GeometryLib.CONFIG.proneMultiplier ?? 0.33, // Same as Wall Height
        tab: "other",
        onChange: value => CONFIG.GeometryLib.CONFIG.proneMultiplier = value
      });

      register(KEYS.PRONE_STATUS_ID, {
        name: localize(`${KEYS.PRONE_STATUS_ID}.Name`),
        hint: localize(`${KEYS.PRONE_STATUS_ID}.Hint`),
        scope: "world",
        config: false,
        type: String,
        default: CONFIG.GeometryLib.CONFIG.proneStatusId || "prone",
        tab: "other",
        onChange: value => CONFIG.GeometryLib.CONFIG.proneMultiplier = value
      });

      register(KEYS.TOKEN_HP_ATTRIBUTE, {
        name: localize(`${KEYS.TOKEN_HP_ATTRIBUTE}.Name`),
        hint: localize(`${KEYS.TOKEN_HP_ATTRIBUTE}.Hint`),
        scope: "world",
        config: false,
        type: String,
        default: "system.attributes.hp.value",
        tab: "other",
        onChange: value => CONFIG.GeometryLib.CONFIG.tokenHPId = value
      });


      // Make sure these are linked at the start.
      CONFIG.GeometryLib.CONFIG.proneMultiplier = this.get(KEYS.PRONE_MULTIPLIER);
      CONFIG.GeometryLib.CONFIG.proneStatusId = this.get(KEYS.PRONE_STATUS_ID);
      CONFIG.GeometryLib.CONFIG.tokenHPId = this.get(KEYS.TOKEN_HP_ATTRIBUTE);

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

    register(KEYS.COVER_EFFECTS.RULES, {
      scope: "world",
      config: false,
      default: {}
    });

    this.register(KEYS.UNIQUE_EFFECTS_FLAGS_DATA, {
      scope: "world",
      config: false,
      default: {}
    });

    register(KEYS.MIGRATION.v0100, {
      scope: "world",
      config: false,
      default: false,
      type: Boolean
    });
  }

  static migrate() {
    if ( !this.get(this.KEYS.MIGRATION.v0100) ) {
      let alg = this.get(this.KEYS.LOS.TARGET.ALGORITHM);
      switch ( alg ) {
        case "los-points": alg = "los-algorithm-points"; break;
        case "los-area-3d":
        case "los-area-3d-geometric": alg = "los-algorithm-geometric"; break;
        case "los-area-3d-hybrid": alg = "los-algorithm-hybrid"; break;
        case "los-webgl2": alg = "los-algorithm-webgl2"; break;
        case "los-webgpu": alg = "los-algorithm-webgpu"; break;
        case "los-webgpu-async": alg = "los-algorithm-webgpu-async"; break;
      }
      this.set(this.KEYS.LOS.TARGET.ALGORITHM, alg);
      this.set(this.KEYS.MIGRATION.v0100, true);
    }
  }

  // ----- NOTE: Cover rules menu ----- //

  /** @returns {UniqueEffectDefinition[]} All rules as stored. */
  static get coverDefinitions() { return Settings.get(Settings.KEYS.COVER_DEFINITIONS) || []; }

}


