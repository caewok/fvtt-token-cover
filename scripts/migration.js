/* globals
Hooks,
game,
canvas
*/
"use strict";

// Migrations from older data.

import { MODULE_ID, MODULES_ACTIVE, FLAGS, setCoverIgnoreHandler } from "./const.js";
import { getSetting, SETTINGS, setSetting, updateConfigStatusEffects } from "./settings.js";
import {
  IgnoresCover,
  IgnoresCoverSimbuls,
  IgnoresCoverDND5e } from "./IgnoresCover.js";

Hooks.once("ready", async function() {
  // Version 0.3.2: "ignoreCover" flag becomes "ignoreCoverAll"
  await migrateIgnoreCoverFlag();
  await migrateCoverStatusData();

  // Set the ignores cover handler based on what systems and modules are active
  const handler = MODULES_ACTIVE.SIMBULS_CC ? IgnoresCoverSimbuls
    : game.system.id === "dnd5e" ? IgnoresCoverDND5e : IgnoresCover;

  setCoverIgnoreHandler(handler);
});


/**
 * Cover flag was originally "ignoreCover".
 * As of v0.3.2, all, mwak, etc. were introduced. So migrate the "ignoreCover" to "ignoreCoverAll"
 */
async function migrateIgnoreCoverFlag() {
  if ( getSetting(SETTINGS.MIGRATION.v032) ) return;

  // Confirm that actor flags are updated to newest version
  // IGNORE: "ignoreCover" --> "ignoreCoverAll"
  game.actors.forEach(a => {
    const allCover = a.getFlag(MODULE_ID, "ignoreCover");
    if ( allCover ) {
      a.setFlag(MODULE_ID, FLAGS.COVER.IGNORE.ALL, allCover);
      a.unsetFlag(MODULE_ID, "ignoreCover");
    }
  });

  // Unlinked tokens may not otherwise get updated.
  canvas.tokens.placeables.forEach(t => {
    const allCover = t.actor.getFlag(MODULE_ID, "ignoreCover");
    if ( allCover ) {
      t.actor.setFlag(MODULE_ID, FLAGS.COVER.IGNORE.ALL, allCover);
      t.actor.unsetFlag(MODULE_ID, "ignoreCover");
    }
  });

  await setSetting(SETTINGS.MIGRATION.v032, true);
}

async function migrateCoverStatusData() {
  if ( getSetting(SETTINGS.MIGRATION.v054) ) return;

  // Update config status effects.
  const allStatusEffects = getSetting(SETTINGS.COVER.EFFECTS);
  for ( const systemId of Object.keys(allStatusEffects) ) {
    const systemStatusEffects = allStatusEffects[systemId];
    for ( const type of Object.keys(systemStatusEffects) ) {
      const effectData = systemStatusEffects[type];

      if ( !effectData.name ) effectData.name = effectData.label;
      delete effectData.label;

      if ( !effectData.id ) effectData.id = effectData._id;
      delete effectData._id;

      switch ( systemId ) {
        case "generic":
          if ( type === "LOW" && effectData.name === "Low" ) effectData.name = "tokenvisibility.Cover.Low";
          if ( type === "MEDIUM" && effectData.name === "Medium" ) effectData.name = "tokenvisibility.Cover.Medium";
          if ( type === "HIGH" && effectData.name === "High" ) effectData.name = "tokenvisibility.Cover.High";
          break;
        case "dnd5e":
        case "dnd5e_midiqol":
          if ( type === "LOW" && effectData.name === "Half" ) effectData.name = "DND5E.CoverHalf";
          if ( type === "MEDIUM" && effectData.name === "Three-Quarters" ) effectData.name = "DND5E.CoverThreeQuarters";
          if ( type === "HIGH" && effectData.name === "Total" ) effectData.name = "DND5E.CoverTotal";
          break;
        case "pf2e":
          if ( type === "LOW" && effectData.name === "Lesser" ) effectData.name = "PF2E.Cover.Lesser";
          if ( type === "MEDIUM" && effectData.name === "Standard" ) effectData.name = "PF2E.Cover.Standard";
          if ( type === "HIGH" && effectData.name === "Greater" ) effectData.name = "PF2E.Cover.Greater";
          break;
      }
      allStatusEffects[systemId][type] = effectData;
    }
  }

  await setSetting(SETTINGS.COVER.EFFECTS, allStatusEffects);
  updateConfigStatusEffects();
  await setSetting(SETTINGS.MIGRATION.v054, true);
}
