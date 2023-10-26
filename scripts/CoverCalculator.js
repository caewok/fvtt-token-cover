/* globals
canvas,
CONFIG,
CONST,
duplicate,
fromUuidSync,
game,
Hooks,
PIXI,
PointSourcePolygon,
Ray
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
import {
  lineSegmentIntersectsQuadrilateral3d,
  lineIntersectionQuadrilateral3d,
  buildTokenPoints,
  getActorByUuid,
  keyForValue } from "./util.js";

import { ClipperPaths } from "./geometry/ClipperPaths.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { squaresUnderToken, hexesUnderToken } from "./shapes_under_token.js";
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
  // if ( type === COVER.TYPES.TOTAL ) return;

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

/* Cover Calculation Class
 * Calculate cover between a token and target, based on different algorithms.
 */
export class CoverCalculator {
  /** @type {Lock} */
  static lock = new Lock();

  /** @type {object} */
  static COVER_TYPES = COVER.TYPES;

  /** @type {object<class>} */
  static get COVER_LOS_CLASSES() {
    const TYPES = SETTINGS.LOS.TARGET.TYPES;
    return {
      [TYPES.POINTS]: PointsLOS,
      [TYPES.AREA2D]: Area2dLOS,
      [TYPES.AREA3D]: Area3dLOS
    };
  }

  /**
   * @typedef Area2dConfig  Configuration settings for this class.
   * @type {object}
   * @property {CONST.WALL_RESTRICTION_TYPES} type    Type of vision source
   * @property {boolean} wallsBlock                   Do walls block vision?
   * @property {boolean} tilesBlock                   Do tiles block vision?
   * @property {boolean} deadTokensBlock              Do dead tokens block vision?
   * @property {boolean} liveTokensBlock              Do live tokens block vision?
   * @property {boolean} liveForceHalfCover           Use dnd5e token half-cover rule
   */

  /** @type {object} */
  config = {};

  /** @type {Token} */
  viewer;

  /** @type {Token} */
  target;

  /**
   * @param {VisionSource|Token} viewer
   * @param {Token} target
   */
  constructor(viewer, target, config = {}) {
    if ( viewer instanceof Array ) {
      if ( viewer.length > 1 ) console.warn("You should pass a single token or vision source as the viewer to CoverCalculator, not an array. Using the first object in the array.");
      viewer = viewer[0];
    }

    if ( target instanceof Array ) {
      if ( target.length > 1 ) console.warn("You should pass a single target to CoverCalculator, not an array. Using the first object in the array.");
      target = target[0];
    }

    this.viewer = viewer instanceof VisionSource ? viewer.object : viewer;
    this.target = target;
    this.#configure(config);
    this.debug = DEBUG.cover;
  }

  /**
   * Initialize the configuration for this constructor.
   * @param {object} config   Settings intended to override defaults.
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
    cfg.losAlgorithm = config.losAlgorithm ??= Settings.get(SETTINGS.LOS.TARGET.ALGORITHM);
  }

  /** @type {string} */
  static get currentAlgorithm() { return Settings.get(SETTINGS.COVER.ALGORITHM); }

