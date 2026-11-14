/* globals
CONFIG,
foundry,
game,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { WEAPON_ATTACK_TYPES, MODULE_ID, COVER_TYPES, ENUMS } from "./const.js";
import { Settings } from "./settings.js";
import { ViewerLOS } from "./LOS/ViewerLOS.js";
import { pointIndexForSet } from "./LOS/SmallBitSet.js";
import { NULL_SET } from "./geometry/util.js";
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

export function currentCalculator() { return CONFIG[MODULE_ID].losCalculator; }

export function effectiveAlgorithmType() {
  const TYPES = ENUMS.ALGORITHM_TYPES;
  const type = Settings.get(Settings.KEYS.LOS.TARGET.ALGORITHM);
  return ( type === TYPES.WEBGL2 && CONFIG[MODULE_ID].webGL2Unavailable )
    ? TYPES.GEOMETRIC : type;
}

export function currentDebugViewerClass(type) {
  type ??= effectiveAlgorithmType();
  const KEYS = Settings.KEYS;
  const { TARGET } = KEYS.LOS;
  const debugViewers = CONFIG[MODULE_ID].debugViewerClasses;
  type ??= Settings.get(TARGET.ALGORITHM) ?? ENUMS.ALGORITHM_TYPES.POINTS;
  const calcName = ViewerLOS.VIEWPOINT_ALGORITHM_SETTINGS[type];
  return debugViewers[calcName];
}

/**
 * @returns {TokenBlockingConfig}  See PercentVisibleCalculator.js
 */
function TokenBlockingConfig() {
  return new ConfigHandler({
    dead: () => Boolean(Settings.get(Settings.KEYS.LOS.BLOCKING.DEAD)),
    live: () => Boolean(Settings.get(Settings.KEYS.LOS.BLOCKING.LIVE)),
    prone: () => Boolean(Settings.get(Settings.KEYS.LOS.BLOCKING.PRONE)),

    // No settings enabled for now.
    enemies: true,
    allies: true,
    excludedStatuses: NULL_SET,
  });
}

function regionBlocks(regionD) {
  const typeKey = `${MODULE_ID}.setCover`;
  return regionD.behaviors.some(b => b.type === typeKey && b.system.opacity > 0);
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

/** @returns {ViewpointInsetsConfig} */
export function ViewpointInsetsConfig() {
  return new ConfigHandler({
    top: () => Settings.get(Settings.KEYS.LOS.VIEWER.INSETS.TOP),
    bottom: () => Settings.get(Settings.KEYS.LOS.VIEWER.INSETS.BOTTOM),
    sides: () => Settings.get(Settings.KEYS.LOS.VIEWER.INSETS.SIDES),
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
    targetInset: () => Settings.get(Settings.KEYS.LOS.TARGET.INSET) ?? 0.75,
    targetPointIndex: () => pointIndexForSet(Settings.get(Settings.KEYS.LOS.TARGET.POINTS)),
  });
}

/**
 * @returns {ViewerLOSConfig} See ViewerLOS.js
 */
export function LOSViewerConfig() {
  return new ConfigHandler({
    viewpointIndex: () => pointIndexForSet(Settings.get(Settings.KEYS.LOS.VIEWER.POINTS)),
    insets: ViewpointInsetsConfig(),
    threshold: Number.NaN, // Handled by the cover type.
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
  const calcName = ViewerLOS.VIEWPOINT_ALGORITHM_SETTINGS[effectiveAlgorithmType()];
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
  calculator ??= this.currentCalculator;
  occlusionTester ??= new ObstacleOcclusionTest();
  calculator.config.set(losCfg);
  calculator.occlusionTester = occlusionTester;
  calculator.initialize();
  const viewerLOS = new ViewerLOS(viewer, calculator);
  viewerLOS.config = LOSViewerConfig();
  viewerLOS.config.set(losCfg);
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

  // ----- NOTE: Settings ----- //

  /** @type {boolean} */
  static get liveTokensBlock() { return Boolean(Settings.get(Settings.KEYS.LOS.BLOCKING.LIVE)); }

  /** @type {boolean} */
  static get deadTokensBlock() { return Boolean(Settings.get(Settings.KEYS.LOS.BLOCKING.DEAD)); }

  /** @type {boolean} */
  static get proneTokensBlock() { return Boolean(Settings.get(Settings.KEYS.LOS.BLOCKING.PRONE)); }

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
    for ( const target of targets ) calcs.set(target, coverCalc.coverDefinition(target, opts));
    return calcs;
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
    return this.cloneForTokenLocation(token, position, elevation)?.tokencover.coverCalculator;
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

  effectiveCoverPercent(target) { return target.tokencover.minimumPercentCoverFromAttackers([this.viewer]); }

  coverDefinition(target, { actionType } = {}) {
    let def = TokenCover.coverAtPercent(this.effectiveCoverPercent(target)) ?? null;
    if ( def && this.constructor.cannotIgnore(this.viewer, def, actionType) === false ) def = null;
    return def;
  }

  /**
   * Calculate the target's cover.
   * Deprecated; used only for midiqol.
   * @returns {COVER.TYPES} Integer between 0 and 4
   */
  static legacyLevel(def) {
    const t = def?.minPercent ?? 0;
    return t >= 1 ? COVER_TYPES.HIGH : t >= 0.75 ? COVER_TYPES.MEDIUM : t >= 0.5 ? COVER_TYPES.LOW : COVER_TYPES.NONE;
  }

  /** @returns {boolean} False if the attacker's ignores-cover rules remove this cover. */
  static cannotIgnore(attacker, def, actionType) {
    const ic = attacker.tokencover?.ignoresCover;
    const ignored = Math.max(ic?.all ?? 0, ic?.[actionType] ?? 0);
    return this.legacyLevel(def) > ignored;
  }

  /**
   * Calculate the target's cover.
   * Deprecated; used only for midiqol.
   * @param {Token} target
   * @returns {COVER.TYPES} Integer between 0 and 4
   */
  targetCover(target) { return this.constructor.legacyLevel(this.coverDefinition(target)); }

  // ----- NOTE: Percent Cover ----- //

  /**
   * Calculate the percentage cover over all viewer points if more than one in settings.
   * @param {Token} target                      Target
   * @returns {number} Percent between 0 and 1.
   */
  percentCover(target) {
    const losViewer = this.losViewer;
    losViewer.target = target;
    losViewer.calculate();
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
