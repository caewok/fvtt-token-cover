/* globals
canvas,
CONFIG,
fromUuidSync,
game,
Hooks,
socketlib,
Token,
VisionSource
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, COVER, MODULES_ACTIVE, WEAPON_ATTACK_TYPES } from "./const.js";
import { SETTINGS, Settings } from "./Settings.js";
import { PointsLOS } from "./LOS/PointsLOS.js";
import { Area2dLOS } from "./LOS/Area2dLOS.js";
import { Area3dLOS } from "./LOS/Area3dLOS.js";
import { Draw } from "./geometry/Draw.js"; // For debugging

/* Testing
Draw = CONFIG.GeometryLib.Draw
Point3d = CONFIG.GeometryLib.threeD.Point3d;
api = game.modules.get("tokencover").api;
PointsLOS = api.PointsLOS;
CoverCalculator = api.CoverCalculator

let [viewer] = canvas.tokens.controlled;
let [target] = game.user.targets;


*/

import {
  getActorByUuid,
  keyForValue } from "./util.js";

import { CoverDialog } from "./CoverDialog.js";
import { Lock } from "./Lock.js";

// ----- Set up sockets for changing effects on tokens and creating a dialog ----- //
// Don't pass complex classes through the socket. Use token ids instead.

export const SOCKETS = {
  socket: null
};

Hooks.once("socketlib.ready", () => {
  let disableAllATVCoverFn;
  let enableATVCoverFn;
  switch ( game.system.id ) {
    case "sfrpg":
      disableAllATVCoverFn = disableAllATVCoverSFRPG;
      enableATVCoverFn = enableATVCoverSFRPG;
      break;
    default:
      disableAllATVCoverFn = disableAllATVCover;
      enableATVCoverFn = enableATVCover;
  }

  SOCKETS.socket = socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("coverDialog", coverDialog);
  SOCKETS.socket.register("disableAllATVCover", disableAllATVCoverFn);
  SOCKETS.socket.register("enableATVCover", enableATVCoverFn);
});

/**
 * Create a dialog, await it, and return the result.
 * For use with sockets.
 */
async function coverDialog(data, options = {}) {
  const res = await CoverDialog.dialogPromise(data, options);
  if ( res === "Close" ) return res;

  // Pull the relevant data before returning so that the class is not lost.
  const obj = {};
  const coverSelections = res.find("[class=CoverSelect]");
  for ( const selection of coverSelections ) {
    const id = selection.id.replace("CoverSelect.", "");
    obj[id] = selection.selectedIndex;
  }
  return obj;
}

