/* globals
game,
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { Patcher } from "./Patcher.js";
import { MODULES_ACTIVE } from "./const.js";

import { PATCHES as PATCHES_ActiveEffect } from "./ActiveEffect.js";
import { PATCHES as PATCHES_CanvasVisibility } from "./CanvasVisibility.js";
import { PATCHES as PATCHES_Combat } from "./Combat.js";
import { PATCHES as PATCHES_ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import { PATCHES as PATCHES_DetectionMode } from "./DetectionMode.js";
import { PATCHES as PATCHES_DrawingConfig} from "./DrawingConfig.js";
import { PATCHES as PATCHES_Item } from "./Item.js";
import { PATCHES as PATCHES_LightSource } from "./LightSource.js";
import { PATCHES as PATCHES_PointSourcePolygon } from "./PointSourcePolygon.js";
import { PATCHES as PATCHES_Setting } from "./Setting.js";
import { PATCHES as PATCHES_SettingsConfig } from "./SettingsConfig.js";
import { PATCHES as PATCHES_Token } from "./Token.js";

// Midiqol
import { PATCHES as PATCHES_Midiqol } from "./Midiqol.js";

const PATCHES = {
  ActiveEffect: PATCHES_ActiveEffect,
  CanvasVisibility: PATCHES_CanvasVisibility,
  Combat: PATCHES_Combat,
  ConstrainedTokenBorder: PATCHES_ConstrainedTokenBorder,
  DetectionMode: PATCHES_DetectionMode,
  DrawingConfig: PATCHES_DrawingConfig,
  Item: PATCHES_Item,
  LightSource: PATCHES_LightSource,
  PointSourcePolygon: PATCHES_PointSourcePolygon,
  Setting: PATCHES_Setting,
  SettingsConfig: PATCHES_SettingsConfig,
  Token: PATCHES_Token,
  Midiqol: PATCHES_Midiqol
};

export const PATCHER = new Patcher(PATCHES);

export function initializePatching() {
  PATCHER.registerGroup("BASIC");
  PATCHER.registerGroup("ConstrainedTokenBorder");

  if ( MODULES_ACTIVE.LEVELS ) PATCHER.registerGroup("LEVELS");
  else PATCHER.registerGroup("NO_LEVELS");

  if ( game.system.id === "dnd5e" ) {
    if ( MODULES_ACTIVE.MIDI_QOL ) PATCHER.registerGroup("DND5E_MIDI")
    else PATCHER.registerGroup("DND5E_NO_MIDI");
  }

  if ( game.system.id === "sfrpg" ) PATCHER.registerGroup("sfrpg");

  if ( game.system.id !== "pf2e" ) PATCHER.registerGroup("NOT_PF2E");
}
