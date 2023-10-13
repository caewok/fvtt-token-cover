/* globals
game,
Hooks
*/
"use strict";

import { MODULE_ID, COVER, DEBUG, setCoverIgnoreHandler } from "./const.js";

// Hooks and method registration
import { registerGeometry } from "./geometry/registration.js";
import { initializePatching, PATCHER } from "./patching.js";
import {
  registerSettings,
  updateConfigStatusEffects,
  getSetting,
  setSetting } from "./settings.js";

// For API
import * as bench from "./benchmark.js";
import * as util from "./util.js";

import { PlanePoints3d } from "./PlaceablesPoints/PlanePoints3d.js";
import { TokenPoints3d } from "./PlaceablesPoints/TokenPoints3d.js";
import { DrawingPoints3d } from "./PlaceablesPoints/DrawingPoints3d.js";
import { WallPoints3d } from "./PlaceablesPoints/WallPoints3d.js";
import { TilePoints3d } from "./PlaceablesPoints/TilePoints3d.js";
import { VerticalPoints3d } from "./PlaceablesPoints/VerticalPoints3d.js";
import { HorizontalPoints3d } from "./PlaceablesPoints/HorizontalPoints3d.js";

import { Area3d } from "./Area3d.js";
import { Area2d } from "./Area2d.js";
import { CoverCalculator, SOCKETS } from "./CoverCalculator.js";
import { ConstrainedTokenBorder } from "./ConstrainedTokenBorder.js";
import { CoverDialog } from "./CoverDialog.js";

import { Area3dPopout, area3dPopoutData } from "./Area3dPopout.js";

// Ignores Cover
import {
  IgnoresCover,
  IgnoresCoverSimbuls,
  IgnoresCoverDND5e,
  addDND5eCoverFeatFlags } from "./IgnoresCover.js";

// Other self-executing hooks
import "./changelog.js";
import "./migration.js";

Hooks.once("init", function() {
  registerGeometry();
  initializePatching();
  addDND5eCoverFeatFlags();

  game.modules.get(MODULE_ID).api = {
    bench,
    Area2d,
    Area3d,
    util,
    CoverCalculator,
    CoverDialog,
    COVER,
    ConstrainedTokenBorder,
    PlanePoints3d,
    TokenPoints3d,
    DrawingPoints3d,
    WallPoints3d,
    TilePoints3d,
    VerticalPoints3d,
    HorizontalPoints3d,
    setCoverIgnoreHandler,
    SOCKETS,
    getSetting,
    setSetting,

    IgnoresCoverClasses: {
      IgnoresCover,
      IgnoresCoverDND5e,
      IgnoresCoverSimbuls
    },

    Area3dPopout,
    area3dPopoutData,

    PATCHER,

    debug: DEBUG
  };

  if ( game.system.id === "dnd5e" ) {
    setCoverIgnoreHandler(game.modules.get("simbuls-cover-calculator")?.active ? IgnoresCoverSimbuls : IgnoresCoverDND5e);
  }
});

Hooks.once("setup", function() {
  registerSettings();
  updateConfigStatusEffects();
});


/**
 * Tell DevMode that we want a flag for debugging this module.
 * https://github.com/League-of-Foundry-Developers/foundryvtt-devMode
 */
Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(MODULE_ID);
});
