/* globals
canvas,
foundry,
game,
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { Patcher } from "./Patcher.js";
import { OTHER_MODULES } from "./const.js";
import { Settings } from "./settings.js";

import { PATCHES as PATCHES_Canvas } from "./Canvas.js";
import { PATCHES as PATCHES_Combat } from "./Combat.js";
import { PATCHES as PATCHES_Token } from "./Token.js";

// Dnd5e
import { PATCHES as PATCHES_AttackActivity } from "./AttackActivity.js";

// Midiqol
import { PATCHES as PATCHES_Midiqol } from "./Midiqol.js";

// Settings
import { PATCHES as PATCHES_ClientSettings } from "./ModuleSettingsAbstract.js";

// Token configuration
import { PATCHES as PATCHES_TokenConfig } from "./TokenConfig.js";

// Templates
import { TokenCover } from "./TokenCover.js";
import { PATCHES as PATCHES_dnd5e } from "./dnd5e.js";

const PATCHES = {
  Canvas: PATCHES_Canvas,
  "foundry.helpers.ClientSettings": PATCHES_ClientSettings,
  Combat: PATCHES_Combat,
  "foundry.canvas.placeables.Token": PATCHES_Token,
  TokenConfig: PATCHES_TokenConfig,
};

const PATCHES_DND5E = {
  "CONFIG.DND5E.activityTypes.attack.documentClass": PATCHES_AttackActivity,

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
  if ( !OTHER_MODULES.ATV ) PATCHER.registerGroup("LOS");

  if ( game.system.id === "dnd5e" ) {
    PATCHER.addPatchesFromRegistrationObject(PATCHES_DND5E);
    if ( OTHER_MODULES.MIDI_QOL ) PATCHER.registerGroup("DND5E_MIDI");
    else PATCHER.registerGroup("DND5E");
  }

  if ( game.system.id === "sfrpg" ) PATCHER.registerGroup("sfrpg");

  if ( game.system.id !== "pf2e" ) PATCHER.registerGroup("NO_PF2E");

  if ( game.system.id === "sfrpg" || game.system.id === "pf2e" ) PATCHER.registerGroup("COVER_ITEM");
}

export function registerTemplates() { PATCHER.registerGroup("TEMPLATES"); }

export function deregisterTemplates() {
  canvas.templates.placeables.forEach(t => TokenCover.removeAttacker(t));
  PATCHER.deregisterGroup("TEMPLATES");
}