  /**
   * Get the corresponding name for a cover type.
   * @param {COVER_TYPES} type    Cover number
   * @returns {string}
   */
  static typeForPercentage(percentCover) {
    const COVER_TYPES = this.COVER_TYPES;
    if ( percentCover >= Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.HIGH) ) return COVER_TYPES.HIGH;
    if ( percentCover >= Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM) ) return COVER_TYPES.MEDIUM;
    if ( percentCover >= Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW) ) return COVER_TYPES.LOW;
    return COVER_TYPES.NONE;
  }

  /**
   * Get a description for an attack type
   * @param {string} type   all, mwak, msak, rwak, rsak
   * @returns {string}
   */

  static attackNameForType(type) { return game.i18n.localize(WEAPON_ATTACK_TYPES[type]); }

  static async disableAllCover(token) {
    if ( !(token instanceof Token) ) token = canvas.tokens.get(token);
    if ( !token ) return;
    const uuid = token.document.uuid;

    if ( MODULES_ACTIVE.DFREDS_CE ) await disableAllDFredsCover(uuid);
    else await SOCKETS.socket.executeAsGM("disableAllATVCover", uuid);
  }

  static async disableCoverStatus(tokenId) {
    console.warn(`${MODULE_ID}|disableCoverStatus is deprecated. Please use disableAllCover instead.`);
    return this.disableAllCover(tokenId);
  }

  static async disableAllCoverStatus(tokenId) {
    console.warn(`${MODULE_ID}|disableAllCoverStatus is deprecated. Please use disableAllCover instead.`);
    return this.disableAllCover(tokenId);
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

  static async setCoverStatus(tokenId, type = this.COVER_TYPES.NONE ) {
    console.warn(`${MODULE_ID}|setCoverStatus is deprecated. Please use enableCover instead.`);
    return this.enableCover(tokenId, type);
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
   * 3d position of the viewer.
   * Defaults to viewer losHeight or elevation otherwise, in center of the viewer token.
   * @type {Point3d}
   */
  get viewerCenter() {
    const height = this.viewer.topZ - this.viewer.bottomZ;
    const losHeight = height ? this.viewer.topZ : this.viewer.topZ + 1;
    return new Point3d(this.viewer.center.x, this.viewer.center.y, losHeight);
  }

  /**
   * Height of the target, if any.
   * @type {number}
   */
  get targetHeight() {
    return this.target.topZ - this.target.bottomZ;
  }

  /**
   * Point halfway between target bottom and target top.
   * @type {number}
   */
  get targetAvgElevationZ() {
    return CoverCalculator.averageTokenElevationZ(this.target);
  }

  // ----- MAIN USER METHODS ----- //

  /**
   * Basic switch to calculate cover based on selected algorithm.
   * Defaults to the cover algorithm setting selected by the GM.
   * @param {string} algorithm
   * @returns {COVER_TYPE}
   */
  targetCover(algorithm = getSetting(SETTINGS.COVER.ALGORITHM)) {
    let coverType = this.constructor.COVER_TYPES.NONE;

    switch ( algorithm ) {
      case SETTINGS.COVER.TYPES.CENTER_CENTER:
        return this.centerToCenter();
      case SETTINGS.COVER.TYPES.CENTER_CORNERS_TARGET:
        return this.centerToTargetCorners();
      case SETTINGS.COVER.TYPES.CORNER_CORNERS_TARGET:
        return this.cornerToTargetCorners();
      case SETTINGS.COVER.TYPES.CENTER_CORNERS_GRID:
        return this.centerToTargetGridCorners();
      case SETTINGS.COVER.TYPES.CORNER_CORNERS_GRID:
        return this.cornerToTargetGridCorners();
      case SETTINGS.COVER.TYPES.CENTER_CUBE:
        return this.centerToCube();
      case SETTINGS.COVER.TYPES.CUBE_CUBE:
        return this.cubeToCube();
      case SETTINGS.COVER.TYPES.AREA:
        return this.area2d();
      case SETTINGS.COVER.TYPES.AREA3D:
        return this.area3d();
    }

    return coverType;
  }

  /**
   * Set the target cover effect.
   * If cover is none, disables any cover effects.
   * @param {COVER.TYPE} type   Cover type. Default to calculating.
   */
  setTargetCoverEffect(type = this.targetCover()) {
    const COVER_TYPES = this.constructor.COVER_TYPES;
    switch ( type ) {
      case COVER_TYPES.NONE:
      case COVER_TYPES.FULL:
        CoverCalculator.disableAllCover(this.target.id);
        break;
      case COVER_TYPES.LOW:
      case COVER_TYPES.MEDIUM:
      case COVER_TYPES.HIGH:
        CoverCalculator.enableCover(this.target.id, type);
    }
  }

  _hasWallCollision(tokenPoint, targetPoint) {
    if ( !this.config.wallsBlock ) return false;
    const mode = "any";
    const type = this.config.type;
    return PointSourcePolygon.testCollision3d(tokenPoint, targetPoint, { type, mode });
  }

  _hasTileCollision(tokenPoint, targetPoint) {
    if ( !this.config.tilesBlock ) return false;
    const ray = new Ray(tokenPoint, targetPoint);

    // Ignore non-overhead tiles
    const collisionTest = (o, _rect) => o.t.document.overhead;
    const tiles = canvas.tiles.quadtree.getObjects(ray.bounds, { collisionTest });

    // Because tiles are parallel to the XY plane, we need not test ones obviously above or below.
    const maxE = Math.max(tokenPoint.z, targetPoint.z);
    const minE = Math.min(tokenPoint.z, targetPoint.z);

    // Precalculate
    const rayVector = targetPoint.subtract(tokenPoint);
    const zeroMin = 1e-08;
    const oneMax = 1 + 1e-08;

    for ( const tile of tiles ) {
      if ( this.config.type === "light" && tile.document.flags?.levels?.noCollision ) continue;

      const { x, y, width, height, elevation } = tile.document;
      const elevationZ = CONFIG.GeometryLib.utils.gridUnitsToPixels(elevation);

      if ( elevationZ < minE || elevationZ > maxE ) continue;

      const r0 = new Point3d(x, y, elevationZ);
      const r1 = new Point3d(x + width, y, elevationZ);
      const r2 = new Point3d(x + width, y + height, elevationZ);
      const r3 = new Point3d(x, y + height, elevationZ);

      // Need to test the tile intersection point for transparency (Levels holes).
      // Otherwise, could just use lineSegmentIntersectsQuadrilateral3d
      const t = lineIntersectionQuadrilateral3d(tokenPoint, rayVector, r0, r1, r2, r3);
      if ( t === null || t < zeroMin || t > oneMax ) continue;
      const ix = new Point3d();
      tokenPoint.add(rayVector.multiplyScalar(t, ix), ix);
      if ( !tile.containsPixel(ix.x, ix.y, 0.99) ) continue; // Transparent, so no collision.

      return true;
    }

    return false;
  }

  _hasTokenCollision(tokenPoint, targetPoint) {
    const { liveTokensBlock, deadTokensBlock } = this.config;
    if ( !(liveTokensBlock || deadTokensBlock) ) return false;

    const ray = new Ray(tokenPoint, targetPoint);
    let tokens = canvas.tokens.quadtree.getObjects(ray.bounds);

    // Filter out the viewer and target token
    tokens.delete(this.viewer);
    tokens.delete(this.target);

    // Build full- or half-height tokenPoints3d from tokens
    const tokenPoints = buildTokenPoints(tokens, this.config);

    // Set viewing position and test token sides for collisions
    for ( const pts of tokenPoints ) {
      const sides = pts._viewableFaces(tokenPoint);
      for ( const side of sides ) {
        if ( lineSegmentIntersectsQuadrilateral3d(tokenPoint, targetPoint,
          side.points[0],
          side.points[1],
          side.points[2],
          side.points[3]) ) return true;
      }
    }

    return false;
  }

  // ----- COVER ALGORITHM METHODS ----- //

  /**
   * Test cover based on PF2e approach of measuring token center to target center.
   * @returns {COVER_TYPE}    Will be either NONE or MEDIUM
   */
  static coverNameForType(type) {
    const key = keyForValue(this.COVER_TYPES, type);
    return Settings.getCoverName(key);
  }

  /**
   * Test cover based on center-to-corners test. This is a simpler version of the DMG dnd5e test.
   * It is assumed that "center" is at the losHeight elevation, and corners are
   * at the mean height of the token.
   * @returns {COVER_TYPE}
   */
  centerToTargetCorners() {
    this.debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions
    const targetPoints = this._getCorners(this.target.constrainedTokenBorder, this.targetAvgElevationZ);
    return this._testTokenTargetPoints([this.viewerCenter], [targetPoints]);
  }

  /**
   * Test cover based on corner-to-corners test. This is a simpler version of the DMG dnd5e test.
   * Runs a collision test on all corners of the token, and takes the best one
   * from the perspective of the token (the corner that provides least cover).
   * @returns {COVER_TYPE}
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
   * Test cover based on center-to-corners test. This is a simpler version of the DMG dnd5e test.
   * If the token covers multiple squares, this version selects the token square with the least cover.
   * It is assumed that "center" is at the losHeight elevation, and corners are
   * at the mean height of the token.
   * @returns {COVER_TYPE}
   */
  percentCover() {
    let percent = 1;
    const minPercent = Settings.get(SETTINGS.COVER.TRIGGER_PERCENT.LOW);
    const viewerPoints = PointsLOS.constructViewerPoints(this.viewer);
    for ( const viewerPoint of viewerPoints ) {
      percent = Math.min(percent, this._percentCover(viewerPoint));
      if ( percent < minPercent ) return percent;
    }

    this.debug && this._drawPointToPoints(minPointData.tokenPoint, minPointData.targetPoints, { width: 2 }); // eslint-disable-line no-unused-expressions

    return minCover;
  }

  /**
   * Get polygons representing all grids under a token.
   * @param {Token} token
   * @return {PIXI.Polygon[]|PIXI.Rectangle[]|null}
   */
  static gridShapesUnderToken(token) {
    if ( canvas.grid.type === CONST.GRID_TYPES.GRIDLESS ) {
      console.error("gridShapesUnderTarget called on gridless scene!");
      return token.bounds;
    }

    return canvas.grid.type === CONST.GRID_TYPES.SQUARE ? squaresUnderToken(token) : hexesUnderToken(token);
  }

  /**
   * Get polygons representing all grids under a token.
   * If token is constrained, overlap the constrained polygon on the grid shapes.
   * @param {Token} token
   * @return {PIXI.Polygon[]|PIXI.Rectangle[]|null}
   */
  static constrainedGridShapesUnderToken(token) {
    const gridShapes = CoverCalculator.gridShapesUnderToken(token);

    const constrained = token.constrainedTokenBorder;

    // Token unconstrained by walls.
    if ( constrained instanceof PIXI.Rectangle ) return gridShapes;

    // For each gridShape, intersect against the constrained shape
    const constrainedGridShapes = [];
    const constrainedPath = ClipperPaths.fromPolygons([constrained]);

    for ( let gridShape of gridShapes ) {
      if ( gridShape instanceof PIXI.Rectangle ) gridShape = gridShape.toPolygon();

      const constrainedGridShape = constrainedPath.intersectPolygon(gridShape).simplify();
      if ( !constrainedGridShape || constrainedGridShape.points.length < 6 ) continue;
      constrainedGridShapes.push(constrainedGridShape);
    }

    return constrainedGridShapes;
  }

  /**
   * Get the average elevation of a token.
   * Measured as the difference between top and bottom heights.
   * @param {Token} token
   * @returns {number}
   */
  static averageTokenElevationZ(token) {
    const height = (token.topZ - token.bottomZ) || 1; // So token always has a minimum height.
    return token.bottomZ + (height * 0.5);
  }

  /**
   * Helper that constructs 3d points for the points of a token shape (rectangle or polygon).
   * Uses the elevation provided as the z-value.
   * @param {PIXI.Polygon|PIXI.Rectangle} tokenShape
   * @parma {number} elevation
   * @returns {Point3d[]} Array of corner points.
   */
  #configureLOS(config = {}) {
    config = {...config}; // Shallow copy to avoid modifying the original group.
    const cfg = this.config;
    const TARGET = SETTINGS.LOS.TARGET;

    // Constrained is polygon. Only use corners of polygon
    // Scale down polygon to avoid adjacent walls.
    const padShape = tokenShape.pad(-2, { scalingFactor: 100 });
    return [...padShape.iteratePoints({close: false})].map(pt => new Point3d(pt.x, pt.y, elevation));
  }

    // Area2d and Area3d; can keep for Points without issue.
    config.visionSource ??= this.viewer.vision;

    if ( this.config.losAlgorithm !== TARGET.TYPES.POINTS ) return config;

    // Points config
    config.pointAlgorithm ??= Settings.get(TARGET.POINT_OPTIONS.NUM_POINTS);
    config.inset ??= Settings.get(TARGET.POINT_OPTIONS.INSET);
    config.points3d ??= Settings.get(TARGET.POINT_OPTIONS.POINTS3D);
    config.grid ??= Settings.get(TARGET.LARGE);

      const collision = edgeCollision || (!liveForceHalfCover && tokenCollision);
      if ( collision ) numCornersBlocked += 1;
    }

    const percentCornersBlocked = numCornersBlocked / ln;
    const coverType = CoverCalculator.typeForPercentage(percentCornersBlocked);

    return ( liveForceHalfCover && tokenBlocks )
      ? Math.max(coverType, this.constructor.COVER_TYPES.LOW)
      : coverType;
  }

  /**
   * For debugging.
   * Color lines from point to points as yellow, red, or green depending on collisions.
   * @param {Point3d} tokenPoint        Point on the token to use.
   * @param {Point3d[]} targetPoints    Array of points on the target to test
   */
  _drawPointToPoints(tokenPoint, targetPoints, { alpha = 1, width = 1 } = {}) {
    const ln = targetPoints.length;
    for ( let i = 0; i < ln; i += 1 ) {
      const targetPoint = targetPoints[i];
      const tokenCollision = this._hasTokenCollision(tokenPoint, targetPoint);
      const edgeCollision = this._hasWallCollision(tokenPoint, targetPoint)
        || this._hasTileCollision(tokenPoint, targetPoint);

      const color = (tokenCollision && !edgeCollision) ? Draw.COLORS.yellow
        : edgeCollision ? Draw.COLORS.red : Draw.COLORS.green;

      Draw.segment({ A: tokenPoint, B: targetPoint }, { alpha, width, color });
    }
  }
}