/**
 * Remove all ATV cover statuses (ActiveEffect) from a token.
 * Used in SOCKETS above.
 * @param {string} tokenUUID         Token uuid
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function disableAllATVCover(tokenUUID) {
  // Confirm the token UUID is valid.
  const tokenD = fromUuidSync(tokenUUID);
  if ( !tokenD ) return;

  // Drop all cover statuses.
  const coverStatuses = tokenD.actor.statuses?.intersection(COVER.IDS[MODULE_ID]) ?? new Set();
  if ( !coverStatuses.size ) return;
  await CoverCalculator.lock.acquire();
  const promises = coverStatuses.map(id => tokenD.toggleActiveEffect({ id }, { active: false }));
  await Promise.allSettled(promises);
  await CoverCalculator.lock.release();
}

/**
 * Remove all ATV cover statuses (ActiveEffect) from a token in Starfinder RPG.
 * Used in SOCKETS above.
 * @param {string} tokenUUID         Token uuid
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function disableAllATVCoverSFRPG(tokenUUID) {
  // Confirm the token UUID is valid.
  const tokenD = fromUuidSync(tokenUUID);
  if ( !tokenD || !tokenD.actor ) return;

  // Drop all cover statuses.
  const coverIds = tokenD.actor.items.filter(i => i.getFlag(MODULE_ID, "cover")).map(i => i.id);
  if ( !coverIds.length ) return;
  await CoverCalculator.lock.acquire();
  await tokenD.actor.deleteEmbeddedDocuments("Item", coverIds);
  await CoverCalculator.lock.release();
}

/**
 * Enable a cover status (ActiveEffect) for a token.
 * Token can only have one cover status at a time, so all other ATV covers are removed.
 * Used in SOCKETS above.
 * @param {string} tokenUUID    Token uuid
 * @param {COVER_TYPE} type     Type of cover to apply
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function enableATVCover(tokenUUID, type = COVER.TYPES.LOW) {
  // If enabling the "None" cover, remove all cover.
  // If TOTAL, this is used as a flag elsewhere to remove the token from targeting. Ignored here.
  if ( type === COVER.TYPES.NONE ) return disableAllATVCover(tokenUUID);
  if ( type === COVER.TYPES.TOTAL ) return;

  // Confirm the token UUID is valid.
  const tokenD = fromUuidSync(tokenUUID);
  if ( !tokenD ) return;

  // Confirm this is a valid cover type.
  const key = keyForValue(COVER.TYPES, type);
  if ( !key ) return;
  const desiredCoverId = COVER.CATEGORIES[key][MODULE_ID];

  // Add the effect. (ActiveEffect hooks will prevent multiple additions.)
  const effectData = CONFIG.statusEffects.find(e => e.id === desiredCoverId);
  await tokenD.toggleActiveEffect(effectData, { active: true });
}

/**
 * Enable a cover status (ActiveEffect) for a token in Starfinder RPG.
 * Token can only have one cover status at a time, so all other ATV covers are removed.
 * Used in SOCKETS above.
 * @param {string} tokenUUID    Token uuid
 * @param {COVER_TYPE} type     Type of cover to apply
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function enableATVCoverSFRPG(tokenUUID, type = COVER.TYPES.LOW) {
  // If enabling the "None" cover, remove all cover.
  // If TOTAL, this is used as a flag elsewhere to remove the token from targeting. Ignored here.
  if ( type === COVER.TYPES.NONE ) return disableAllATVCover(tokenUUID);
  // Unneeded? if ( type === COVER.TYPES.TOTAL ) return;

  // Confirm the token UUID is valid.
  const tokenD = fromUuidSync(tokenUUID);
  if ( !tokenD || !tokenD.actor ) return;

  // Confirm this is a valid cover type.
  const key = keyForValue(COVER.TYPES, type);
  if ( !key || !Object.hasOwn(COVER.CATEGORIES, key) ) return;

  // Retrieve the cover item.
  let coverItem = game.items.find(i => i.getFlag(MODULE_ID, "cover") === type);
  if ( !coverItem ) {
    // Pull from the compendium.
    const coverName = COVER.SFRPG[type];
    const documentIndex = game.packs.get("tokenvisibility.tokenvision_items_sfrpg").index.getName(coverName);
    coverItem = await game.packs.get("tokenvisibility.tokenvision_items_sfrpg").getDocument(documentIndex._id);
  }

  // Add the effect. (ActiveEffect hooks will prevent multiple additions.)
  return tokenD.actor.createEmbeddedDocuments("Item", [coverItem]);
}

/**
 * Remove all ATV cover statuses (ActiveEffect) from a token.
 * Used in SOCKETS above.
 * @param {string} uuid         Actor or token uuid
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function disableAllDFredsCover(uuid) {
  // Drop all cover statuses.
  const actor = getActorByUuid(uuid);
  if ( !actor ) return;

  // Determine what cover statuses are already applied.
  const coverStatuses = actor.statuses?.intersection(COVER.IDS["dfreds-convenient-effects"]) ?? new Set();
  if ( !coverStatuses.size ) return;

  // Drop all cover statuses.
  await CoverCalculator.lock.acquire();
  const promises = coverStatuses.map(id => {
    const effectName = id.replace("Convenient Effect: ", "");
    return game.dfreds.effectInterface.removeEffect({ effectName, uuid });
  });
  await Promise.allSettled(promises);
  await CoverCalculator.lock.release();
}

/**
 * Enable a cover status (ActiveEffect) for a token.
 * Token can only have one cover status at a time, so all other DFred covers are removed.
 * @param {string} uuid       Actor or Token uuid
 * @param {COVER_TYPE} type
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function enableDFredsCover(uuid, type = COVER.TYPES.LOW) {
  // If enabling the "None" cover, remove all cover.
  // If TOTAL, this is used as a flag elsewhere to remove the token from targeting. Ignored here.
  if ( type === COVER.TYPES.NONE ) return disableAllDFredsCover(uuid);
  if ( type === COVER.TYPES.TOTAL ) return;

  // Check that actor exists to avoid error when calling addEffect below.
  const actor = getActorByUuid(uuid);
  if ( !actor ) return;

  // Confirm this is a valid cover type.
  const key = keyForValue(COVER.TYPES, type);
  if ( !key ) return;

  // Add the effect. (ActiveEffect hooks will prevent multiple additions.)
  const effectName = COVER.DFRED_NAMES[key];
  return game.dfreds.effectInterface.addEffect({ effectName, uuid });
}


export class CoverCalculator {
  /** @type {Lock} */
  static lock = new Lock();

  /** @type {object} */
  static COVER_TYPES = COVER.TYPES;

  /** @type {object<class>} */
  static COVER_LOS_CLASSES = {
    [SETTINGS.LOS.TYPES.POINTS]: PointsLOS,
    [SETTINGS.LOS.TYPES.AREA2D]: Area2dLOS,
    [SETTINGS.LOS.TYPES.AREA3D]: Area3dLOS
  };

  /**
   * @typedef CoverConfig  Configuration settings for this class.
   * @type {object}
   * @property {CONST.WALL_RESTRICTION_TYPES} type    What type of walls block for this cover
   * @property {boolean} wallsBlock                   Do walls block vision?
   * @property {boolean} tilesBlock                   Do tiles block vision?
   * @property {boolean} deadTokensBlock              Do dead tokens block vision?
   * @property {boolean} liveTokensBlock              Do live tokens block vision?
   * @property {boolean} liveForceHalfCover           Use dnd5e token half-cover rule
   */
  config = {};

  /** @type {Token} */
  viewer;

  /** @type {Token} */
  target;

  /**
   * @param {Token|VisionSource} viewer
   * @param {Token} target
   * @param {CoverConfig} [config]
   */
  constructor(viewer, target, config = {}) {
    this.viewer = viewer instanceof VisionSource ? viewer.object : viewer;
    this.target = target;
    this.#configure(config);
  }

  /**
   * Configure cover options, most of which are passed to the cover LOS class.
   * @param {CoverConfig}
   */
  #configure(config) {
    const cfg = this.config;
    const liveTokenAlg = Settings.get(SETTINGS.COVER.LIVE_TOKENS.ALGORITHM);
    const liveTypes = SETTINGS.COVER.LIVE_TOKENS.TYPES;

    cfg.type = config.type ?? "move";
    cfg.wallsBlock = config.type || true;
    cfg.tilesBlock = config.tilesBlock || MODULES_ACTIVE.LEVELS || MODULES_ACTIVE.EV;
    cfg.deadTokensBlock = config.deadTokensBlock || Settings.get(SETTINGS.COVER.DEAD_TOKENS.ALGORITHM);
    cfg.liveTokensBlock = config.liveTokensBlock || liveTokenAlg !== liveTypes.NONE;
    cfg.liveForceHalfCover = config.liveForceHalfCover || liveTokenAlg === liveTypes.HALF;
    cfg.proneTokensBlock = config.proneTokensBlock || Settings.get(SETTINGS.COVER.PRONE);
    cfg.debug = config.debug || Settings.get(SETTINGS.DEBUG.LOS);
    cfg.losAlgorithm = config.losAlgorithm ??= Settings.get(SETTINGS.LOS.ALGORITHM);
  }

  // ----- NOTE: Getters / Setters ----- //
  /** @type {class} */
  get coverLOS() { return this.constructor.COVER_LOS_CLASSES[this.config.losAlgorithm]; }

  // ----- NOTE: Static methods ----- //
  /**
   * Get a cover type based on percentage cover.
   * @param {number} percentCover
   * @returns {COVER_TYPE}
   */
  static typeForPercentage(percentCover) {
    const COVER_TYPES = this.COVER_TYPES;
    if ( percentCover >= Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.HIGH) ) return COVER_TYPES.HIGH;
    if ( percentCover >= Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM) ) return COVER_TYPES.MEDIUM;
    if ( percentCover >= Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW) ) return COVER_TYPES.LOW;
    return COVER_TYPES.NONE;
  }

  /**
   * Run cover calculations for all targets against all tokens.
   * Ignore when token equals target.
   * @param {Token} token
   * @param {Token[]} targets
   * @returns {Map<Token, COVER_TYPE>}
   */
  static coverCalculations(viewer, targets, calcs) {
    if ( viewer instanceof Array ) {
      if ( viewer.length > 1 ) console.warn("You should pass a single token or vision source to CoverCalculator, not an array. Using the first object in the array.");
      viewer = viewer[0];
    }
    if ( targets instanceof Token ) targets = [targets];

    calcs ??= new Map();
    for ( const target of targets ) {
      const coverCalc = new CoverCalculator(viewer, target);
      calcs.set(target, coverCalc.targetCover());
    }
    return calcs;
  }

  /**
   * Construct an html table describing cover for various target(s) versus token(s).
   * @param {Token} token       Token to measure cover from.
   * @param {Token[]} targets   Target tokens that may have cover from one or more tokens.
   * @param {object} [options]  Options that affect the html creation
   * @param {boolean} [options.include3dDistance]   Include 3d distance calculation.
   * @param {boolean} [options.includeZeroCover]  Include targets that have no cover in the resulting html.
   * @returns {object {html: {string}, nCover: {number}, coverResults: {COVER_TYPES[][]}}}
   *   String of html content that can be used in a Dialog or ChatMessage.
   */
  static htmlCoverTable(token, targets, opts) {
    if ( Settings.get(SETTINGS.DEBUG.LOS) ) Draw.clearDrawings();
    const coverDialog = new CoverDialog(token, targets);
    return coverDialog._htmlShowCover(opts);
  }

  /**
   * Enable a specific cover status, removing all the rest.
   * Use DFred's if active; ATV otherwise.
   * @param {Token|string} tokenId
   */
  static async enableCover(token, type = this.COVER_TYPES.LOW ) {
    if ( type === this.COVER_TYPES.TOTAL ) return;
    if ( type === this.COVER_TYPES.NONE ) return this.disableAllCover(token);
    if ( !(token instanceof Token) ) token = canvas.tokens.get(token);
    if ( !token ) return;

    const uuid = token.document.uuid;
    if ( MODULES_ACTIVE.DFREDS_CE && this.dFredsHasCover(type) ) await enableDFredsCover(uuid, type);
    else await SOCKETS.socket.executeAsGM("enableATVCover", uuid, type);
  }

  static dFredsHasCover(type) {
    // Confirm this is a valid cover type.
    const key = keyForValue(COVER.TYPES, type);
    if ( !key ) return;

    // Find effect.
    const effectName = COVER.DFRED_NAMES[key];
    return Boolean(game.dfreds.effectInterface.findEffectByName(effectName));
  }

  static async disableAllCover(token) {
    if ( !(token instanceof Token) ) token = canvas.tokens.get(token);
    if ( !token ) return;
    const uuid = token.document.uuid;

    if ( MODULES_ACTIVE.DFREDS_CE ) await disableAllDFredsCover(uuid);
    else await SOCKETS.socket.executeAsGM("disableAllATVCover", uuid);
  }

  /**
   * Get the corresponding name for a cover type.
   * @param {COVER_TYPES} type    Cover number
   * @returns {string}
   */
  static coverNameForType(type) {
    const key = keyForValue(this.COVER_TYPES, type);
    return Settings.getCoverName(key);
  }

  // ----- NOTE: Calculation methods ----- //

  /**
   * Calculate the percentage cover for a single viewer point.
   * @returns {number} Percent between 0 and 1.
   */
  _percentCover(viewerPoint) {
    const calc = this._newLOSCalc(viewerPoint);
    let percent = 1 - calc.percentVisible();
    if ( this.config.liveForceHalfCover ) {
      const calcNoTokens = this._newLOSCalc({ liveTokensBlock: false });
      const percentNoTokens = 1 - calcNoTokens.percentVisible();
      const minPercent = Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW);
      percent = Math.max(percentNoTokens, Math.min(minPercent, percent));
    }
    return percent;
  }

  /**
   * Calculate the percentage cover over all viewer points.
   * @returns {number} Percent between 0 and 1.
   *   Only guaranteed to return less than the lowest cover percentage.
   */
  percentCover() {
    let percent = 1;
    const minPercent = Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW);
    const viewerPoints = PointsLOS.constructViewerPoints(this.viewer);
    for ( const viewerPoint of viewerPoints ) {
      percent = Math.min(percent, this._percentCover(viewerPoint));
      if ( percent < minPercent ) return percent;
    }
    return percent;
  }

  /**
   * Calculate the target's cover.
   * @returns {COVER_TYPES}
   */
  targetCover() { return this.constructor.typeForPercentage(this.percentCover()); }

  // ----- NOTE: Token cover application ----- //
  /**
   * Get a description for an attack type
   * @param {string} type   all, mwak, msak, rwak, rsak
   * @returns {string}
   */
  static attackNameForType(type) { return game.i18n.localize(WEAPON_ATTACK_TYPES[type]); }

  // ----- NOTE: Helper methods ----- //

  /**
   * Construct a new LOS calculator based on settings provided or setting defaults.
   * @param {PointsLOSConfig|Area2dLOSConfig|Area3dLOSConfig} config
   *   Configuration parameters to pass to the LOS class.
   */
  _newLOSCalc(viewer, target, config) {
    viewer ??= this.viewer;
    target ??= this.target;
    return new this.coverLOS(viewer, target, this.#configureLOS(config));
  }

  /**
   * Set up configuration object to pass to the cover algorithm.
   * @param {PointsLOSConfig|Area2dLOSConfig|Area3dLOSConfig}
   * @returns {PointsLOSConfig|Area2dLOSConfig|Area3dLOSConfig}
   */
  #configureLOS(config = {}) {
    config = {...config}; // Shallow copy to avoid modifying the original group.
    const cfg = this.config;

    // AlternativeLOS base config
    config.debug ??= cfg.debug;
    config.type ??= cfg.type;
    config.wallsBlock ??= cfg.wallsBlock;
    config.deadTokensBlock ??= cfg.deadTokensBlock;
    config.liveTokensBlock ??= cfg.liveTokensBlock;

    // Area2d and Area3d; can keep for Points without issue.
    config.visionSource ??= this.viewer.object;

    if ( this.config.losAlgorithm !== SETTINGS.LOS.TYPES.POINTS ) return config;

    // Points config
    config.pointAlgorithm ??= Settings.get(SETTINGS.LOS.POINT_OPTIONS.NUM_POINTS);
    config.inset ??= Settings.get(SETTINGS.LOS.POINT_OPTIONS.INSET);
    config.points3d ??= Settings.get(SETTINGS.LOS.POINT_OPTIONS.POINTS3D);
    config.grid ??= Settings.get(SETTINGS.LOS.LARGE_TARGET);

    // Keep undefined: config.visibleTargetShape
    return config;
  }
}
