/* globals
CONFIG,
foundry,
game,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { WEAPON_ATTACK_TYPES, FLAGS, MODULE_ID, COVER_TYPES } from "./const.js";
import { Settings } from "./settings.js";
import { Draw } from "./geometry/Draw.js"; // For debugging
import { CoverDialog } from "./CoverDialog.js";
import { ViewerLOS } from "./LOS/ViewerLOS.js";
import { pointIndexForSet } from "./LOS/SmallBitSet.js";
import { NULL_SET } from "./geometry/util.js";
import { fastFlag } from "./util.js";
import { ConfigHandler } from "./ConfigHandler.js";
import { ObstacleOcclusionTest } from "./geometry/ObstacleOcclusionTest.js";
import { TokenCover } from "./TokenCover.js";

/* Testing
Draw = CONFIG.GeometryLib.Draw
Point3d = CONFIG.GeometryLib.threeD.Point3d;
api = game.modules.get("tokencover").api;
PointsLOS = api.PointsLOS;
CoverCalculator = api.CoverCalculator

let [viewer] = canvas.tokens.controlled;
let [target] = game.user.targets;
*/

// ViewerLOS = CachedViewerLOS;

export function currentCalculator() { return CONFIG[MODULE_ID].losCalculator(); }

export function currentDebugViewerClass(type) {
  const KEYS = Settings.KEYS;
  const { TARGET } = KEYS.LOS;
  const debugViewers = CONFIG[MODULE_ID].debugViewerClasses;
  type ??= Settings.get(TARGET.ALGORITHM) ?? TARGET.TYPES.POINTS;
  const calcName = ViewerLOS.VIEWPOINT_ALGORITHM_SETTINGS[type];
  return debugViewers[calcName];
}

/**
 * @returns {TokenBlockingConfig}  See PercentVisibleCalculator.js
 */
function TokenBlockingConfig() {
  return new ConfigHandler({
    dead: () => Boolean(Settings.get(Settings.KEYS.COVER_EFFECTS.LIVE_TOKENS_BLOCK)),
    live: () => Boolean(Settings.get(Settings.KEYS.COVER_EFFECTS.LIVE_TOKENS_BLOCK)),
    prone: () => Boolean(Settings.get(Settings.KEYS.COVER_EFFECTS.PRONE_TOKENS_BLOCK)),

    // No settings enabled for now.
    enemies: true,
    allies: true,
    excludedStatuses: NULL_SET,
  });
}

function regionBlocks(regionD) {
  const typeKey = `${MODULE_ID}.setCover`;
  return regionD.behaviors.some(b => b.type === typeKey && b.system.physicalCover > 0);
}

/**
 * @returns {BlockingConfig}  See PercentVisibleCalculator.js
 */
export function BlockingConfig() {
  return new ConfigHandler({
    senseType: "sight",
    tokens: TokenBlockingConfig(),
    walls: true,
    tiles: true,
    regions: true,
    levels: {
      background: true,
      foreground: true,
    },

    filters: {
      regions: [regionBlocks],
      tiles: [],
      tokens: [],
      walls: [],
      levels: [],
    },
  });
}

/**
 * @returns {CalculatorConfig|PointsCalculatorConfig}  See PercentVisibleCalculator.js and PointsCalculator.js
 */
export function CalculatorConfig() {
  return new ConfigHandler({
    largeTarget: () => Settings.get(Settings.KEYS.LOS.TARGET.LARGE) || false,
    debug: false,
    sourceType: "lighting",
    tokenShapeType: "tokenBorder",
    radius: Number.POSITIVE_INFINITY,

    // Points algorithm
    targetInset: () => Settings.get(Settings.KEYS.LOS.TARGET.POINT_OPTIONS.INSET) ?? 0.75,
    targetPointIndex: () => pointIndexForSet(Settings.get(Settings.KEYS.LOS.TARGET.POINT_OPTIONS.POINTS)),
  });
}

/**
 * @returns {ViewerLOSConfig} See ViewerLOS.js
 */
export function LOSViewerConfig() {
  return new ConfigHandler({
    viewpointIndex: () => pointIndexForSet(Settings.get(Settings.KEYS.LOS.VIEWER.POINTS)),
    viewpointInset: () => Settings.get(Settings.KEYS.LOS.VIEWER.INSET),
    threshold: () => Settings.get(Settings.KEYS.LOS.TARGET.PERCENT),
    angle: true,
  });
}

/**
 * Build the default occlusion tester that, by default, uses the current settings.
 * @param {object} [otCfg={}]           Blocking configuration settings that deviate from the current
 * @returns {ObstacleOcclusionTester}
 */
export function buildOcclusionTester(otCfg = {}) {
  const ot = new ObstacleOcclusionTest();
  ot.config = BlockingConfig();
  ot.config.set(otCfg);
  return ot;
}

/**
 * Return the calculator class according to the current settings.
 * @returns {class}
 */
export function getCurrentCalculatorClass() {
  const calcName = ViewerLOS.VIEWPOINT_ALGORITHM_SETTINGS[Settings.get(Settings.KEYS.LOS.TARGET.ALGORITHM)];
  return CONFIG[MODULE_ID].calculatorClasses[calcName];
}

