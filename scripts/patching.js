/* globals
foundry,
game,
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { Patcher } from "./Patcher.js";
import { MODULES_ACTIVE } from "./const.js";
import { WallGeometryHandler, TileGeometryHandler, TokenGeometryHandler } from "./LOS/Placeable3dGeometry.js";
import { Settings } from "./Settings.js";

import { PATCHES_SidebarTab, PATCHES_ItemDirectory } from "./settings.js";
import { PATCHES as PATCHES_ActiveEffect } from "./ActiveEffect.js";
import { PATCHES as PATCHES_ActiveEffectConfig } from "./ActiveEffectConfig.js";
import { PATCHES as PATCHES_Combat } from "./Combat.js";
import { PATCHES as PATCHES_Item } from "./Item.js";
import { PATCHES as PATCHES_Token } from "./Token.js";
import { PATCHES as PATCHES_ItemSheet } from "./ItemSheet.js";

// LOS
import { PATCHES as PATCHES_PointSourcePolygon } from "./LOS/PointSourcePolygon.js";
import { PATCHES as PATCHES_Tile } from "./LOS/Tile.js";
import { PATCHES as PATCHES_TokenLOS } from "./LOS/Token.js";
import { PATCHES as PATCHES_Wall } from "./LOS/Wall.js";

// Midiqol
import { PATCHES as PATCHES_Midiqol } from "./Midiqol.js";

// Settings
import { PATCHES as PATCHES_ClientSettings } from "./ModuleSettingsAbstract.js";

// Token configuration
import { PATCHES as PATCHES_TokenConfig } from "./TokenConfig.js";

const PATCHES = {
  ActiveEffect: PATCHES_ActiveEffect,
  ActiveEffectConfig: PATCHES_ActiveEffectConfig,
  ClientSettings: PATCHES_ClientSettings,
  Combat: PATCHES_Combat,
  Item: PATCHES_Item,
  ItemDirectory: PATCHES_ItemDirectory,
  ItemSheet: PATCHES_ItemSheet,
  SidebarTab: PATCHES_SidebarTab,
  PointSourcePolygon: PATCHES_PointSourcePolygon,
  Tile: PATCHES_Tile,
  Token: foundry.utils.mergeObject(PATCHES_Token, PATCHES_TokenLOS),
  TokenConfig: PATCHES_TokenConfig,
  Wall: PATCHES_Wall,

  Midiqol: PATCHES_Midiqol
};

export const PATCHER = new Patcher();


export function initializePatching() {
  PATCHER.addPatchesFromRegistrationObject(PATCHES); // So lookupByClassName works
  PATCHER.registerGroup("BASIC");
  PATCHER.registerGroup("TILE");
  PATCHER.registerGroup("COVER_EFFECT");

  // If ATV is not active, handle the LOS patches needed to run the calculator.
  if ( !MODULES_ACTIVE.TOKEN_VISIBILITY ) PATCHER.registerGroup("LOS");

//   if ( MODULES_ACTIVE.LEVELS ) PATCHER.registerGroup("LEVELS");
//   else PATCHER.registerGroup("NO_LEVELS");

  if ( game.system.id === "dnd5e" ) {
    if ( MODULES_ACTIVE.MIDI_QOL ) PATCHER.registerGroup("DND5E_MIDI")
    else PATCHER.registerGroup("DND5E_NO_MIDI");
  }

  if ( game.system.id === "sfrpg" ) PATCHER.registerGroup("sfrpg");

  if ( game.system.id !== "pf2e" ) PATCHER.registerGroup("NO_PF2E");

  if ( game.system.id === "sfrpg" || game.system.id === "pf2e" ) PATCHER.registerGroup("COVER_ITEM");

  if ( game.modules.get("dfreds-convenient-effects")?.active ) PATCHER.registerGroup("DFREDS");

  if ( Settings.get(Settings.KEYS.ONLY_COVER_ICONS) ) PATCHER.registerGroup("COVER_FLAGS");
}

export function registerArea3d() {
  if ( MODULES_ACTIVE.TOKEN_VISIBILITY ) {
    // Use the ATV hooks instead, to avoid potentially updating twice.
    const api = game.modules.get("tokenvisibility").api;
    api.PATCHER.registerGroup("AREA3D");
    return;
  }

  PATCHER.registerGroup("AREA3D");

  // Create placeable geometry handlers for placeables already in the scene.
  WallGeometryHandler.registerPlaceables();
  TileGeometryHandler.registerPlaceables();
  TokenGeometryHandler.registerPlaceables();
}

export function registerDebug() { PATCHER.registerGroup("DEBUG"); }

export function deregisterDebug() { PATCHER.deregisterGroup("DEBUG"); }
