/* globals
game,
*/
"use strict";
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { Patcher } from "./Patcher.js";
import { MODULES_ACTIVE } from "./const.js";
import { WallGeometryHandler, TileGeometryHandler, TokenGeometryHandler } from "./LOS/Placeable3dGeometry.js";

import { PATCHES as PATCHES_ActiveEffect } from "./ActiveEffect.js";
import { PATCHES as PATCHES_Combat } from "./Combat.js";
import { PATCHES as PATCHES_Item } from "./Item.js";
import { PATCHES as PATCHES_SettingsConfig } from "./SettingsConfig.js";
import { PATCHES as PATCHES_Token } from "./Token.js";

// LOS
import { PATCHES as PATCHES_ConstrainedTokenBorder } from "./LOS/ConstrainedTokenBorder.js";
import { PATCHES as PATCHES_PointSourcePolygon } from "./LOS/PointSourcePolygon.js";
import { PATCHES as PATCHES_Tile } from "./LOS/Tile.js";
import { PATCHES as PATCHES_TokenLOS } from "./LOS/Token.js";
import { PATCHES as PATCHES_VisionSource } from "./LOS/VisionSource.js";
import { PATCHES as PATCHES_Wall } from "./LOS/Wall.js";

// Midiqol
import { PATCHES as PATCHES_Midiqol } from "./Midiqol.js";

const PATCHES = {
  ActiveEffect: PATCHES_ActiveEffect,
  Combat: PATCHES_Combat,
  ConstrainedTokenBorder: PATCHES_ConstrainedTokenBorder,
  DrawingConfig: PATCHES_DrawingConfig,
  Item: PATCHES_Item,
  PointSourcePolygon: PATCHES_PointSourcePolygon,
  SettingsConfig: PATCHES_SettingsConfig,
  Tile: PATCHES_Tile,
  Token: foundry.utils.mergeObject(PATCHES_Token, PATCHES_TokenLOS),
  VisionSource: PATCHES_VisionSource,
  Wall: PATCHES_Wall,

  Midiqol: PATCHES_Midiqol
};

export const PATCHER = new Patcher(PATCHES);

export function initializePatching() {
  PATCHER.registerGroup("BASIC");

  // If ATV is not active, handle the LOS patches needed to run the calculator.
  if ( !MODULES_ACTIVE.TOKEN_VISIBILITY ) {
    PATCHER.registerGroup("LOS");
    PATCHER.registerGroup("ConstrainedTokenBorder");
  }

  if ( MODULES_ACTIVE.LEVELS ) PATCHER.registerGroup("LEVELS");
  else PATCHER.registerGroup("NO_LEVELS");

  if ( game.system.id === "dnd5e" ) {
    if ( MODULES_ACTIVE.MIDI_QOL ) PATCHER.registerGroup("DND5E_MIDI")
    else PATCHER.registerGroup("DND5E_NO_MIDI");
  }

  if ( game.system.id === "sfrpg" ) PATCHER.registerGroup("sfrpg");

  if ( game.system.id !== "pf2e" ) PATCHER.registerGroup("NO_PF2E");
}
