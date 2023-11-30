/* globals
canvas,
game,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { COVER, MODULES_ACTIVE, WEAPON_ATTACK_TYPES, MODULE_ID } from "./const.js";
import { SETTINGS, Settings } from "./Settings.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { PointsLOS } from "./LOS/PointsLOS.js";
import { Area2dLOS } from "./LOS/Area2dLOS.js";
import { Area3dLOSGeometric } from "./LOS/Area3dLOSGeometric.js";
import { Area3dLOSWebGL } from "./LOS/Area3dLOSWebGL1.js";
import { Area3dLOSWebGL2 } from "./LOS/Area3dLOSWebGL2.js";
import { Area3dLOSHybrid } from "./LOS/Area3dLOSHybrid.js";
import { Draw } from "./geometry/Draw.js"; // For debugging
import { SOCKETS } from "./cover_application.js";
import { keyForValue } from "./util.js";
import { CoverDialog } from "./CoverDialog.js";


/* Testing
Draw = CONFIG.GeometryLib.Draw
Point3d = CONFIG.GeometryLib.threeD.Point3d;
api = game.modules.get("tokencover").api;
PointsLOS = api.PointsLOS;
CoverCalculator = api.CoverCalculator

let [viewer] = canvas.tokens.controlled;
let [target] = game.user.targets;
*/


export class CoverCalculator {

  /** @enum {string: AlternativeLOS} */
  static ALGORITHM_CLASS = {
    "los-points": PointsLOS,
    "los-area-2d": Area2dLOS,
    "los-area-3d": Area3dLOSHybrid,
    "los-area-3d-geometric": Area3dLOSGeometric,
    "los-area-3d-webgl1": Area3dLOSWebGL,
    "los-area-3d-webgl2": Area3dLOSWebGL2,
    "los-area-3d-hybrid": Area3dLOSHybrid
  };

  /** @enum {string} */
  static ALGORITHM_CLASS_NAME = {
    "los-points": "PointsLOS",
    "los-area-2d": "Area2dLOS",
    "los-area-3d": "Area3dLOSHybrid",
    "los-area-3d-geometric": "Area3dLOSGeometric",
    "los-area-3d-webgl1": "Area3dLOSWebGL",
    "los-area-3d-webgl2": "Area3dLOSWebGL2",
    "los-area-3d-hybrid": "Area3dLOSHybrid"
  };

  /** @type {object} */
  static COVER_TYPES = COVER.TYPES;

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

  /** @type {AlternativeLOS} */
  calc;

  /**
   * @param {Token|VisionSource} viewer
   * @param {Token} target
   * @param {CoverConfig} [config]
   */
  constructor(viewer, target, config = {}) {
    this.#configure(config);
    this.calc = new this.constructor.ALGORITHM_CLASS[this.config.losAlgorithm](viewer, target, this.config);
  }

  // ----- NOTE: Getters / Setters ----- //

  /** @type {Token} */
  get viewer() { return this.calc.viewer; }

  set viewer(value) { this.calc.viewer = value; }

  /** @type {Token} */
  get target() { return this.calc.target; }

  set target(value) { this.calc.target = value; }

