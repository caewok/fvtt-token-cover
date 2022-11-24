/* globals
game,
canvas,
ClockwiseSweepPolygon,
CONST,
PIXI,
Hooks,
socketlib,
VisionSource,
CONFIG,
Dialog,
Ray
*/

import { MODULE_ID, COVER_TYPES } from "./const.js";
import { getSetting, SETTINGS, getCoverName } from "./settings.js";
import { Area2d } from "./Area2d.js";
import { Area3d } from "./Area3d.js";
import * as drawing from "./drawing.js";
import {
  distanceBetweenPoints,
  pixelsToGridUnits,
  zValue,
  lineSegmentIntersectsQuadrilateral3d,
  lineIntersectionQuadrilateral3d,
  getObjectProperty } from "./util.js";

import { ClipperPaths } from "./geometry/ClipperPaths.js";
import { Point3d } from "./geometry/Point3d.js";
import { TokenPoints3d } from "./geometry/TokenPoints3d.js";

// ----- Set up sockets for changing effects on tokens and creating a dialog ----- //
// Don't pass complex classes through the socket. Use token ids instead.

export const SOCKETS = {
  socket: null
};

Hooks.once("socketlib.ready", () => {
  SOCKETS.socket = socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("dialogPromise", dialogPromise);
  SOCKETS.socket.register("disableCoverStatus", disableCoverStatus);
  SOCKETS.socket.register("enableCoverStatus", enableCoverStatus);
});

/**
 * Remove a cover status (ActiveEffect) from a token.
 * @param {COVER_TYPE} type
 * @param {string} tokenId
 */
async function disableCoverStatus(tokenId, type = COVER_TYPES.LOW) {
  if ( type === COVER_TYPES.NONE || type === COVER_TYPES.TOTAL ) return;

  const token = canvas.tokens.get(tokenId);
  if ( !token ) return;

  const keys = Object.keys(COVER_TYPES);
  const key = keys[type];
  if ( !key ) return;

  const id = `${MODULE_ID}.cover.${key}`;
  await token.document.toggleActiveEffect({ id }, { active: false });
}

/**
 * Enable a cover status (ActiveEffect) for a token
 * @param {string} tokenId
 * @param {COVER_TYPE} type
 */
async function enableCoverStatus(tokenId, type = COVER_TYPES.LOW) {
  if ( type === COVER_TYPES.NONE || type === COVER_TYPES.TOTAL ) return;

  const token = canvas.tokens.get(tokenId);
  if ( !token ) return;

  const keys = Object.keys(COVER_TYPES);
  const key = keys[type];
  if ( !key ) return;

  // If already exists, do not add again to avoid duplicate effects.
  const id = `${MODULE_ID}.cover.${key}`;
  const effect = CONFIG.statusEffects.find(effect => effect.id === id);
  if ( !effect ) return;

  const existing = token.document.actor.effects.find(e => e.getFlag("core", "statusId") === effect.id);
  if ( existing ) return;

  await token.document.toggleActiveEffect(effect, { active: true });
}

/**
 * Convert dialog to a promise to allow use with await/async.
 * @content HTML content for the dialog.
 * @return Promise for the html content of the dialog
 * Will return "Cancel" or "Close" if those are selected.
 */
export function dialogPromise(data, options = {}) {
  return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
    dialogCallback(data, html => resolve(html), options);
  });
}

/**
 * Create new dialog with a callback function that can be used for dialogPromise.
 * @content HTML content for the dialog.
 * @callbackFn Allows conversion of the callback to a promise using dialogPromise.
 * @return rendered dialog.
 */
function dialogCallback(data, callbackFn, options = {}) {
  data.buttons = {
    one: {
      icon: '<i class="fas fa-check"></i>',
      label: "Confirm",
      callback: html => callbackFn(html)
    }
  };

  data.default = "one";
  data.close = () => callbackFn("Close");

  let d = new Dialog(data, options);
  d.render(true, { height: "100%" });
}

/* Cover Calculation Class
 * Calculate cover between a token and target, based on different algorithms.
 */
export class CoverCalculator {

  /** @type {object} */
  static COVER_TYPES = COVER_TYPES;

