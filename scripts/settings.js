/* globals
canvas,
CONFIG,
foundry,
game,
readTextFromFile
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, OTHER_MODULES, FA_ICONS, SETTINGS, CONTROLS, ENUMS, MENUS } from "./const.js";
import { registerLOSSettings } from "./LOS/settings.js";
import { ModuleSettingsAbstract } from "./ModuleSettingsAbstract.js";
import { ATCSettingsSubmenu } from "./ATCSettingsSubmenu.js";
import { registerTemplates, deregisterTemplates } from "./patching.js";
import { TokenCover } from "./TokenCover.js";
import { renderTemplateSync } from "./geometry/util.js";
import { CoverDefinitionsConfig } from "./CoverDefinitionsConfig.js";
import { UniqueEffectDefinition } from "./UniqueEffectDefinition.js";
import { TokenEffects } from "./TokenEffects.js";

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
    const { KEYS, registerMenu, localize } = this;
    const coverTypeUseChoices = {};
    const coverEffectUseChoices = {};
    const coverConfirmChoices = {};

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

    // Edited only through the cover rules menu below.
    this.registerHidden(KEYS.COVER_DEFINITIONS, {
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

    this.registerWorld(KEYS.DISPLAY_SECRET_COVER, {
      type: Boolean,
      default: true,
      onChange: _value => canvas.tokens.placeables.forEach(token => {
        token[MODULE_ID].updateCoverIconDisplay();
        TokenEffects.refreshTokenDisplay(token);
      })
    });

    this.registerWorld(KEYS.TEMPLATES_USE_COVER, {
      type: Boolean,
      default: true,
      onChange: value => value ? registerTemplates() : deregisterTemplates()
    });

    this.registerWorld(KEYS.BACKEND_MODE, {
      type: String,
      choices: {
        auto: localize(`${KEYS.BACKEND_MODE}.auto`),
        activeEffect: localize(`${KEYS.BACKEND_MODE}.activeEffect`),
      },
      default: "auto",
      requiresReload: true,
    });


    // ----- NOTE: Submenu ---- //

    // Do not use large target for now, until fixed.
    registerLOSSettings(MODULE_ID, this, { threshold: false, largeTarget: false, tokenModifiers: !OTHER_MODULES.ATV });


    // ----- NOTE: Workflow tab ----- //

    this.registerSubmenuSetting(KEYS.COVER_EFFECTS.USE, "workflow", {
      type: String,
      choices: coverEffectUseChoices,
      default: ENUMS.USE_CHOICES.NEVER,
      onChange: _value => TokenCover._forceUpdateAllTokenCover()
    });

    this.registerSubmenuSetting(KEYS.COVER_EFFECTS.TARGETING, "workflow", {
      type: Boolean,
      default: false,
      onChange: _value => TokenCover._forceUpdateAllTokenCover()
    });

    if ( game.system.id === "dnd5e" ) {
      this.registerSubmenuSetting(KEYS.COVER_WORKFLOW.CHAT, "workflow", {
        type: Boolean,
        default: false,
      });

      this.registerSubmenuSetting(KEYS.COVER_WORKFLOW.CONFIRM, "workflow", {
        type: String,
        choices: coverConfirmChoices,
        default: ENUMS.CONFIRM_CHOICES.AUTO,
        horizontalDivider: true,
      });

      this.registerSubmenuSetting(KEYS.COVER_WORKFLOW.CONFIRM_NO_COVER, "workflow", {
        type: Boolean,
        default: false,
      });

      this.registerSubmenuSetting(KEYS.COVER_WORKFLOW.CONFIRM_CHANGE_ONLY, "workflow", {
        type: Boolean,
        default: false,
      });
    }

    // ----- NOTE: Other cover settings tab ----- //

    if ( OTHER_MODULES.ATV ) {
      this.registerSubmenuSetting(KEYS.ATV_SETTINGS_MESSAGE, "other", {
        type: Boolean,
        default: false,
      });
    }

    // ----- NOTE: Hidden settings ----- //
    this.registerHidden(KEYS.COVER_EFFECTS.DATA, {
      default: {}
    });

    this.registerHidden(KEYS.COVER_EFFECTS.RULES, {
      default: {}
    });

    this.registerHidden(KEYS.UNIQUE_EFFECTS_FLAGS_DATA, {
      default: {}
    });

    this.registerHidden(KEYS.MIGRATION.v0100, {
      default: false,
      type: Boolean
    });
  }

  static migrate() {
    if ( !game.user.isGM ) return;
    if ( !this.get(this.KEYS.MIGRATION.v0100) ) {
      let alg = this.get(this.KEYS.LOS.TARGET.ALGORITHM);
      switch ( alg ) {
        // If current, can ignore.
        case "los-algorithm-points":
        case "los-algorithm-per-pixel":
        case "los-algorithm-geometric":
        case "los-algorithm-webgl2": return;

        // Points
        case "los-points": alg = "los-algorithm-points"; break;

        // Geometric
        case "los-area-3d":
        case "los-area-3d-geometric": alg = "los-algorithm-geometric"; break;

        // WebGL2
        case "los-area-3d-hybrid":
        case "los-algorithm-hybrid":
        case "los-webgl2":
        case "los-webgpu":
        case "los-algorithm-webgpu":
        case "los-webgpu-async":
        case "los-algorithm-webgpu-async": alg = "los-algorithm-webgl2"; break;

        default: alg = "los-algorithm-points";
      }
      this.set(this.KEYS.LOS.TARGET.ALGORITHM, alg);
      this.set(this.KEYS.MIGRATION.v0100, true);
    }
  }

  // ----- NOTE: Cover rules menu ----- //

  /** @returns {UniqueEffectDefinition[]} All rules as stored. */
  static get coverDefinitions() { return Settings.get(Settings.KEYS.COVER_DEFINITIONS) || []; }

}


