/* globals
ClockwiseSweepPolygon,
game,
PIXI,
canvas,
CONST,
CONFIG,
Token
*/
"use strict";

/* Cover options

1. Center to Center -- PF2e
Measure center of token to center of target

2.


/* Cover testing types:
1. Center to 4 Corners -- from the center point of the token to 4 corners
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
2. Corner to Four Corner -- DMG rules; vision from each occupied grid point
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
3. Center to Center -- PF2e version
3/4 (standard)
4. Area
Half trigger: % area
3/4 trigger: % area
full trigger: % area

3D versions ( same triggers )
5. Center to cube corners
6. Cube corner to cube corners
7. 3d Area


Other settings:
GM can provide the name of an active effect to apply when covered. Applies to the token with cover.
- low active effect
- medium active effect
- high active effect

Cover Names:
Generic: low, medium, high
PF2e: lesser, standard, greater
dnd5e: half, 3/4, full

*/

import { MODULE_ID, COVER_TYPES } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { Point3d } from "./Point3d.js";
import { ClipperPaths } from "./ClipperPaths.js";
import { Area2d } from "./Area2d.js";
import { Area3d } from "./Area3d.js";
import * as drawing from "./drawing.js";


export function addCoverStatuses() {
  CONFIG.statusEffects.push({
    id: `${MODULE_ID}.cover.LOW`,
    label: getSetting(SETTINGS.COVER.NAMES.LOW),
    icon: `modules/${MODULE_ID}/assets/shield-halved.svg`,
    changes: [
      {
        key: "system.attributes.ac.bonus",
        mode: 2,
        value: "+2"
      },

      {
        key: "system.attributes.dex.saveBonus",
        mode: 2,
        value: "+2"
      }
    ]
  });

  CONFIG.statusEffects.push({
    id: `${MODULE_ID}.cover.MEDIUM`,
    label: getSetting(SETTINGS.COVER.NAMES.MEDIUM),
    icon: `modules/${MODULE_ID}/assets/shield-virus.svg`,
    changes: [
      {
        key: "system.attributes.ac.bonus",
        mode: 2,
        value: "+5"
      },

      {
        key: "system.attributes.dex.saveBonus",
        mode: 2,
        value: "+5"
      }
    ]
  });

  CONFIG.statusEffects.push({
    id: `${MODULE_ID}.cover.HIGH`,
    label: getSetting(SETTINGS.COVER.NAMES.HIGH),
    icon: `modules/${MODULE_ID}/assets/shield.svg`
  });

}

/* Options for determining cover.
1. Any player can run the Cover macro to determine cover for each token--> target combo.

If no combat:
- selecting a single token and then targeting 1+ will impose status effects.
- selecting multiple tokens will remove status effects?

If combat:
- Cover switches to only the current user.
- cover calculated like the no combat scenario otherwise.
- cover calculated for the

On attack:
- Settings permit user decides, GM decides, or automatic
- User decides: Pop up dialog confirm to user prior to attack proceeding
- GM decides: Pop dialog confirm to GM prior to attack proceeding


Can manually set cover status but it will only last until targets change...
Provide setting for manual only

*/

/**
 * Hook token updates to adjust cover status if moving.
 *
 * A hook event that fires for every Document type after conclusion of an update workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "updateActor".
 * This hook fires for all connected clients after the update has been processed.
 *
 * @event updateDocument
 * @category Document
 * @param {Document} document                       The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
export function updateToken(document, change, options, userId) {
  // Only care about x, y, and elevation changes
  if ( !Object.hasOwnProperty("x")
    && !Object.hasOwnProperty("y")
    && !!Object.hasOwnProperty("z") ) return;

  // Only track cover when in combat.
  if ( !game.combat?.started ) return;

  // If this token is targeted by an owner of the current combatant, update cover



  // If in combat and this token is the current combatant, update all targets


}



/**
 * Wrap TokenDocument.prototype.toggleActiveEffect
 * If adding a cover effect, remove other cover effects
 */
export async function toggleActiveEffectTokenDocument(wrapper, effectData, { overlay=false, active}={}) {
  const state = await wrapper(effectData, {overlay, active});
  if ( !state ) return; // No new effect added.
  const tokenD = this;

  switch ( effectData.id ) {
    case `${MODULE_ID}.cover.LOW`:
      disableCoverStatus(tokenD, COVER_TYPES.MEDIUM);
      disableCoverStatus(tokenD, COVER_TYPES.HIGH);
      break;
    case `${MODULE_ID}.cover.MEDIUM`:
      disableCoverStatus(tokenD, COVER_TYPES.LOW);
      disableCoverStatus(tokenD, COVER_TYPES.HIGH);
      break;
    case `${MODULE_ID}.cover.HIGH`:
      disableCoverStatus(tokenD, COVER_TYPES.LOW);
      disableCoverStatus(tokenD, COVER_TYPES.MEDIUM);
      break;
  }

  return state;
}
export function combatTurnHook(combat, updateData, updateOptions) {
//   updateData.round
//   updateData.turn

  const c = combat.combatant;
  const playerOwners = c.players;

  // Clear cover status of all tokens in the scene
  // Unless the token is targeted by the current user
  const tokens = canvas.tokens.placeables;

  const userTargetedTokens = [];
  tokens.forEach(t => {
    if ( playerOwners.some(owner => t.targeted.has(owner)) ) {
      userTargetedTokens.push(t);
    }
    CoverCalculator.disableAllCoverStatus(t.document);
  });

  // Calculate cover from combatant to any currently targeted tokens
  const combatToken = c.combatant.token.object;
  for ( const target of userTargetedTokens ) {
    const coverCalc = new CoverCalculator(combatToken, target);
    coverCalc.setTargetCoverEffect();
  }
}