  /** @type {object} */
  static ALGORITHMS = SETTINGS.COVER.TYPES;

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
  constructor(viewer, target) {
    this.viewer = viewer instanceof VisionSource ? viewer.object : viewer;
    this.target = target;
    this.debug = game.modules.get(MODULE_ID).api.debug.cover;

    const deadTokenAlg = getSetting(SETTINGS.COVER.DEAD_TOKENS.ALGORITHM);
    const deadTypes = SETTINGS.COVER.DEAD_TOKENS.TYPES;
    this.config = {
      type: "move",
      wallsBlock: true,
      tilesBlock: game.modules.get("levels")?.active,
      liveTokensBlock: getSetting(SETTINGS.COVER.LIVE_TOKENS),
      deadTokensBlock: deadTokenAlg !== deadTypes.NONE,
      deadHalfHeight: deadTokenAlg === deadTypes.HALF
    };
    this.config.tokensBlock = this.config.liveTokensBlock || this.config.deadTokensBlock;
  }

  /** @type {string} */
  static get currentAlgorithm() {
    return getSetting(SETTINGS.COVER.ALGORITHM);
  }

  /**
   * Get the corresponding name for a cover type.
   * @param {COVER_TYPES} type    Cover number
   * @returns {string}
   */
  static coverNameForType(type) {
    // TO-DO: Add the "None" name to settings
    if ( type === CoverCalculator.COVER_TYPES.NONE ) return "None";

    const key = Object.keys(CoverCalculator.COVER_TYPES)[type];
    return getCoverName(key);
  }

  /**
   * Get a description for an attack type
   * @param {string} type   all, mwak, msak, rwak, rsak
   * @returns {string}
   */
  static attackNameForType(type) {
    // TODO: localize
    switch ( type ) {
      case "all": return "all";
      case "mwak": return "melee weapon";
      case "msak": return "melee spell";
      case "rwak": return "ranged weapon";
      case "rsak": return "ranged spell";
    }
    return undefined;
  }

  static disableAllCoverStatus(tokenId) {
    // Don't really need to await in order to disable all... right?
    CoverCalculator.disableCoverStatus(tokenId, COVER_TYPES.LOW);
    CoverCalculator.disableCoverStatus(tokenId, COVER_TYPES.MEDIUM);
    CoverCalculator.disableCoverStatus(tokenId, COVER_TYPES.HIGH);
  }

  static async disableCoverStatus(tokenId, type = COVER_TYPES.LOW ) {
    // Test id is string for debugging
    if ( !(typeof tokenId === "string" || tokenId instanceof String) ) console.error("tokenId is not a string!");
    await SOCKETS.socket.executeAsGM("disableCoverStatus", tokenId, type);
  }

  static async enableCoverStatus(tokenId, type = COVER_TYPES.LOW ) {
    // Test id is string for debugging
    if ( !(typeof tokenId === "string" || tokenId instanceof String) ) console.error("tokenId is not a string!");
    await SOCKETS.socket.executeAsGM("enableCoverStatus", tokenId, type);
  }

  static async setCoverStatus(tokenId, type = COVER_TYPES.NONE ) {
    if ( type === COVER_TYPES.NONE
      || type === COVER_TYPES.TOTAL ) return CoverCalculator.disableAllCoverStatus(tokenId);

    return CoverCalculator.enableCoverStatus(tokenId, type);
  }

  /**
   * Run cover calculations for all targets against all tokens.
   * Ignore when token equals target.
   * @param {Token[]} tokens
   * @param {Token[]} targets
   * @returns {object{object{COVER_TYPE}}} Object with token ids, each with target id that has cover.
   */
  static coverCalculations(tokens, targets) {
    const calculations = {};

    for ( const token of tokens ) {
      const tokenCalcs = {};
      calculations[`${token.id}`] = tokenCalcs;
      for ( const target of targets ) {
        if ( target.id === token.id ) {
          tokenCalcs[`${target.id}`] = null;
        } else {
          const coverCalc = new CoverCalculator(token, target);
          tokenCalcs[`${target.id}`] = coverCalc.targetCover();
        }
      }
    }

    return calculations;
  }

