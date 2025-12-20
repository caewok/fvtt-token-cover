/* globals
CONFIG,
game,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { WEAPON_ATTACK_TYPES, FLAGS, MODULE_ID, COVER_TYPES, TRACKER_IDS } from "./const.js";
import { Settings } from "./settings.js";
import { Draw } from "./geometry/Draw.js"; // For debugging
import { CoverDialog } from "./CoverDialog.js";
import { ViewerLOS } from "./LOS/ViewerLOS.js";
import { pointIndexForSet } from "./LOS/SmallBitSet.js";

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
  /** @type {Token} */
  get viewer() { return this.losViewer.viewer; }

  set viewer(value) { this.losViewer = value; }

  /** @type {ViewerLOS} */
  losViewer;

  constructor(token) {
    this.losViewer = buildLOSViewer(token);
  }

  /** @type {PercentVisibleCalculator} */
  get losCalc() { return this.losViewer.calculator; }


  // ----- NOTE: Static methods ----- //

  /**
   * Run cover calculations for all targets against all tokens.
   * Ignore when token equals target.
   * @param {Token} token
   * @param {Token[]} targets
   * @returns {Map<Token, Set<CoverEffect>>}
   */
  static coverCalculations(viewer, targets, calcs, opts) {
    if ( viewer instanceof Array ) {
      if ( viewer.length > 1 ) console.warn("You should pass a single token or vision source to CoverCalculator, not an array. Using the first object in the array.");
      viewer = viewer[0];
    }
    if ( targets instanceof Token ) targets = [targets];

    const coverCalc = viewer.tokencover?.coverCalculator ?? new CoverCalculator(viewer);
    calcs ??= new Map();
    for ( const target of targets ) calcs.set(target, coverCalc.coverEffects(target, opts));
    return calcs;
  }

  /**
   * Construct an html table describing cover for various target(s) versus token(s).
   * @param {Token} token       Token to measure cover from.
   * @param {Token[]} targets   Target tokens that may have cover from one or more tokens.
   * @param {object} [options]  Options that affect the html creation
   * @param {boolean} [options.include3dDistance]   Include 3d distance calculation.
   * @param {boolean} [options.includeZeroCover]  Include targets that have no cover in the resulting html.
   * @returns {object {html: {string}, nCover: {number}, coverResults: {CoverEffect[][]}}}
   *   String of html content that can be used in a Dialog or ChatMessage.
   */
  static htmlCoverTable(token, targets, opts) {
    if ( Settings.get(Settings.KEYS.DEBUG.LOS) ) Draw.clearDrawings();
    const coverDialog = new CoverDialog(token, targets);
    return coverDialog._htmlShowCover(opts);
  }

  /**
   * Build a cover calculator for an attacking token at a defined location (not the token's current location).
   * Creates a clone of the token and changes its location.
   * @param {Token} token             Token to use for the cover calculator.
   * @param {Point} [position]        Optional {x, y} location if different from token
   * @param {number} [elevation]      Optional elevation if different from token
   * @returns {CoverCalculator}
   */
  static createCoverCalculatorForTokenLocation(token, position, elevation) {
    return this.cloneForTokenLocation(token, position, elevation)?.coverCalculator;
  }

  static cloneForTokenLocation(token, position, elevation) {
    const { x, y } = position ?? token.center;
    elevation ??= token.elevationE;
    const clone = token.clone();
    clone.eventMode = "none";
    clone.document.updateSource({ x, y, elevation });
    clone._isCoverCalculatorClone = true;
    return clone;
  }

  // ----- NOTE: Cover Effects ----- //

  /**
   * Determine cover effects.
   * @param {Token} [target]    Optional target if not already set
   * @param [object] opts       Options passed to coverForToken, such as actionType (dnd5e)
   * @returns {Set<CoverEffect>}
   */
  coverEffects(target, opts) {
    if ( target ) this.target = target;
    return CONFIG[MODULE_ID].CoverEffect.coverForToken(this.viewer, this.target, opts);
  }

  /**
   * Calculate the target's cover.
   * Deprecated; used only for midiqol.
   * @returns {COVER.TYPES} Integer between 0 and 4
   */
  targetCover(target) {
    // Use the possibly cached cover types.
    target ??= this.target;
    const coverEffects = target.tokencover.coverFromAttacker(this.viewer);

    // Transform cover types into the deprecated COVER.TYPES values by comparing the min percent cover.
    let coverValue = COVER_TYPES.NONE;
    for ( const coverEffect of coverEffects ) {
      const threshold = coverEffect.percentThreshold;
      if ( threshold >= 1 ) return COVER_TYPES.HIGH; // Cannot do better than this.
      if ( threshold >= 0.75 ) coverValue = Math.max(COVER_TYPES.MEDIUM, coverValue);
      else if ( threshold >= 0.50 ) coverValue = Math.max(COVER_TYPES.LOW, coverValue);
    }
    return coverValue;
  }

  // ----- NOTE: Percent Cover ----- //

  /**
   * @typedef {Object} PercentCoverOptions
   *
   * @property {boolean} [includeWalls=true]      Should walls be considered blocking?
   * @property {boolean} [includeTokens=true]     Should tokens be considered blocking?
   * @property {Token[]} [tokensToExclude=[]]     What tokens to not include in blocking objects.
   *                                              GM settings may further modify which tokens block.
   * @property {Token[]} [onlyTokens=[]]          Only include these tokens as potentially blocking.
   */

  /**
   * Calculate the percentage cover over all viewer points if more than one in settings.
   * @param {Token} target                      Target
   * @param {object} [PercentCoverOptions]      Options passed to _percentCover
   * @returns {number} Percent between 0 and 1.
   */
  percentCover(target, { includeWalls = true, includeTokens = true, tokensToExclude = [], onlyTokens = [] } = {}) {
    const { losViewer, losCalc } = this;
    losViewer.initializeView({ target });

    let oldConfig;
    if ( !(includeWalls || includeTokens) ) {
      oldConfig = losCalc.config;
      losCalc.config = {
        blocking: {
          walls: includeWalls,
          tokens: {
            dead: oldConfig.blocking.tokens.dead && includeTokens,
            live: oldConfig.blocking.tokens.live && includeTokens,
          },
        },
      };
    }


    // TODO: Is a simple visibility test still workable here?

    // Because of partially blocking tokens, cannot simply calculate for all viewpoints.
    let percent = 1;
    const opts = { tokensToExclude, onlyTokens };
    for ( const viewpoint of losViewer.viewpoints ) {
      losViewer.initializeView({ viewpoint });
      losViewer._initializeCalculation(); // Set up the obstacles.
      const percentFromViewpoint = this._percentCover(opts);
      if ( percentFromViewpoint < percent ) {
        percent = percentFromViewpoint;
        if ( percent < 0 || percent.almostEqual(0) ) break;
      }
    }

    if ( oldConfig ) losCalc.config = oldConfig;
    return percent;
  }

  /**
   * Calculate the percentage cover for the current set viewer point.
   * @param {object} [PercentCoverOptions]                     Options to manipulate the LOS calculation
   * @returns {number} Percent between 0 and 1.
   */
  _percentCover({ tokensToExclude = [], onlyTokens = [] } = {}) {
    const losCalc = this.losCalc;
    const tokenObstacles = losCalc.occlusionTester.obstacles.tokens;

    // Instead of copying and restoring blocking objects, just change them and clear cache after.
    let partialBlockingTokens = [];

    if ( losCalc.tokensBlock  ) {
      // Remove tokens flagged as not blocking.
      // Process tokens that have been flagged as partially blocking.
      const res = this._partiallyBlockingTokens();
      partialBlockingTokens = res.partialBlockingTokens;
      res.nonBlockingTokens.forEach(t => tokenObstacles.delete(t));

      // Process tokens that are forcibly excluded or included.
      tokensToExclude.forEach(t => tokenObstacles.delete(t));
      if ( onlyTokens.length ) {
        occlusionTester.obstacles.tokens.clear();
        onlyTokens.forEach(t => tokenObstacles.add(t));
      }
    }

    // Basic approach: simply calculate cover based on visibility of the target from the viewer point.
    losCalc._calculate();
    const percent = 1 - losCalc.percentVisible;

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
    const obstacles = this.losCalc.occlusionTester.obstacles;
    const partialBlockingTokens = [];
    const nonBlockingTokens = [];
    const statusesGrantNoCover = CONFIG[MODULE_ID].statusesGrantNoCover;
    for ( const token of obstacles.tokens ) {
      let maxCover = Number(token.document.getFlag(MODULE_ID, FLAGS.COVER.MAX_GRANT) ?? 1);
      if ( token.actor && token.actor.statuses.intersects(statusesGrantNoCover).size ) maxCover = 0;
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
    const losCalc = this.losCalc;
    const blockingTokens = losCalc.occlusionTester.obstacles.tokens;

    // TODO: Use the result directly.
    // Test each token in turn. Combine with all other obstacles to get total cover.
    // Requires ability to modify the percent blocking by a percentage. E.g., token blocks 50% means every other pixel.
    // Would be different for each algorithm.
    //
    /* Geometric is a problem. Could shrink geometric:
    Area:  w * h = A.
    To shrink area, w*x * h*x = A', where x is a percent increase/reduction for width and height.
    x^2 * w * h = A'
    x^2 = A' / w*h = A' / A
    x = sqrt(A' / A)

    E.g., A = 1000. A' = 500. x = sqrt(500/1000) = 1 / sqrt(2) ~ 0.707

    But this only makes the obstacle token smaller. It would still allow 100% cover.
    Need to instead put a bunch of holes in the token shape. This is likely performance intensive.
    Could fall back on numerical approach used here.
    */

    // Without partially blocking tokens.
    partialBlockingTokens.forEach(t => blockingTokens.delete(t));
    const resultNoTokens = losCalc._calculate();
    const percentNoTokens = 1 - resultNoTokens.percentVisible;

    // Add back the tokens.
    partialBlockingTokens.forEach(t => blockingTokens.add(t));

    // Remove each token in turn.
    let tPercentage = [];
    const tMaxCover = [];
    // Avoid infinite loop here by using a copy of the blocking token set.
    const statusesGrantNoCover = CONFIG[MODULE_ID].statusesGrantNoCover;
    partialBlockingTokens.forEach(t => {
      let maxCover = Number(t.document.getFlag(MODULE_ID, FLAGS.COVER.MAX_GRANT) ?? 1);
      if ( t.actor && t.actor.statuses.intersects(statusesGrantNoCover).size ) maxCover = 0;
      tMaxCover.push(maxCover);
      blockingTokens.delete(t);
      const resultMinusOneToken = losCalc._calculate();

      const percentMinusOneToken = 1 - resultMinusOneToken.percentVisible;
      tPercentage.push(totalPercent - percentMinusOneToken);
      blockingTokens.add(t);
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
    return Math.clamp(newPercent, 0, 1);
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

}

// ----- NOTE: Calculator configuration ----- //

/**
 * @returns {CalculatorConfig|PointsCalculatorConfig}  See PercentVisibleCalculator.js and PointsCalculator.js
 */
function CalculatorConfig() {
  return {
    blocking: { // BlockingConfig
      tokens: { // TokenBlockingConfig
        dead: true,
        live: true,
        prone: true,
      },
      walls: true,
      tiles: true,
      regions: true,
    },
    largeTarget: Settings.get(Settings.KEYS.LOS.TARGET.LARGE) ?? false,
    debug: false,
    testLighting: true,
    senseType: "sight",
    sourceType: "lighting",

    // Points algorithm
    targetInset: Settings.get(Settings.KEYS.LOS.TARGET.POINT_OPTIONS.INSET) ?? 0.75,
    targetPointIndex: pointIndexForSet(Settings.get(Settings.KEYS.LOS.TARGET.POINT_OPTIONS.POINTS)),
  };
}

/**
 * @returns {ViewerLOSConfig} See ViewerLOS.js
 */
function LOSViewerConfig() {
  return {
    viewpointIndex: pointIndexForSet(Settings.get(Settings.KEYS.LOS.VIEWER.POINTS)),
    viewpointInset: Settings.get(Settings.KEYS.LOS.VIEWER.INSET),
    angle: true,
  };
}

/**
 * Build an LOS calculator that uses the current settings.
 * @returns {PercentVisibleCalculatorAbstract}
 */
function buildLOSCalculator() {
  const calcName = ViewerLOS.VIEWPOINT_ALGORITHM_SETTINGS[Settings.get(Settings.KEYS.LOS.TARGET.ALGORITHM)];
  const calcs = CONFIG[MODULE_ID].losCalculators;
  if ( !calcs[calcName] ) {
    calcs[calcName] ??= new CONFIG[MODULE_ID].calculatorClasses[calcName](CalculatorConfig());
    calcs[calcName].initialize(); // Async.
  }
  return calcs[calcName];
}

/**
 * Build an LOS viewer for this viewer that uses the current settings.
 * @param {Token} viewer
 * @returns {ViewerLOS}
 */
export function buildLOSViewer(viewer) {
  const calculator = buildLOSCalculator();
  const viewerLOS = new ViewerLOS(viewer, calculator, LOSViewerConfig());
  return viewerLOS;
}

/**
 * Build a debug viewer using the current settings.
 * @param {class} cl                    Class of the viewer
 */
export function buildDebugViewer(cl) {
  const viewerLOSFn = viewer => viewer[TRACKER_IDS.COVER].coverCalculator.losViewer;
  return new cl(viewerLOSFn);
}

export function currentDebugViewerClass(type) {
  const KEYS = Settings.KEYS;
  const { TARGET } = KEYS.LOS;
  const debugViewers = CONFIG[MODULE_ID].debugViewerClasses;
  type ??= Settings.get(TARGET.ALGORITHM) ?? TARGET.TYPES.POINTS;
  const calcName = ViewerLOS.VIEWPOINT_ALGORITHM_SETTINGS[type];
  return debugViewers[calcName];
}