/**
 * If a token is targeted, determine its cover status.
 *
 * A hook event that fires when a token is targeted or un-targeted.
 * @function targetToken
 * @memberof hookEvents
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
export function targetTokenHook(user, target, targeted) {
  // If not in combat, do nothing because it is unclear who is targeting what...
  if ( !game.combat?.started ) return;

  // Ignore targeting by other users
  if ( !isUserCombatTurn(user) ) return;

  if ( !targeted ) {
    CoverCalculator.disableAllCoverStatus(tokenD);
    return;
  }

  // Target from the current combatant to the target token
  const c = game.combats.active;
  const combatToken = c.combatant.token.object;
  const coverCalc = new CoverCalculator(combatToken, target)
  coverCalc.setTargetCoverEffect();
}

/**
 * Determine if the user's token is the current combatant in the active tracker.
 * @param {User} user
 * @returns {boolean}
 */
function isUserCombatTurn(user) {
  if ( !game.combat?.started ) return;

  const c = game.combats.active;
  // If no players, than it must be a GM token
  if ( !c.combatant.players.length ) return user.isGM;

  let isCurrentPlayer = false;
  return c.combatant.players.some(player => user.name === player.name);
}




/* Cover Calculation Class
 * Calculate cover between a token and target, based on different algorithms.
 */
export class CoverCalculator {
  static COVER_TYPES = COVER_TYPES;

  static ALGORITHMS = SETTINGS.COVER.TYPES;

  /**
   * Get the corresponding name for a cover type.
   * @param {COVER_TYPES} type    Cover number
   * @returns {string}
   */
  static coverNameForType(type) {
    // TO-DO: Add the "None" name to settings
    if ( type === CoverCalculator.COVER_TYPES.NONE ) return "None";

    const key = Object.keys(CoverCalculator.COVER_TYPES)[type]
    return getSetting(SETTINGS.COVER.NAMES[key]);
  }