  /**
   * Construct an html table describing cover for various target(s) versus token(s).
   * @param {Token[]} tokens    Array of tokens to measure cover from.
   * @param {Token[]} targets   Target tokens that may have cover from one or more tokens.
   * @param {object} [options]  Options that affect the html creation
   * @param {boolean} [options.include3dDistance]   Include 3d distance calculation.
   * @param {boolean} [options.includeZeroCover]  Include targets that have no cover in the resulting html.
   * @returns {object {html: {string}, nCover: {number}, coverResults: {COVER_TYPES[][]}}}
   *   String of html content that can be used in a Dialog or ChatMessage.
   */
  static htmlCoverTable(tokens, targets, {
    include3dDistance = true,
    includeZeroCover = true,
    imageWidth = 50,
    coverCalculations,
    actionType,
    applied = false,
    displayIgnored = true } = {}) {

    if ( game.modules.get(MODULE_ID).api.debug.cover ) drawing.clearDrawings();
    if ( !coverCalculations ) coverCalculations = CoverCalculator.coverCalculations(tokens, targets);

    let html = "";
    const coverResults = [];
    let nCoverTotal = 0;
    for ( const token of tokens ) {
      let nCover = 0;
      const targetCoverResults = [];
      coverResults.push(targetCoverResults);
      const token_center = new Point3d(token.center.x, token.center.y, token.topZ); // Measure from token vision point.

      const distHeader = include3dDistance ? '<th style="text-align: right"><b>Dist. (3d)</b></th>' : "";
      let htmlTable =
      `
      <table id="${token.id}_table" class="table table-striped">
      <thead>
        <tr class="character-row">
          <th colspan="2" ><b>Target</b></th>
          <th style="text-align: left"><b>${applied ? "Applied Cover" : "Cover"}</b></th>
          ${distHeader}
        </tr>
      </thead>
      <tbody>
      `;

      for ( const target of targets ) {
        if ( token.id === target.id ) {
          // Skip targeting oneself.
          targetCoverResults.push(COVER_TYPES.NONE);
          continue;
        }

        const target_center = new Point3d(
          target.center.x,
          target.center.y,
          CoverCalculator.averageTokenElevationZ(target));

        const cover = coverCalculations[token.id][target.id];

        targetCoverResults.push(cover);

        if ( !includeZeroCover && cover === COVER_TYPES.NONE ) continue;
        if ( cover !== COVER_TYPES.NONE ) nCover += 1;

        const targetImage = target.document.texture.src; // Token canvas image.
        const dist = distanceBetweenPoints(token_center, target_center);
        const distContent = include3dDistance ? `<td style="text-align: right">${Math.round(pixelsToGridUnits(dist))} ${canvas.scene.grid.units}</td>` : "";

        htmlTable +=
        `
        <tr>
        <td><img src="${targetImage}" alt="${target.name} image" width="${imageWidth}" style="border:0px"></td>
        <td>${target.name}</td>
        <td>${CoverCalculator.coverNameForType(cover)}</td>
        ${distContent}
        </tr>
        `;
      }

      htmlTable +=
      `
      </tbody>
      </table>
      <br>
      `;

      // Describe the types of cover ignored by the token
      // If actionType is defined, use that to limit the types
      let ignoresCoverLabel = "";

      if ( displayIgnored ) {
        const ic = token.ignoresCoverType;
        if ( ic.all > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.all)} cover (${CoverCalculator.attackNameForType("all")} attacks)`;
        if ( actionType && ic[actionType] > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic[actionType])} cover (${CoverCalculator.attackNameForType(actionType)} attacks)`;

        else { // Test them all...
          if ( ic.mwak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.mwak)} cover (${CoverCalculator.attackNameForType("mwak")} attacks)`;
          if ( ic.msak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.msak)} cover (${CoverCalculator.attackNameForType("msak")} attacks)`;
          if ( ic.rwak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.rwak)} cover (${CoverCalculator.attackNameForType("rwak")} attacks)`;
          if ( ic.rsak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.rsak)} cover (${CoverCalculator.attackNameForType("rsak")} attacks)`;
        }