  destroy() { this.calc.destroy(); }

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
    cfg.losAlgorithm = config.losAlgorithm ??= Settings.get(SETTINGS.LOS.TARGET.ALGORITHM);
  }

  /**
   * Update the calculator algorithm.
   */
  _updateAlgorithm(algorithm) {
    algorithm ??= Settings.get(SETTINGS.LOS.TARGET.ALGORITHM);
    const clName = this.calc.constructor.name;
    if ( clName === this.constructor.ALGORITHM_CLASS_NAME[algorithm] ) return;

    const cl = this.constructor.ALGORITHM_CLASS[algorithm];
    this.calc.destroy();
    this.calc = new cl(this.viewer, this.target, this.config);
  }

  /**
   * Update the calculator settings.
   */
  _updateConfigurationSettings() {
    this.calc._configure();
    this.calc._clearCache();
  }


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

    const coverCalc = viewer[MODULE_ID].coverCalc;
    calcs ??= new Map();
    for ( const target of targets ) {
      coverCalc.target = target;
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
  static async enableCover(token, coverType = this.COVER_TYPES.LOW ) {
    if ( !(token instanceof Token) ) token = canvas.tokens.get(token);
    if ( !token ) return;
    const uuid = token.document.uuid;
    await SOCKETS.socket.executeAsGM("applyCover", uuid, coverType);
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
    await SOCKETS.socket.executeAsGM("applyCover", uuid, this.COVER_TYPES.NONE);
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
   * Calculate the percentage cover for the current viewer point.
   * @returns {number} Percent between 0 and 1.
   */
  _percentCover() {
    const calc = this.calc;
    let percent = 1 - calc.percentVisible();
    if ( this.config.liveForceHalfCover && calc.config.liveTokensBlock ) {
      calc._updateConfiguration({ liveTokensBlock: false });
      const percentNoTokens = 1 - calc.percentVisible();
      calc._updateConfiguration({ liveTokensBlock: true });
      const minPercent = Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW);
      percent = Math.max(percentNoTokens, Math.min(minPercent, percent));
    }
    return percent;
  }

  /**
   * Calculate the percentage cover over all viewer points if more than one in settings.
   * @param {Token} [target]    Optional target if not already set.
   * @returns {number} Percent between 0 and 1.
   *   Only guaranteed to return less than the lowest cover percentage.
   */
  percentCover(target) {
    const { viewer, calc } = this;
    if ( target ) calc.target = target;
    const center = Point3d.fromTokenCenter(viewer);
    const viewerPoints = calc.constructor.constructViewerPoints(viewer);
    let percent = 1;
    const minPercent = Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW);
    const useDebug = Settings.get(SETTINGS.DEBUG.COVER);
    for ( const viewerPoint of viewerPoints ) {
      calc.visionOffset = viewerPoint.subtract(center);
      percent = Math.min(percent, this._percentCover());
      if ( percent < minPercent ) {
        if ( useDebug ) calc.debug(true);
        return percent;
      }
    }
    if ( useDebug ) calc.debug(true);
    return percent;
  }

  /**
   * Calculate the target's cover.
   * @returns {COVER_TYPES}
   */
  targetCover(target) { return this.constructor.typeForPercentage(this.percentCover(target)); }

  // ----- NOTE: Token cover application ----- //
  /**
   * Get a description for an attack type
   * @param {string} type   all, mwak, msak, rwak, rsak
   * @returns {string}
   */
  static attackNameForType(type) { return game.i18n.localize(WEAPON_ATTACK_TYPES[type]); }

  /**
   * Set the target cover effect.
   * If cover is none, disables any cover effects.
   * @param {COVER.TYPE} type   Cover type. Default to calculating.
   */
  setTargetCoverEffect(type = this.targetCover()) {
    const COVER_TYPES = this.constructor.COVER_TYPES;
    switch ( type ) {
      case COVER_TYPES.NONE:
        this.constructor.disableAllCover(this.target.id);
        break;
      case COVER_TYPES.LOW:
      case COVER_TYPES.MEDIUM:
      case COVER_TYPES.HIGH:
        this.constructor.enableCover(this.target.id, type);
    }
  }


  // ----- NOTE: Helper methods ----- //

  /**
   * Set up configuration object to pass to the cover algorithm.
   * @param {PointsLOSConfig|Area2dLOSConfig|Area3dLOSConfig}
   * @returns {PointsLOSConfig|Area2dLOSConfig|Area3dLOSConfig}
   */
//   #configureLOS(config = {}) {
//     config = {...config}; // Shallow copy to avoid modifying the original group.
//     const cfg = this.config;
//     const TARGET = SETTINGS.LOS.TARGET;
//
//     // AlternativeLOS base config
//     config.debug ??= cfg.debug;
//     config.type ??= cfg.type;
//     config.wallsBlock ??= cfg.wallsBlock;
//     config.deadTokensBlock ??= cfg.deadTokensBlock;
//     config.liveTokensBlock ??= cfg.liveTokensBlock;
//
//     // Area2d and Area3d; can keep for Points without issue.
//     config.visionSource ??= this.viewer.vision;
//
//     if ( this.config.losAlgorithm !== TARGET.TYPES.POINTS ) return config;
//
//     // Points config
//     config.pointAlgorithm ??= Settings.get(TARGET.POINT_OPTIONS.NUM_POINTS);
//     config.inset ??= Settings.get(TARGET.POINT_OPTIONS.INSET);
//     config.points3d ??= Settings.get(TARGET.POINT_OPTIONS.POINTS3D);
//     config.grid ??= Settings.get(TARGET.LARGE);
//
//     // Keep undefined: config.visibleTargetShape
//     return config;
//   }
}
