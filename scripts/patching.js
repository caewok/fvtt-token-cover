/* globals
canvas,
foundry,
game,
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { Patcher } from "./Patcher.js";
import { OTHER_MODULES } from "./const.js";

import { Settings, PATCHES_SidebarTab, PATCHES_ItemDirectory } from "./settings.js";
import { PATCHES as PATCHES_ActiveEffect } from "./ActiveEffect.js";
import { PATCHES as PATCHES_ActiveEffectConfig } from "./ActiveEffectConfig.js";
import { PATCHES as PATCHES_Combat } from "./Combat.js";
import { PATCHES as PATCHES_Item } from "./Item.js";
import { PATCHES as PATCHES_Token } from "./Token.js";
import { PATCHES as PATCHES_ItemSheet } from "./ItemSheet.js";

// Dnd5e
import { PATCHES as PATCHES_AttackActivity } from "./AttackActivity.js";

// Midiqol
import { PATCHES as PATCHES_Midiqol } from "./Midiqol.js";

// Settings
import { PATCHES as PATCHES_ClientSettings } from "./ModuleSettingsAbstract.js";

// Token configuration
import { PATCHES as PATCHES_TokenConfig } from "./TokenConfig.js";

// Templates
import { PATCHES as PATCHES_MeasuredTemplate } from "./MeasuredTemplate.js";
import { TokenCover } from "./TokenCover.js";
import { PATCHES as PATCHES_dnd5e } from "./dnd5e.js";

const PATCHES = {
  ActiveEffect: PATCHES_ActiveEffect,
  ActiveEffectConfig: PATCHES_ActiveEffectConfig,
  "CONFIG.DND5E.activityTypes.attack.documentClass": PATCHES_AttackActivity,
  ClientSettings: PATCHES_ClientSettings,
  Combat: PATCHES_Combat,
  Item: PATCHES_Item,
  ItemDirectory: PATCHES_ItemDirectory,
  ItemSheet: PATCHES_ItemSheet,
  MeasuredTemplate: PATCHES_MeasuredTemplate,
  SidebarTab: PATCHES_SidebarTab,
  Token: PATCHES_Token,
  TokenConfig: PATCHES_TokenConfig,

  // Only works b/c these are all hooks. Otherwise, would need class breakdown.
  Midiqol: PATCHES_Midiqol,
  dnd5e: PATCHES_dnd5e
};

export const PATCHER = new Patcher();


export function initializePatching() {
  PATCHER.addPatchesFromRegistrationObject(PATCHES); // So lookupByClassName works
  PATCHER.registerGroup("BASIC");
  PATCHER.registerGroup("TILE");
  PATCHER.registerGroup("COVER_EFFECT");
  PATCHER.registerGroup("TEMPLATES");

  // If ATV is not active, handle the LOS patches needed to run the calculator.
  if ( !OTHER_MODULES.TOKEN_VISIBILITY ) PATCHER.registerGroup("LOS");

  //   If ( OTHER_MODULES.LEVELS ) PATCHER.registerGroup("LEVELS");
  //   else PATCHER.registerGroup("NO_LEVELS");

  if ( game.system.id === "dnd5e" ) {
    if ( OTHER_MODULES.MIDI_QOL ) PATCHER.registerGroup("DND5E_MIDI");
    else PATCHER.registerGroup("DND5E");
  }

  if ( game.system.id === "sfrpg" ) PATCHER.registerGroup("sfrpg");

  if ( game.system.id !== "pf2e" ) PATCHER.registerGroup("NO_PF2E");

  if ( game.system.id === "sfrpg" || game.system.id === "pf2e" ) PATCHER.registerGroup("COVER_ITEM");

  if ( Settings.get(Settings.KEYS.ONLY_COVER_ICONS) ) PATCHER.registerGroup("COVER_FLAGS");
}

export function registerDebug() { PATCHER.registerGroup("DEBUG"); }

export function deregisterDebug() { PATCHER.deregisterGroup("DEBUG"); }

export function registerTemplates() { PATCHER.registerGroup("TEMPLATES"); }

export function deregisterTemplates() {
  canvas.templates.placeables.forEach(t => TokenCover.removeAttacker(t));
  PATCHER.deregisterGroup("TEMPLATES");
}
