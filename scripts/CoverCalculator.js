/* globals
CONFIG,
game,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { WEAPON_ATTACK_TYPES, FLAGS, MODULE_ID } from "./const.js";
import { Settings } from "./settings.js";
import { Draw } from "./geometry/Draw.js"; // For debugging
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
    [Settings.KEYS.PRONE_TOKENS_BLOCK]: "proneTokensBlock"
  };

  get liveForceHalfCover() {
    return this.calc.getConfiguration("liveTokensAlgorithm") === Settings.KEYS.LIVE_TOKENS.TYPES.HALF;
  }

  static initialConfiguration(cfg = {}) {
    // Move type b/c cover relates to physical obstacles.
    cfg.type = "move";

    // Set liveTokensBlock based on underlying algorithm.
    super.initialConfiguration(cfg);
    cfg.liveTokensBlock = cfg.liveTokensAlgorithm !== Settings.KEYS.LIVE_TOKENS.TYPES.NONE;
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
   * Run cover calculations for all targets against all tokens.
   * Ignore when token equals target.
   * @param {Token} token
   * @param {Token[]} targets
   * @returns {Map<Token, Set<CoverType>>}
   */
  static coverCalculations(viewer, targets, calcs, opts) {
    if ( viewer instanceof Array ) {
      if ( viewer.length > 1 ) console.warn("You should pass a single token or vision source to CoverCalculator, not an array. Using the first object in the array.");
      viewer = viewer[0];
    }
    if ( targets instanceof Token ) targets = [targets];

    const coverCalc = viewer.coverCalculator;
    calcs ??= new Map();
    for ( const target of targets ) {
      coverCalc.target = target;
      calcs.set(target, coverCalc.coverTypes(opts));
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
   * @returns {object {html: {string}, nCover: {number}, coverResults: {CoverType[][]}}}
   *   String of html content that can be used in a Dialog or ChatMessage.
   */
  static htmlCoverTable(token, targets, opts) {
    if ( Settings.get(Settings.KEYS.DEBUG.LOS) ) Draw.clearDrawings();
    const coverDialog = new CoverDialog(token, targets);
    return coverDialog._htmlShowCover(opts);
  }

  // ----- NOTE: Cover Types ----- //

  /**
   * Determine cover types.
   * Target must be set in advance.
   * @param [object] opts     Options passed to coverTypesForToken, such as actionType (dnd5e)
   * @returns {Set<CoverType>}
   */
  coverTypes(opts) {
    return CONFIG[MODULE_ID].CoverType.coverTypesForToken(this.viewer, this.target, opts);
  }

  // ----- NOTE: Percent Cover ----- //

  /**
   * Calculate the percentage cover over all viewer points if more than one in settings.
   * @param {Token} [target]    Optional target if not already set
   * @param {object} [opts]     Options passed to _percentCover
   * @returns {number} Percent between 0 and 1.
   */
  percentCover(target, opts) {
    const { viewer, calc } = this;
    if ( target ) calc.target = target;
    calc._clearCache();

    let percent = 1;
    const viewerOpts = {
      pointAlgorithm: Settings.get(Settings.KEYS.LOS.VIEWER.NUM_POINTS),
      inset: Settings.get(Settings.KEYS.LOS.VIEWER.INSET)
    };
    const viewerPoints = calc.constructor.constructViewerPoints(viewer, viewerOpts);
    for ( const viewerPoint of viewerPoints ) {
      calc.viewerPoint = viewerPoint;
      percent = Math.min(percent, this._percentCover(opts));
      if ( percent < 0 || percent.almostEqual(0) ) return 0;
    }
    return percent;
  }

  /**
   * Calculate the percentage cover for the current viewer point.
   * @param {object} [opts]                     Options to manipulate the LOS calculation
   * @param {boolean} [opts.includeWalls=true]    Should walls be considered blocking?
   * @param {boolean} [opts.includeTokens=true]   Should tokens be considered blocking?
   *                                            GM settings may further modify which tokens block
   * @param {Token[]} [opts.tokensToExclude=[]] What tokens to not include in blocking objects
   * @param {Token[]} [opts.onlyTokens=[]]      Only include these tokens as potentially blocking
   * @returns {number} Percent between 0 and 1.
   */
  _percentCover({ includeWalls = true, includeTokens = true, tokensToExclude = [], onlyTokens = [] } = {}) {
    const calc = this.calc;

    // Instead of copying and restoring blocking objects, just change them and clear cache after.
    let blockingObjectsChanged = false;
    let partialBlockingTokens = [];

    if ( !includeWalls ) {
      calc.blockingObjects.walls.clear();
      calc.blockingObjects.terrainWalls.clear();
      blockingObjectsChanged ||= true;
    }

    if ( includeTokens ) {
      // Remove tokens flagged as not blocking.
      // Process tokens that have been flagged as partially blocking.
      const res = this._partiallyBlockingTokens();
      partialBlockingTokens = res.partialBlockingTokens;
      if ( res.nonBlockingTokens.length ) {
        res.nonBlockingTokens.forEach(t => calc.blockingObjects.tokens.delete(t));
        blockingObjectsChanged ||= true;
      }

      // Process tokens that are forcibly excluded or included.
      if ( tokensToExclude.length ) {
        tokensToExclude.forEach(t => calc.blockingObjects.tokens.delete(t));
        blockingObjectsChanged ||= true;
      }
      if ( onlyTokens.length ) {
        calc.blockingObjects.tokens.clear();
        onlyTokens.forEach(t => calc.blockingObjects.tokens.add(t));
        blockingObjectsChanged ||= true;
      }

    } else {
      calc.blockingObjects.tokens.clear();
      blockingObjectsChanged ||= true;
    }

    // Basic approach: simply calculate cover based on visibility of the target from the viewer point.
    if ( blockingObjectsChanged ) calc._blockingObjectsChanged();
    const percent = 1 - calc.percentVisible();

    // Handle partially blocking tokens separately.
    if ( partialBlockingTokens.length ) return this._calculatePartiallyBlockingCover(partialBlockingTokens, percent);
    return percent;
  }

  /**
   * Locate all partially and non-blocking tokens.
   * @returns {object}
   *   - @prop{Token[]} partialBlockingTokens    Any tokens that grant only partial cover
   *   - @prop{Token[]} nonBlockingTokens        Any tokens that do not grant cover
   */
  _partiallyBlockingTokens() {
    const calc = this.calc;
    const partialBlockingTokens = [];
    const nonBlockingTokens = [];
    for ( const token of calc.blockingObjects.tokens ) {
      const maxCover = Number(token.document.getFlag(MODULE_ID, FLAGS.COVER.MAX_GRANT) ?? 1);
      if ( maxCover >= 1 ) continue;
      if ( !maxCover ) nonBlockingTokens.push(token);
      else partialBlockingTokens.push(token);
    }
    return { partialBlockingTokens, nonBlockingTokens };
  }

  /**
   * Run the percent cover calculation for partially blocking tokens.
   * Tokens provided but not checked for partial blocking.
   * @param {Set<Token>|Token[]} patiallyBlockingTokens
   */
  _calculatePartiallyBlockingCover(partialBlockingTokens, totalPercent) {
    const calc = this.calc;
    const blockingTokens = calc.blockingObjects.tokens;

    // Without partially blocking tokens.
    partialBlockingTokens.forEach(t => blockingTokens.delete(t));
    calc._blockingObjectsChanged();
    const percentNoTokens = 1 - calc.percentVisible();

    // Add back the tokens.
    partialBlockingTokens.forEach(t => blockingTokens.add(t));
    calc._blockingObjectsChanged();

    // Remove each token in turn.
    let tPercentage = [];
    const tMaxCover = [];
    // Avoid infinite loop here by using a copy of the blocking token set.
    partialBlockingTokens.forEach(t => {
      tMaxCover.push(Number(t.document.getFlag(MODULE_ID, FLAGS.COVER.MAX_GRANT) ?? 1));
      blockingTokens.delete(t);
      calc._blockingObjectsChanged();
      const percentMinusOneToken = 1 - calc.percentVisible();
      tPercentage.push(totalPercent - percentMinusOneToken);
      blockingTokens.add(t);
      calc._blockingObjectsChanged();
    });

    // Prorate each token's percentage contribution to the total token contribution to
    // cover by the maximum cover for each respective token.
    const diff = totalPercent - percentNoTokens;
    const nTokens = tPercentage.length;
    const denom = tPercentage.reduce((curr, acc) => acc + curr) || nTokens;
    tPercentage = tPercentage.map(x => x / denom);
    let newPercent = 0;
    for ( let i = 0; i < nTokens; i += 1 ) newPercent += tPercentage[i] * tMaxCover[i];
    newPercent *= diff;
    newPercent += percentNoTokens;
    return Math.clamped(newPercent, 0, 1);
  }


    /*
    Example: token provides 75% cover.
    If without that token, you would have 50% cover but with that token, it is 100% cover, drops to 75%.

    Example: token1 provides 0% cover, token2 provides 50% cover
    Drop token1.

    Example: Wall cover 40%. Token1 covers 50%. Token2 covers 60%. Wall is in middle.
    T1 max is 50%. T2 max is 75%.
    Wall: |   ----   |
    T1:   |-----     |
    T2:   |    ------|

    With both tokens: 100% cover
    Without both tokens: 40% cover
    Without token1: 70% cover
    Without token2: 70% cover

    60% (100 - 40) of cover provided by tokens.
    Of that 60%, T1 and T2 split evenly: 70% / 70%.
    New formula: .4 + .6 * (.5 * .5 + .5 * .75) = .775

    Example: Wall cover 40%. Token1 covers 50%. Token2 covers 60%. Wall is in middle.
    T1 max is 50%. T2 max is 75%.
    Wall: |   ----   |
    T1:   |-----     |
    T2:   |------    |

    With both tokens: 70% cover
    Without both tokens: 40% cover
    Without token1: 70% cover
    Without token2: 70% cover

    30% (70 - 40) of cover provided by the tokens.
    Of that 30%, T1 and T2 split evenly: 70% / 70%.
    New formula: .40 + .30 * (.5 * .5 + .5 * .75) = .5875

    Example: Wall cover 40%. Token1 covers 10%. Token2 covers 20%. Wall is in middle.
    T1 max is 50%. T2 max is 75%.
    Wall: |   ----   |
    T1:   |-         |
    T2:   |   --     |

    With both tokens: 50% cover
    Without both tokens: 40% cover
    Without token1: 40% cover
    Without token2: 50% cover

    10% (50 - 40) of cover provided by the tokens.
    Of that 10%, T1 provides 10% (50 - 40) and T2 provides 0% (50 - 50)
    New formula: .40 + .10 * (1 * .5 + 0 * .75) = .45
    */

  // ----- NOTE: Token cover application ----- //
  /**
   * Get a description for an attack type
   * @param {string} type   all, mwak, msak, rwak, rsak
   * @returns {string}
   */
  static attackNameForType(type) { return game.i18n.localize(WEAPON_ATTACK_TYPES[type]); }

  /**
   * Update one or more specific settings in the calculator.
   */
  _updateConfiguration(config) {
    // Handle the live token cover choices.
    const liveTokensAlg = config[Settings.KEYS.LIVE_TOKENS.ALGORITHM];
    if ( liveTokensAlg ) config.liveTokensBlock = liveTokensAlg !== Settings.KEYS.LIVE_TOKENS.TYPES.NONE;
    super._updateConfiguration(config);
  }
}
