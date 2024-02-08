/* globals
canvas,
game,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { COVER, WEAPON_ATTACK_TYPES } from "./const.js";
import { SETTINGS, Settings } from "./settings.js";
import { Draw } from "./geometry/Draw.js"; // For debugging
import { SOCKETS } from "./cover_application.js";
import { keyForValue } from "./util.js";
import { CoverDialog } from "./CoverDialog.js";
import { AbstractCalculator } from "./LOS/AbstractCalculator.js";


/* Testing
Draw = CONFIG.GeometryLib.Draw
Point3d = CONFIG.GeometryLib.threeD.Point3d;
api = game.modules.get("tokencover").api;
PointsLOS = api.PointsLOS;
CoverCalculator = api.CoverCalculator

let [viewer] = canvas.tokens.controlled;
let [target] = game.user.targets;
*/

const TARGET = Settings.KEYS.LOS.TARGET;

export class CoverCalculator extends AbstractCalculator {
  /**
   * Map of settings to Cover configurations.
   * @type {object}
   */
  static SETTINGS_CONFIG_MAP = {
    // Target
    [TARGET.LARGE]: "largeTarget",

    // Target (PointsLOS)
    [TARGET.POINT_OPTIONS.NUM_POINTS]: "numTargetPoints",
    [TARGET.POINT_OPTIONS.INSET]: "targetInset",
    [TARGET.POINT_OPTIONS.POINTS3D]: "points3d",

    // Token blocking
    [Settings.KEYS.LIVE_TOKENS.ALGORITHM]: "liveTokensAlgorithm",
    [Settings.KEYS.DEAD_TOKENS_BLOCK]: "deadTokensBlock",
    [Settings.KEYS.PRONE_TOKENS_BLOCK]: "proneTokensBlock",
  };

  /** @type {object} */
  static COVER_TYPES = COVER.TYPES;

  get liveForceHalfCover() {
    return this.calc.getConfiguration("liveTokensAlgorithm") === SETTINGS.LIVE_TOKENS.TYPES.HALF;
  }

  static initialConfiguration(cfg = {}) {
    // Move type b/c cover relates to physical obstacles.
    cfg.type = "move";

    // Set liveTokensBlock based on underlying algorithm.
    super.initialConfiguration(cfg);
    cfg.liveTokensBlock = cfg.liveTokensAlgorithm !== SETTINGS.LIVE_TOKENS.TYPES.NONE;
    return cfg;
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

    const coverCalc = viewer.coverCalculator;
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
    if ( this.liveForceHalfCover && calc.getConfiguration("liveTokensBlock") ) {
      calc.updateConfiguration({ liveTokensBlock: false });
      const percentNoTokens = 1 - calc.percentVisible();
      calc.updateConfiguration({ liveTokensBlock: true });
      const minPercent = Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW);
      percent = Math.max(percentNoTokens, Math.min(minPercent, percent));
    }
    return percent;
  }

  coverFromViewerAtLocation(target, location) {
    this.calc.viewerPoint = location;
    return this._percentCover();
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

    let percent = 1;
    const minPercent = Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW);
    const viewerOpts = {
      pointAlgorithm: Settings.get(Settings.KEYS.LOS.VIEWER.NUM_POINTS),
      inset: Settings.get(Settings.KEYS.LOS.VIEWER.INSET)
    }
    const viewerPoints = calc.constructor.constructViewerPoints(viewer, viewerOpts);
    for ( const viewerPoint of viewerPoints ) {
      calc.viewerPoint = viewerPoint;
      percent = Math.min(percent, this._percentCover());
      if ( percent < minPercent ) return percent;
    }
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
    if ( !keyForValue(COVER_TYPES, type) ) {
      console.warn("Token.coverType|cover value not recognized.");
      return;
    }

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

  /**
   * Update one or more specific settings in the calculator.
   */
  _updateConfiguration(config) {
    // Handle the live token cover choices.
    if ( Object.hasOwn(config, "liveTokensAlgorithm") ) {
      const liveTypes = SETTINGS.LIVE_TOKENS.TYPES;
      config.liveTokensBlock = config.liveTokensAlgorithm !== liveTypes.NONE;
    }
    super._updateConfiguration(config);
  }
}
