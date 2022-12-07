/* globals
duplicate
*/
"use strict";

export const MODULE_ID = "tokenvisibility";
export const EPSILON = 1e-08;

export const FLAGS = {
  DRAWING: { IS_HOLE: "isHole" },
  COVER: {
    IGNORE: {
      ALL: "ignoreCoverAll",
      MWAK: "ignoreCoverMWAK",
      MSAK: "ignoreCoverMSAK",
      RWAK: "ignoreCoverRWAK",
      RSAK: "ignoreCoverRSAK"
    },

    IGNORE_DND5E: "helpersIgnoreCover",
    SPELLSNIPER: "spellSniper",
    SHARPSHOOTER: "sharpShooter"
  }
};

export const COVER_TYPES = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  TOTAL: 4
};

export const MIN_COVER = Math.min(...Object.values(COVER_TYPES));
export const MAX_COVER = Math.max(...Object.values(COVER_TYPES));

export const MODULES_ACTIVE = {
  WALL_HEIGHT: false,
  PERFECT_VISION: false,
  LEVELS: false,
  DFREDS_CE: false,
  SIMBULS_CC: false,
  MIDI_QOL: false
};

// Hook init b/c game.modules is not initialized at start.
Hooks.once("init", function() {
  MODULES_ACTIVE.WALL_HEIGHT = game.modules.get("wall-height")?.active;
  MODULES_ACTIVE.PERFECT_VISION = game.modules.get("perfect-vision")?.active;
  MODULES_ACTIVE.LEVELS = game.modules.get("levels")?.active;
  MODULES_ACTIVE.DFREDS_CE = game.modules.get("dfreds-convenient-effects")?.active;
  MODULES_ACTIVE.SIMBULS_CC = game.modules.get("simbuls-cover-calculator")?.active;
  MODULES_ACTIVE.MIDI_QOL= game.modules.get("midi-qol")?.active;
});

/**
 * Helper to set the cover ignore handler and, crucially, update all tokens.
 */
function setCoverIgnoreHandler(handler) {
  if ( !(handler.prototype instanceof IgnoresCover ) ) {
    console.warn("setCoverIgnoreHandler: handler not recognized.");
    return;
  }

  game.modules.get(MODULE_ID).api.IGNORES_COVER_HANDLER = handler;

  // Simplest just to revert any existing.
  canvas.tokens.placeables.forEach(t => t._ignoresCoverType = undefined);
}

Hooks.once("canvasReady", async function() {
  // Version 0.3.2: "ignoreCover" flag becomes "ignoreCoverAll"
  migrateIgnoreCoverFlag();

  // Set the ignores cover handler based on what systems and modules are active
  const handler = MODULES_ACTIVE.SIMBULS_CC ? IgnoresCoverSimbuls
    : game.system.id === "dnd5e" ? IgnoresCoverDND5e : IgnoresCover;

  setCoverIgnoreHandler(handler);
});


/**
 * Cover flag was originally "ignoreCover".
 * As of v0.3.2, all, mwak, etc. were introduced. So migrate the "ignoreCover" to "ignoreCoverAll"
 */
function migrateIgnoreCoverFlag() {
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
}

// Default status effects for different systems.
export const STATUS_EFFECTS = {
  generic: {
    LOW: {
      id: `${MODULE_ID}.cover.LOW`,
      label: "Low",
      icon: `modules/${MODULE_ID}/assets/shield_low_gray.svg`
    },

    MEDIUM: {
      id: `${MODULE_ID}.cover.MEDIUM`,
      label: "Medium",
      icon: `modules/${MODULE_ID}/assets/shield_medium_gray.svg`
    },

    HIGH: {
      id: `${MODULE_ID}.cover.HIGH`,
      label: "High",
      icon: `modules/${MODULE_ID}/assets/shield_high_gray.svg`
    }
  }
};

STATUS_EFFECTS.dnd5e = duplicate(STATUS_EFFECTS.generic);
STATUS_EFFECTS.dnd5e.LOW.label = "Half";
STATUS_EFFECTS.dnd5e.MEDIUM.label = "Three-quarters";
STATUS_EFFECTS.dnd5e.HIGH.label = "Total";

STATUS_EFFECTS.dnd5e.LOW.changes = [
  {
    key: "system.attributes.ac.bonus",
    mode: 2,
    value: "+2"
  },

  {
    key: "system.attributes.dex.saveBonus",
    mode: 2,
    value: "+2"
  }
];


STATUS_EFFECTS.dnd5e.MEDIUM.changes = [
  {
    key: "system.attributes.ac.bonus",
    mode: 2,
    value: "+5"
  },

  {
    key: "system.attributes.dex.saveBonus",
    mode: 2,
    value: "+5"
  }
];

STATUS_EFFECTS.pf2e = duplicate(STATUS_EFFECTS.generic);
STATUS_EFFECTS.pf2e.LOW.label = "Lesser";
STATUS_EFFECTS.pf2e.MEDIUM.label = "Standard";
STATUS_EFFECTS.pf2e.HIGH.label = "Greater";
