/* globals
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

// Patches for the Token class

import { MODULE_ID, MODULES_ACTIVE, COVER, IGNORES_COVER_HANDLER } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { SETTINGS, Settings } from "./Settings.js";
import { isFirstGM } from "./util.js";

export const PATCHES = {};
PATCHES.BASIC = {};
PATCHES.sfrpg = {};
PATCHES.NO_PF2E = {};

// ----- NOTE: Hooks ----- //

/**
 * Hook: drawToken
 * Create a token cover calculator.
 * @param {PlaceableObject} object    The object instance being drawn
 */
function drawToken(token) {
  const obj = token[MODULE_ID] ??= {};
  obj.coverCalc = new CoverCalculator(token);
}

/**
 * Hook: destroyToken
 * @param {PlaceableObject} object    The object instance being destroyed
 */
function destroyToken(token) { token[MODULE_ID].coverCalc.destroy(); }

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
async function targetToken(user, target, targeted) {
  if ( !isFirstGM()
    || !Settings.get(SETTINGS.COVER.COMBAT_AUTO)
    || !game.combat?.started // If not in combat, do nothing because it is unclear who is targeting what...
    || !isUserCombatTurn(user)  // Ignore targeting by other users
  ) return;

  if ( !targeted ) return await CoverCalculator.disableAllCover(target.id);

  // Target from the current combatant to the target token
  const c = game.combats.active;
  const combatToken = c.combatant.token.object;
  const coverCalc = combatToken[MODULE_ID].coverCalc;
  coverCalc.target = target;
  return await coverCalc.setTargetCoverEffect();
}

/**
 * For Starfinder, hook apply token status effect to add the cover item as needed.
 * @param {Token} token           The token the status is being applied to
 * @param {string} statusId       The status effect ID being applied, from CONFIG.specialStatusEffects
 * @param {boolean} active        Is the special status effect now active?
 */
function applyTokenStatusEffect(token, statusId, active) {
  if ( game.system.id !== "sfrpg" ) return;

  // Is this a cover status?
  // statusId is all lowercase, at least in sfrpg.
  const cover = COVER.TYPES_FOR_ID[MODULE_ID][statusId];
  if ( !cover ) return;
  return active ? CoverCalculator.enableCover(token, COVER.TYPES_FOR_ID[MODULE_ID][statusId])
    : CoverCalculator.disableAllCover(token);
}


PATCHES.BASIC.HOOKS = { drawToken, destroyToken };
PATCHES.sfrpg.HOOKS = { applyTokenStatusEffect };
PATCHES.NO_PF2E.HOOKS = { targetToken };

// ----- NOTE: Getters ----- //

/**
 * New getter: Token.prototype.coverType
 * Determine what type of cover the token has, if any.
 * @type {COVER_TYPES}
 */
function coverType() {
  const statuses = this.actor?.statuses;
  if ( !statuses ) return COVER.TYPES.NONE;
  const coverModule = MODULES_ACTIVE.DFREDS_CE ? "dfreds-convenient-effects" : "tokenvisibility";
  return statuses.has(COVER.CATEGORIES.HIGH[coverModule]) ? COVER.TYPES.HIGH
    : statuses.has(COVER.CATEGORIES.MEDIUM[coverModule]) ? COVER.TYPES.MEDIUM
      : statuses.has(COVER.CATEGORIES.LOW[coverModule]) ? COVER.TYPES.LOW
        : COVER.TYPES.NONE;
}

/**
 * New getter: Token.prototype.ignoresCoverType
 * Instantiate a IgnoresCover class to determine if cover can be ignored for different attack types.
 * @type {boolean}
 */
function ignoresCoverType() {
  return this._ignoresCoverType || (this._ignoresCoverType = new IGNORES_COVER_HANDLER(this));
}

PATCHES.BASIC.GETTERS = {
  coverType,
  ignoresCoverType
};

// ----- NOTE: Helper functions ----- //

/**
 * Determine if the user's token is the current combatant in the active tracker.
 * @param {User} user
 * @returns {boolean}
 */
function isUserCombatTurn(user) {
  if ( !game.combat?.started ) return false;

  // If no players, than it must be a GM token
  const c = game.combats.active;
  if ( !c.combatant.players.length ) return user.isGM;
  return c.combatant.players.some(player => user.name === player.name);
}
