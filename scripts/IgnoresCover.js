/* globals
CONFIG,
game
*/
"use strict";

import { MODULE_ID, FLAGS, MODULES_ACTIVE } from "./const.js";

/**
 * For DND5e, add the cover to the Token Config
 */
export function addDND5eCoverFeatFlags() {
  // Leave this to Simbul's if active.
  if ( game.system.id !== "dnd5e" || MODULES_ACTIVE.SIMBULS_CC ) return;

  CONFIG.DND5E.characterFlags.helpersIgnoreCover = {
    name: game.i18n.localize(`${MODULE_ID}.dnd5e.feats.cover.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.dnd5e.feats.cover.Hint`),
    section: "Feats",
    choices: {
      0: game.i18n.localize(`${MODULE_ID}.dnd5e.feats.cover.OptionNone`),
      1: game.i18n.localize(`${MODULE_ID}.dnd5e.feats.cover.OptionHalf`),
      2: game.i18n.localize(`${MODULE_ID}.dnd5e.feats.cover.OptionThreeQuarters`),
      3: game.i18n.localize(`${MODULE_ID}.dnd5e.feats.cover.OptionFull`)
    },
    type: Number
  };
}

/* Getters/Setters for ignoring cover
If the cover is less than or equal to the ignore value, cover can be ignored.
So if a token ignores mwak cover at 0.5, then cover less than or equal to 50% is ignored for this type.
Value of 0 means no cover is ignored. Value of 1 ignores all cover.

Break into five parts:
- mwak.
- msak
- rwak. (e.g., Sharpshooter)
- rsak  (e.g., Spell sniper)
- all (e.g., actor feat)
*/

export class IgnoresCover {
  /**
   * @param {Token} actor
   */
  constructor(token) {
    if ( !token.actor ) console.warn(`IgnoresCover: token ${token.name} (token.id) has no actor.`);

    this.token = token;
    this.actor = token.actor;
  }

  /**
   * Confirm the cover value is valid.
   * @param {number} cover
   * @returns {boolean}
   */
  static verifyCoverValue(cover) {
    if ( !cover.between(0, 1) ) {
      console.warn("IgnoresCover requires value between 0 and 1.");
      return false;
    }

    return true;
  }

  /**
   * Helper to get a flag from the actor.
   * @param {string} flag
   * @returns {number}
   */
  _getCoverFlag(flag) {
    return this.actor?.getFlag(MODULE_ID, flag) ?? 0;
  }

  /**
   * Helper to set a flag from the actor

  /**
   * Does the token ignore cover at all times?
   * @type {number}
   */
  get all() { return this._getCoverFlag(FLAGS.COVER.IGNORE.ALL); }

  set all(value) {
    if ( !this.constructor.verifyCoverValue(value) ) return;
    this.actor.setFlag(MODULE_ID, FLAGS.COVER.IGNORE.ALL, value);
  }

  /**
   * Does the token ignore cover for melee weapon attacks?
   * @type {number}
   */
  get mwak() { return this._getCoverFlag(FLAGS.COVER.IGNORE.MWAK); }

  set mwak(value) {
    if ( !this.constructor.verifyCoverValue(value) ) return;
    this.actor.setFlag(MODULE_ID, FLAGS.COVER.IGNORE.MWAK, value);
  }

  /**
   * Does the token ignore cover for melee spell/magic attacks?
   * @type {number}
   */
  get msak() { return this._getCoverFlag(FLAGS.COVER.IGNORE.MSAK); }

  set msak(value) {
    if ( !this.constructor.verifyCoverValue(value) ) return;
    this.actor.setFlag(MODULE_ID, FLAGS.COVER.IGNORE.MSAK, value);
  }

  /**
   * Does the token ignore cover for ranged weapon attacks?
   * @type {number}
   */
  get rwak() { return this._getCoverFlag(FLAGS.COVER.IGNORE.RWAK); }

  set rwak(value) {
    if ( !this.constructor.verifyCoverValue(value) ) return;
    this.actor.setFlag(MODULE_ID, FLAGS.COVER.IGNORE.RWAK, value);
  }

  /**
   * Does the token ignore cover for ranged spell/magic attacks?
   * @type {number}
   */
  get rsak() { return this._getCoverFlag(FLAGS.COVER.IGNORE.RSAK); }

  set rsak(value) {
    if ( !this.constructor.verifyCoverValue(value) ) return;
    this.actor.setFlag(MODULE_ID, FLAGS.COVER.IGNORE.RSAK, value);
  }
}

/**
 * Class to use with DND5e.
 * Includes compatibility with dnd5ehelpers and midi flags.
 */
export class IgnoresCoverDND5e extends IgnoresCover {

  /**
   * Return the maximum of this module's flag or the dnd5e flag.
   * @type {number}
   */
  get all() {
    let dndFlag = this.actor?.getFlag("dnd5e", FLAGS.COVER.IGNORE_DND5E);

    // For backwards-compatibility, set to three quarters.
    // Aligned with how Simbul's handles it.
    if ( dndFlag === true || dndFlag === "true" ) dndFlag = 0.75;

    return Math.max(super.all, dndFlag);
  }

  /**
   * Update both the dnd5e flag and this module's flag.
   * @type {number}
   */
  set all(value) {
    if ( !this.constructor.verifyCoverValue(value) ) return;
    super.all = value;

    this.actor.update({
      flags: {
        dnd5e: {
          [FLAGS.COVER.IGNORE_DND5E]: value
        }
      }
    });
  }

  /**
   * Check midi flag; return maximum.
   * @type {number}
   */
  get rwak() {
    const sharpShooter = this.actor?.flags["midi-qol"]?.sharpShooter ? 0.75 : 0;
    return Math.max(super.rwak, sharpShooter);
  }

  /**
   * Check dae flag; return maximum.
   * @type {number}
   */
  get rsak() {
    const spellSniper = this.actor?.flags?.dnd5e?.spellSniper ? 0.75 : 0;
    return Math.max(super.rsak, spellSniper);
  }
}

/**
 * Class to use when Simbul's is active.
 * Defaults to the Simbul's cover for the all getter/setter.
 */
export class IgnoresCoverSimbuls extends IgnoresCoverDND5e {
  constructor(token) {
    if ( !MODULES_ACTIVE.SIMBULS_CC ) {
      console.warn("IgnoresCoverSimbuls instantiated but Simbul's Cover Calculator is not active.");
    }

    super(token);
  }

  get all() {
    const score = this.token.ignoresCover();
    switch ( score ) {
      case 0: return 0;
      case 1: return 0.5;
      case 2: return 0.75;
      case 3: return 1;
      default: return 0;
    }
  }
}