  static function disableAllCoverStatus(tokenD) {
    CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.LOW);
    CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.MEDIUM);
    CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.HIGH);
  }

  static function disableCoverStatus(tokenD, type = COVER_TYPES.LOW ) {
    if ( type === COVER_TYPES.NONE || type === COVER_TYPES.TOTAL ) return;

    const keys = Object.keys(COVER_TYPES);
    const key = keys[type];
    if ( !key ) return;

    const id = `${MODULE_ID}.cover.${key}`;
    tokenD.toggleActiveEffect({ id }, { active: false });
  }

  static function enableCoverStatus(tokenD, type = COVER_TYPES.LOW ) {
     if ( type === COVER_TYPES.NONE || type === COVER_TYPES.TOTAL ) return;

    const keys = Object.keys(COVER_TYPES);
    const key = keys[type];
    if ( !key ) return;

    const id = `${MODULE_ID}.cover.${key}`;
    tokenD.toggleActiveEffect({ id }, { active: true });
  }

  /**
   * @param {VisionSource|Token} viewer
   * @param {Token} target
   */
  constructor(viewer, target) {
    this.viewer = viewer instanceof Token ? viewer.vision : viewer;
    this.target = target;
    this.debug = game.modules.get(MODULE_ID).api.debug;
  }

  /**
   * 3d position of the viewer.
   * Defaults to viewer losHeight or elevation otherwise, in center of the viewer token.
   * @type {Point3d}
   */
  get viewerCenter() {
    return new Point3d(this.viewer.x, this.viewer.y, this.viewer.topZ);
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
  get targetAvgElevation() {
    return CoverCalculator.averageTokenElevation(this.target);
  }

  // ----- MAIN USER METHODS ----- //

  /**
   * Basic switch to calculate cover based on selected algorithm.
   * Defaults to the cover algorithm setting selected by the GM.
   * @param {string} algorithm
   * @returns {COVER_TYPE}
   */
  targetCover(algorithm = getSetting(SETTINGS.COVER.ALGORITHM)) {
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
    return COVER_TYPES.NONE;
  }

  /**
   * Set the target cover effect.
   * If cover is none, disables any cover effects.
   * @param {COVER.TYPE} type   Cover type. Default to calculating.
   */
  setTargetCoverEffect(type = this.targetCover()) {
    const targetD = this.target.document;

    switch ( type ) {
      case COVER_TYPES.NONE:
      case COVER_TYPES.FULL:
        this.removeTargetCoverEffect();
        break;
      case COVER_TYPES.LOW:
      case COVER_TYPES.MEDIUM:
      case COVER_TYPES.HIGH:
        CoverCalculator.enableCoverStatus(targetD, type)
     }
  }

  /**
   * Remove target cover effect, if any.
   */
  removeTargetCoverEffect() {
    const targetD = this.target.document;
    CoverCalculator.disableCoverStatus(targetD, COVER_TYPES.LOW);
    CoverCalculator.disableCoverStatus(targetD, COVER_TYPES.MEDIUM);
    CoverCalculator.disableCoverStatus(targetD, COVER_TYPES.HIGH);
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
    const targetPoint = new Point3d(this.target.center.x, this.target.center.y, this.targetAvgElevation);
    const collision = ClockwiseSweepPolygon.testCollision3d(tokenPoint, targetPoint, { type: "sight", mode: "any" });

    this.debug && drawing.drawSegment(  // eslint-disable-line no-unused-expressions
      {A: tokenPoint, B: targetPoint},
      { color: collision ? drawing.COLORS.red : drawing.COLORS.green });

    if ( collision ) return COVER_TYPES[getSetting(SETTINGS.COVER.TRIGGER_CENTER)];
    else return COVER_TYPES.NONE;
  }

  /**
   * Test cover based on center-to-corners test. This is a simpler version of the DMG dnd5e test.
   * It is assumed that "center" is at the losHeight elevation, and corners are
   * at the mean height of the token.
   * @returns {COVER_TYPE}
   */
  centerToTargetCorners() {
    this.debug && console.log("Cover algorithm: Center-to-Corners"); // eslint-disable-line no-unused-expressions

    const targetPoints = this._getCorners(this.target.constrainedTokenShape, this.targetAvgElevation);

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

    const tokenCorners = this._getCorners(this.viewer.object.constrainedTokenShape, this.viewer.elevationZ);
    const targetPoints = this._getCorners(this.target.constrainedTokenShape, this.targetAvgElevation);

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

    const tokenCorners = this._getCorners(this.viewer.object.constrainedTokenShape, this.viewer.elevationZ);
    const targetShapes = CoverCalculator.constrainedGridShapesUnderToken(this.target);
    const targetElevation = this.targetAvgElevation;
    const targetPointsArray = targetShapes.map(targetShape => this._getCorners(targetShape, targetElevation));

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

    const targetShape = this.target.constrainedTokenShape;
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

    const tokenCorners = this._getCorners(this.viewer.object.constrainedTokenShape, this.viewer.elevationZ);
    const targetShape = this.target.constrainedTokenShape;
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

    const percentCover = 1 - this._percentVisible2d();
    this.debug && console.log(`Cover percentage ${percentCover}`); // eslint-disable-line no-unused-expressions

    return this.typeForPercentage(percentCover);
  }

  /**
   * Test cover based on "3d" area.
   * Construct the view from the token looking at the target.
   * Calculate the viewable area of the target from that perspective.
   * @returns {COVER_TYPE}
   */
  area3d() {
    this.debug && console.log("Cover algorithm: Area 3d"); // eslint-disable-line no-unused-expressions

    const percentCover = 1 - this._percentVisible3d();
    this.debug && console.log(`Cover percentage ${percentCover}`); // eslint-disable-line no-unused-expressions

    return this.typeForPercentage(percentCover);
  }

  // ----- HELPER METHODS ----- //

  /**
   * Get a cover type based on percentage cover.
   * @param {number} percentCover
   * @returns {COVER_TYPE}
   */
  typeForPercentage(percentCover) {
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

    const constrained = token.constrainedTokenShape;

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
  static averageTokenElevation(token) {
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
      const collision = ClockwiseSweepPolygon.testCollision3d(tokenPoint, targetPoint, { type: "sight", mode: "any" });
      if ( collision ) numCornersBlocked += 1;
    }

    const percentCornersBlocked = numCornersBlocked / ln;
    return this.typeForPercentage(percentCornersBlocked);
  }

  /**
   * Determine the percent of the target top or bottom that is visible to the viewer.
   * @returns {number} Percentage seen, of the total target top or bottom area.
   */
  _percentVisible2d() {
    const area2d = new Area2d(this.viewer, this.target);
    return area2d.percentAreaVisible();
  }

  /**
   * Determine the percent of the target visible based on the perspective of the viewer when
   * looking directly at the target. Projected from 3d.
   * @returns {number} Percentage seen, of the total viewable target area.
   */
  _percentVisible3d() {
    const area3d = new Area3d(this.viewer, this.target);
    return area3d.percentAreaVisible();
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
      const collision = ClockwiseSweepPolygon.testCollision3d(tokenPoint, targetPoint, { type: "sight", mode: "any" });

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