/**
 * Build an LOS calculator that, by default, uses the current settings.
 * @param {class} [calcClass]                               The calculator class
 * @param {ObstacleOcclusionTester} [occlusionTester]       The occlusion tester to use
 * @param {object} [calcCfg={}]                             Calculator configuration settings
 *                                                          that deviate from the current
 * @returns {PercentVisibleCalculatorAbstract}
 */
export function buildLOSCalculator({ calcClass, occlusionTester, ...calcCfg } = {}) {
  calcClass ??= getCurrentCalculatorClass();
  occlusionTester ??= CONFIG[MODULE_ID].occlusionTester ?? buildOcclusionTester();
  const calculator = new calcClass();
  calculator.config = CalculatorConfig();
  calculator.config.set(calcCfg);
  calculator.occlusionTester = occlusionTester;
  calculator.initialize(); // Async.
  return calculator;
}

/**
 * Build an LOS viewer for this viewer that, by default, uses the current settings.
 * @param {Token} viewer
 * @param {PercentVisibleCalculatorAbstract} calculator
 * @param {object} [losCfg={}]                             LOS configuration settings that deviate from the current
 * @returns {ViewerLOS}
 */
export function buildLOSViewer(viewer, { calculator, ...losCfg } = {}) {
  calculator ??= CONFIG[MODULE_ID].losCalculator ?? buildLOSCalculator();
  calculator.initialize(); // Async.
  const viewerLOS = new ViewerLOS(viewer, calculator);
  viewerLOS.config = LOSViewerConfig();
  viewerLOS.config.set(losCfg);
  return viewerLOS;
}

/**
 * Build an LOS calculator for this viewer that uses the current settings, modified by
 * custom parameters.
 * @param {Token} viewer                    The viewing token
 * @param {LOSCalculator} calculator        Calculator to use
 * @param {object} [losCfg={}]              Custom parameters to override default settings.
 * @returns {ViewerLOS}
 */
export function buildCustomLOSViewer(viewer, calculator, occlusionTester, losCfg = {}) {
  calculator ??= currentCalculator();
  occlusionTester ??= new ObstacleOcclusionTest();
  const losConfig = foundry.utils.mergeObject(LOSViewerConfig(), losCfg, { inplace: false });
  const viewerLOS = new ViewerLOS(viewer, calculator, losConfig);
  return viewerLOS;
}

/**
 * Build a debug viewer using the current settings.
 * @param {DebugVisibilityViewerAbstract} cl                    Class of the viewer
 * @returns {DebugVisibilityViewerAbstract}
 */
export function buildDebugViewer(cl) {
  const viewerLOSFn = viewer => viewer[MODULE_ID].coverCalculator.losViewer;
  return new cl(viewerLOSFn);
}


export class CoverCalculator {
  /** @type {ViewerLOS} */
  losViewer;

  constructor(token) {
    this.losViewer = buildLOSViewer(token);
  }

  // ----- NOTE: Viewer LOS passthrough ----- //

  /** @type {PercentVisibleCalculator} */
  get losCalc() { return this.losViewer.calculator; }

  /** @type {Token} */
  get viewer() { return this.losViewer.viewer; }

  set viewer(value) { this.losViewer = value; }

  // ----- NOTE: Settings ----- //

  /** @type {boolean} */
  static get liveTokensBlock() { return Boolean(Settings.get(Settings.KEYS.COVER_EFFECTS.LIVE_TOKENS_BLOCK)); }

  /** @type {boolean} */
  static get deadTokensBlock() { return Boolean(Settings.get(Settings.KEYS.COVER_EFFECTS.DEAD_TOKENS_BLOCK)); }

  /** @type {boolean} */
  static get proneTokensBlock() { return Boolean(Settings.get(Settings.KEYS.COVER_EFFECTS.PRONE_TOKENS_BLOCK)); }

  /** @type {boolean} */
  static get includeTokens() { return this.liveTokensBlock || this.deadTokensBlock; }


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
    if ( targets instanceof foundry.canvas.placeables.Token ) targets = [targets];

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
    const percentCover = target.tokencover.percentCoverFromAttacker(this.viewer);
    const coverEffect = TokenCover.coverAtPercent(percentCover);

    // Transform cover types into the deprecated COVER.TYPES values by comparing the min percent cover.
    let coverValue = COVER_TYPES.NONE;
    for ( const coverEffect of coverEffects ) {
      const threshold = coverEffect.minPercent;
      if ( threshold >= 1 ) return COVER_TYPES.HIGH; // Cannot do better than this.
      if ( threshold >= 0.75 ) coverValue = Math.max(COVER_TYPES.MEDIUM, coverValue);
      else if ( threshold >= 0.50 ) coverValue = Math.max(COVER_TYPES.LOW, coverValue);
    }
    return coverValue;
  }

  // ----- NOTE: Percent Cover ----- //

  /**
   * Calculate the percentage cover over all viewer points if more than one in settings.
   * @param {Token} target                      Target
   * @param {CalculatorConfig} [cfg]            Options passed to the los calculator
   * @returns {number} Percent between 0 and 1.
   */
  percentCover(target, cfg) {
    const losViewer = this.losViewer;
    losViewer.target = target;
    losViewer.calculate()
    return 1 - losViewer.percentVisible;
  }


  // ----- NOTE: Token cover application ----- //
  /**
   * Get a description for an attack type
   * @param {string} type   all, mwak, msak, rwak, rsak
   * @returns {string}
   */
  static attackNameForType(type) { return game.i18n.localize(WEAPON_ATTACK_TYPES[type]); }

}