        if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = `<br><em>${token.name} ignores:${ignoresCoverLabel}</em>`;
      }

      const targetLabel = `${nCover} target${nCover === 1 ? "" : "s"}`;
      const numCoverLabel = applied
        ? nCover === 1 ? "has" : "have"
        : "may have"

      htmlTable =
      `
      ${targetLabel} ${numCoverLabel} cover from <b>${token.name}</b>.
      ${ignoresCoverLabel}
      ${htmlTable}
      `;

      nCoverTotal += nCover;
      if ( includeZeroCover || nCover ) html += htmlTable;
    }

    return {
      nCoverTotal,
      html,
      coverResults
    };
  }

  /**
   * 3d position of the viewer.
   * Defaults to viewer losHeight or elevation otherwise, in center of the viewer token.
   * @type {Point3d}
   */
  get viewerCenter() {
    return new Point3d(this.viewer.center.x, this.viewer.center.y, this.viewer.topZ);
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
    let coverType = COVER_TYPES.NONE;

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
    switch ( type ) {
      case COVER_TYPES.NONE:
      case COVER_TYPES.FULL:
        CoverCalculator.disableAllCoverStatus(this.target.id);
        break;
      case COVER_TYPES.LOW:
      case COVER_TYPES.MEDIUM:
      case COVER_TYPES.HIGH:
        CoverCalculator.enableCoverStatus(this.target.id, type);
    }
  }

  _hasWallCollision(tokenPoint, targetPoint) {
    const mode = "any";
    const type = this.config.type;
    return ClockwiseSweepPolygon.testCollision3d(tokenPoint, targetPoint, { type, mode });
  }

  _hasTileCollision(tokenPoint, targetPoint) {
    const ray = new Ray(tokenPoint, targetPoint);
    const tiles = canvas.tiles.quadtree.getObjects(ray.bounds);

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
      const elevationZ = zValue(elevation);

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
    const { liveTokensBlock, deadTokensBlock, deadHalfHeight } = this.config;
    const ray = new Ray(tokenPoint, targetPoint);
    let tokens = canvas.tokens.quadtree.getObjects(ray.bounds);
    const hpAttribute = getSetting(SETTINGS.COVER.DEAD_TOKENS.ATTRIBUTE);

    // Filter out the viewer and target token
    tokens.delete(this.viewer);
    tokens.delete(this.target);

    // Filter live or dead tokens
    if ( liveTokensBlock ^ deadTokensBlock ) {
      tokens = tokens.filter(t => {
        const hp = getObjectProperty(t.actor, hpAttribute);
        if ( typeof hp !== "number" ) return true;

        if ( liveTokensBlock && hp > 0 ) return true;
        if ( deadTokensBlock && hp <= 0 ) return true;
        return false;
      });
    }

    // Construct the TokenPoints3d for each token, using half-height if required
    if ( deadHalfHeight ) {
      tokens = tokens.map(t => {
        const hp = getObjectProperty(t.actor, hpAttribute);
        const halfHeight = (typeof hp === "number") && (hp <= 0);
        return new TokenPoints3d(t, { type: this.config.type, halfHeight });
      });
    } else {
      tokens = tokens.map(t => new TokenPoints3d(t, { type: this.config.type, halfHeight: false }));
    }

    // Set viewing position and test token sides for collisions
    for ( const token of tokens ) {
      const sides = token._viewableFaces(tokenPoint);
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

  /**
   * Determine if there is a collision between two 3d points.
   * Depending on configuration, accounts for tokens and tiles as well as walls.
   */
  _hasCollision(tokenPoint, targetPoint) {
    const { wallsBlock, tokensBlock, tilesBlock } = this.config;

    if ( wallsBlock && this._hasWallCollision(tokenPoint, targetPoint) ) return true;
    if ( tilesBlock && this._hasTileCollision(tokenPoint, targetPoint) ) return true;
    if ( tokensBlock && this._hasTokenCollision(tokenPoint, targetPoint) ) return true;

    return false;
  }

  // ----- COVER ALGORITHM METHODS ----- //

  /**
   * Test cover based on PF2e approach of measuring token center to target center.
   * @returns {COVER_TYPE}    Will be either NONE or MEDIUM
   */
  centerToCenter() {
    this.debug && console.log("Cover algorithm: Center-to-Center"); // eslint-disable-line no-unused-expressions

    // TO-DO: Test visibility? This is hard b/c testVisibility assumes a token is selected.
    // Test visibility is thus a per-user test.

    // Test all non-infinite walls for collisions
    const tokenPoint = this.viewerCenter;
    const targetPoint = new Point3d(this.target.center.x, this.target.center.y, this.targetAvgElevationZ);

    const { wallsBlock, tokensBlock, tilesBlock } = this.config;

    const collision = (wallsBlock && this._hasWallCollision(tokenPoint, targetPoint))
      || (tilesBlock && this._hasTileCollision(tokenPoint, targetPoint));

    this.debug && drawing.drawSegment(  // eslint-disable-line no-unused-expressions
      {A: tokenPoint, B: targetPoint},
      { color: collision ? drawing.COLORS.red : drawing.COLORS.green });

    if ( collision ) return COVER_TYPES[getSetting(SETTINGS.COVER.TRIGGER_CENTER)];

    if ( tokensBlock ) {
      const collision = this._hasTokenCollision(tokenPoint, targetPoint);
      if ( collision ) {
        this.debug && drawing.drawSegment(  // eslint-disable-line no-unused-expressions
          {A: tokenPoint, B: targetPoint},
          { color: collision ? drawing.COLORS.lightred : drawing.COLORS.lightgreen });
        return Math.max(COVER_TYPES.NONE, COVER_TYPES[getSetting(SETTINGS.COVER.TRIGGER_CENTER)] - 1);
      }
    }

    return COVER_TYPES.NONE;
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
  cornerToTargetCorners() {
    this.debug && console.log("Cover algorithm: Corner-to-Corners"); // eslint-disable-line no-unused-expressions

    const tokenCorners = this._getCorners(this.viewer.constrainedTokenBorder, this.viewer.topZ);
    const targetPoints = this._getCorners(this.target.constrainedTokenBorder, this.targetAvgElevationZ);

    return this._testTokenTargetPoints(tokenCorners, [targetPoints]);
  }

  /**
   * Test cover based on center-to-corners test. This is a simpler version of the DMG dnd5e test.
   * If the token covers multiple squares, this version selects the token square with the least cover.
   * It is assumed that "center" is at the losHeight elevation, and corners are
   * at the mean height of the token.
   * @returns {COVER_TYPE}
   */
  centerToTargetGridCorners() {
    this.debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions

    const targetShapes = CoverCalculator.constrainedGridShapesUnderToken(this.target);
    const targetElevation = this.targetAvgElevation;
    const targetPointsArray = targetShapes.map(targetShape => this._getCorners(targetShape, targetElevation));

    return this._testTokenTargetPoints([this.viewerCenter], targetPointsArray);
  }

  /**
   * Test cover based on corner-to-corners test. This is a simpler version of the DMG dnd5e test.
   * Runs a collision test on all corners of the token, and takes the best one
   * from the perspective of the token (the corner that provides least cover).
   * @returns {COVER_TYPE}
   */
  cornerToTargetGridCorners() {
    this.debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions

    const tokenCorners = this._getCorners(this.viewer.constrainedTokenBorder, this.viewer.topZ);
    const targetShapes = CoverCalculator.constrainedGridShapesUnderToken(this.target);
    const targetElevationZ = this.targetAvgElevationZ;
    const targetPointsArray = targetShapes.map(targetShape => this._getCorners(targetShape, targetElevationZ));

    return this._testTokenTargetPoints(tokenCorners, targetPointsArray);
  }

  /**
   * Test cover based on center to cube test.
   * If target has a defined height, test the corners of the cube target.
   * Otherwise, call coverCenterToCorners.
   * @returns {COVER_TYPE}
   */
  centerToCube() {
    this.debug && console.log("Cover algorithm: Center-to-Cube"); // eslint-disable-line no-unused-expressions

    if ( !this.targetHeight ) return this.centerToTargetCorners();

    const targetShape = this.target.constrainedTokenBorder;
    const targetPoints = [
      ...this._getCorners(targetShape, this.target.topZ),
      ...this._getCorners(targetShape, this.target.bottomZ)];

    return this._testTokenTargetPoints([this.viewerCenter], [targetPoints]);
  }

  /**
   * Test cover based on cube to cube test.
   * If target has a defined height, test the corners of the cube target.
   * Otherwise, call coverCornerToCorners.
   * @returns {COVER_TYPE}
   */
  cubeToCube() {
    this.debug && console.log("Cover algorithm: Cube-to-Cube"); // eslint-disable-line no-unused-expressions

    if ( !this.targetHeight ) return this.centerToTargetCorners();

    const tokenCorners = this._getCorners(this.viewer.constrainedTokenBorder, this.viewer.topZ);
    const targetShape = this.target.constrainedTokenBorder;
    const targetPoints = [
      ...this._getCorners(targetShape, this.target.topZ),
      ...this._getCorners(targetShape, this.target.bottomZ)];

    return this._testTokenTargetPoints(tokenCorners, [targetPoints]);
  }

  /**
   * Test cover based on area
   * @returns {COVER_TYPE}
   */
  area2d() {
    this.debug && console.log("Cover algorithm: Area"); // eslint-disable-line no-unused-expressions

    const percentCover = 1 - this._percentVisible(Area2d);
    this.debug && console.log(`Cover percentage ${percentCover}`); // eslint-disable-line no-unused-expressions

    return CoverCalculator.typeForPercentage(percentCover);
  }

  /**
   * Test cover based on "3d" area.
   * Construct the view from the token looking at the target.
   * Calculate the viewable area of the target from that perspective.
   * @returns {COVER_TYPE}
   */
  area3d() {
    this.debug && console.log("Cover algorithm: Area 3d"); // eslint-disable-line no-unused-expressions

    const percentCover = 1 - this._percentVisible(Area3d);
    this.debug && console.log(`Cover percentage ${percentCover}`); // eslint-disable-line no-unused-expressions

    return CoverCalculator.typeForPercentage(percentCover);
  }

  // ----- HELPER METHODS ----- //

  /**
   * Get a cover type based on percentage cover.
   * @param {number} percentCover
   * @returns {COVER_TYPE}
   */
  static typeForPercentage(percentCover) {
    if ( percentCover >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.HIGH) ) return COVER_TYPES.HIGH;
    if ( percentCover >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM) ) return COVER_TYPES.MEDIUM;
    if ( percentCover >= getSetting(SETTINGS.COVER.TRIGGER_PERCENT.LOW) ) return COVER_TYPES.LOW;
    return COVER_TYPES.NONE;
  }

  /**
   * Test an array of token points against an array of target points.
   * Each tokenPoint will be tested against every array of targetPoints. Lowest cover wins.
   * @param {Point3d[]} tokenPoints           Array of viewer points.
   * @param {Point3d[][]} targetPointsArray   Array of array of target points to test.
   * @returns {COVER_TYPE}
   */
  _testTokenTargetPoints(tokenPoints, targetPointsArray) {
    let minCover = COVER_TYPES.TOTAL;
    const minPointData = { tokenPoint: undefined, targetPoints: undefined }; // Debugging

    for ( const tokenPoint of tokenPoints ) {
      for ( const targetPoints of targetPointsArray ) {
        // We can escape early if we have discovered a no-cover option!
        const cover = this._testPointToPoints(tokenPoint, targetPoints);
        if ( cover === COVER_TYPES.NONE ) {
          this.debug && this._drawPointToPoints(tokenPoint, targetPoints, { width: 2 });  // eslint-disable-line no-unused-expressions
          return COVER_TYPES.NONE;
        }

        if ( this.debug && cover < minCover ) {
          minPointData.tokenPoint = tokenPoint;
          minPointData.targetPoints = targetPoints;
        }

        minCover = Math.min(minCover, cover);

        this.debug && this._drawPointToPoints(tokenPoint, targetPoints, { alpha: 0.1 }); // eslint-disable-line no-unused-expressions
      }
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
    return token.bottomZ + ((token.topZ - token.bottomZ) * 0.5);
  }

  /**
   * Helper that constructs 3d points for the points of a token shape (rectangle or polygon).
   * Uses the elevation provided as the z-value.
   * @param {PIXI.Polygon|PIXI.Rectangle} tokenShape
   * @parma {number} elevation
   * @returns {Point3d[]} Array of corner points.
   */
  _getCorners(tokenShape, elevation) {
    if ( tokenShape instanceof PIXI.Rectangle ) {
      // Token unconstrained by walls.
      // Use corners 1 pixel in to ensure collisions if there is an adjacent wall.
      tokenShape.pad(-1);
      return [
        new Point3d(tokenShape.left, tokenShape.top, elevation),
        new Point3d(tokenShape.right, tokenShape.top, elevation),
        new Point3d(tokenShape.right, tokenShape.bottom, elevation),
        new Point3d(tokenShape.left, tokenShape.bottom, elevation)
      ];
    }

    // Constrained is polygon. Only use corners of polygon
    // Scale down polygon to avoid adjacent walls.
    const padShape = tokenShape.pad(-2, { scalingFactor: 100 });
    return [...padShape.iteratePoints({close: false})].map(pt => new Point3d(pt.x, pt.y, elevation));
  }

  /**
   * Helper that tests collisions between a given point and a target points.
   * @param {Point3d} tokenPoint        Point on the token to use.
   * @param {Point3d[]} targetPoints    Array of points on the target to test
   * @returns {COVER_TYPE}
   */
  _testPointToPoints(tokenPoint, targetPoints) {
    let numCornersBlocked = 0;
    const ln = targetPoints.length;
    for ( let i = 0; i < ln; i += 1 ) {
      const targetPoint = targetPoints[i];
      const collision = this._hasCollision(tokenPoint, targetPoint);
      if ( collision ) numCornersBlocked += 1;
    }

    const percentCornersBlocked = numCornersBlocked / ln;
    return CoverCalculator.typeForPercentage(percentCornersBlocked);
  }

  /**
   * Determine the percent of the target top or bottom visible to the viewer.
   * @param {Area2d|Area3d} Area    Class to use to calculate percent visibility
   * @returns {number} Percentage seen, of the total target top or bottom area.
   */
  _percentVisible(Area) {
    const deadTokenAlg = getSetting(SETTINGS.COVER.DEAD_TOKENS.ALGORITHM);
    const deadTypes = SETTINGS.COVER.DEAD_TOKENS.TYPES;
    const config = {
      type: "move",
      wallsBlock: true,
      tilesBlock: game.modules.get("levels")?.active,
      liveTokensBlock: getSetting(SETTINGS.COVER.LIVE_TOKENS),
      deadTokensBlock: deadTokenAlg !== deadTypes.NONE,
      deadHalfHeight: deadTokenAlg === deadTypes.HALF
    };

    const area = new Area(this.viewer, this.target, config);
    if ( this.debug ) area.debug = true;
    return area.percentAreaVisible();
  }

  /**
   * For debugging.
   * Color lines from point to points as red or green depending on collisions.
   * @param {Point3d} tokenPoint        Point on the token to use.
   * @param {Point3d[]} targetPoints    Array of points on the target to test
   */
  _drawPointToPoints(tokenPoint, targetPoints, { alpha = 1, width = 1 } = {}) {
    const ln = targetPoints.length;
    for ( let i = 0; i < ln; i += 1 ) {
      const targetPoint = targetPoints[i];
      const collision = this._hasCollision(tokenPoint, targetPoint);

      drawing.drawSegment(  // eslint-disable-line no-unused-expressions
        {A: tokenPoint, B: targetPoint},
        { alpha, width, color: collision ? drawing.COLORS.red : drawing.COLORS.green });
    }
  }
}

/**
 * Get an array of all the squares under a token
 * @param {Token} token
 * @returns {PIXI.Rectangle[]}
 */
function squaresUnderToken(token) {
  const tX = token.x;
  const tY = token.y;

  const w = token.document.width;
  const h = token.document.height;

  const r1 = canvas.grid.grid.getRect(1, 1);
  const r = canvas.grid.grid.getRect(w, h);

  const wRem = r.width % r1.width;
  const hRem = r.height % r1.height;

  const wMult = Math.floor(w);
  const hMult = Math.floor(h);

  const squares = [];
  const baseRect = new PIXI.Rectangle(tX, tY, r1.width, r1.height);
  for ( let i = 0; i < wMult; i += 1 ) {
    for ( let j = 0; j < hMult; j += 1 ) {
      squares.push(baseRect.translate(i * r1.width, j * r1.height));
    }
  }

  if ( wRem ) {
    // Add partial width rectangles on the right
    const x = (wMult * r1.width )+ tX;
    for ( let j = 0; j < hMult; j += 1 ) {
      const y = (j * r1.height) + tY;
      squares.push(new PIXI.Rectangle(x, y, wRem, r1.height));
    }
  }

  if ( hRem ) {
    // Add partial height rectangles on the bottom
    const y = (hMult * r1.height) + tX;
    for ( let i = 0; i < wMult; i += 1 ) {
      const x = (i * r1.width) + tY;
      squares.push(new PIXI.Rectangle(x, y, r1.width, hRem));
    }
  }

  if ( wRem && hRem ) {
    const x = (wMult * r1.width) + tX;
    const y = (hMult * r1.height) + tY;
    squares.push(new PIXI.Rectangle(x, y, wRem, hRem));
  }

  return squares;
}

/**
 * Get an array of all the hexes under a token.
 * Like base Foundry, defaults to squares under token if token width/height is not 1, 2, 3 or 4.
 * See HexagonalGrid.prototype.getBorderPolygon for just the border
 * @param {Token} token
 * @returns {PIXI.Polygon[]}
 */
function hexesUnderToken(token) {
  const tX = token.x;
  const tY = token.y;

  const w = token.document.width;
  const h = token.document.height;
  if ( w !== h || w > 4 ) return squaresUnderToken(token);

  const hexes = [];
  const isColumnar = canvas.grid.grid.columnar;
  switch (w) {
    case 1:
      hexes.push(hexes1());
      break;
    case 2:
      hexes.push(...(isColumnar ? colHexes2(tX, tY) : rowHexes2(tX, tY)));
      break;

    case 3:
      hexes.push(...(isColumnar ? colHexes3(tX, tY) : rowHexes3(tX, tY)));
      break;

    case 4:
      hexes.push(...(isColumnar ? colHexes4(tX, tY) : rowHexes4(tX, tY)));
      break;
  }

  /* Test:
    polyBorder = new PIXI.Polygon(canvas.grid.grid.getBorderPolygon(token.document.width, token.document.height, 0))
    drawing.drawShape(polyBorder, { color: drawing.COLORS.blue })
    hexes = hexesUnderToken(token)
    hexes.forEach(hex => drawing.drawShape(hex, { color: drawing.COLORS.red }))
  */

  if ( hexes.length === 0 ) return squaresUnderToken(token);

  return hexes;
}

function hexes1(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  return new PIXI.Point(canvas.grid.grid.getPolygon(x, y, r1.width, r1.height));
}

// 2: Forms triangle.  •
//                    • •
function rowHexes2(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

  return [
    baseHex.translate(halfCol, 0),
    baseHex.translate(0, row),
    baseHex.translate(col, row)
  ];
}

/** 3: Forms • •
 *          • • •
 *           • •
 */
function rowHexes3(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

  return [
    baseHex.translate(halfCol, 0),
    baseHex.translate(halfCol + col, 0),

    baseHex.translate(0, row),
    baseHex.translate(col, row),
    baseHex.translate(col * 2, row),

    baseHex.translate(halfCol, row * 2),
    baseHex.translate(halfCol + col, row * 2)
  ];
}

// 4: Forms • • •
//         • • • •
//          • • •
//           • •
function rowHexes4(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width;
  const row = r1.height * .75;
  const halfCol = col * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

  return [
    baseHex.translate(halfCol, 0),
    baseHex.translate(halfCol + col, 0),
    baseHex.translate(halfCol + (col * 2), 0),

    baseHex.translate(0, row),
    baseHex.translate(col, row),
    baseHex.translate(col * 2, row),
    baseHex.translate(col * 3, row),

    baseHex.translate(halfCol, row * 2),
    baseHex.translate(halfCol + col, row * 2),
    baseHex.translate(halfCol + (col * 2), row * 2),

    baseHex.translate(col, row * 3),
    baseHex.translate(col * 2, row * 3)
  ];
}

/** 2: Forms triangle.  •
 *                    •
 *                      •
 */
function colHexes2(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

  return [
    baseHex.translate(col, 0),
    baseHex.translate(0, halfRow),
    baseHex.translate(col, row)
  ];
}

/* 3: Forms  •
 *         •   •
 *           •
 *         •   •
 *           •
 */
function colHexes3(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

  return [
    baseHex.translate(col, 0),

    baseHex.translate(0, halfRow),
    baseHex.translate(col * 2, halfRow),

    baseHex.translate(col, row),

    baseHex.translate(0, halfRow + row),
    baseHex.translate(col * 2, halfRow + row),

    baseHex.translate(col, row * 2)
  ];
}

/* 4: Forms   •
 *          •   •
 *            •   •
 *          •   •
 *            •   •
 *          •   •
 *            •
 */
function colHexes4(x = 0, y = 0) {
  const r1 = canvas.grid.grid.getRect(1, 1);
  const col = r1.width * .75;
  const row = r1.height;
  const halfRow = row * .50;
  const hexW = r1.width;
  const hexH = r1.height;
  const baseHex = new PIXI.Polygon(canvas.grid.grid.getPolygon(x, y, hexW, hexH));

  return [
    baseHex.translate(col, 0),

    baseHex.translate(0, halfRow),
    baseHex.translate(col * 2, halfRow),

    baseHex.translate(col, row),
    baseHex.translate(col * 3, row),

    baseHex.translate(0, halfRow + row),
    baseHex.translate(col * 2, halfRow + row),

    baseHex.translate(col, row * 2),
    baseHex.translate(col * 3, row * 2),

    baseHex.translate(0, halfRow + (row * 2)),
    baseHex.translate(col * 2, halfRow + (row * 2)),

    baseHex.translate(col, row * 3)
  ];
}
