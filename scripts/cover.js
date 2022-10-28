/* globals
ClockwiseSweepPolygon,
game,
PIXI,
canvas,
CONST,
CONFIG,
Token,
ChatMessage
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
import { distanceBetweenPoints, pixelsToGridUnits, log } from "./util.js";
import { CoverCalculator } from "./CoverCalculator.js";

/**
 * Hook event that fires after targeting (AoE) is complete.
 */
export function midiqolPreambleCompleteHook(workflow) {
  log("midiqolPreambleCompleteHook", workflow);
}

/**
 * A hook event that fires before an attack is rolled for an Item.
 * @function dnd5e.preRollAttack
 * @memberof hookEvents
 * @param {Item5e} item                  Item for which the roll is being performed.
 * @param {D20RollConfiguration} config  Configuration data for the pending roll.
 * @returns {boolean}                    Explicitly return false to prevent the roll from being performed.
 */
export function dnd5ePreRollAttackHook(item, rollConfig) {
  log("dnd5ePreRollAttackHook", item, rollConfig);

  // Locate the token
  const token = canvas.tokens.get(rollConfig.messageData.speaker.token);
  if ( !token.isOwner ) return;

  // Determine the targets for the user
  const user = game.users.get(game.userId);
  const targets = canvas.tokens.placeables.filter(t => t.isTargeted && t.targeted.has(user));

  // Determine cover and distance for each target
  const coverTable = CoverCalculator.htmlCoverTable([token], targets, { includeZeroCover: false, imageWidth: 30 });
  if ( coverTable.nCoverTotal ) ChatMessage.create({ content: coverTable.html });
}

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

Can manually set cover status but it will only last until targets change...
Provide setting for manual only
*/

/* System-specific cover

DND5e. Base system

On attack:
- Chat message displaying cover of targeted tokens

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
  if ( !Object.hasOwn(change, "x")
    && !Object.hasOwn(change, "y")
    && !Object.hasOwn(change, "z") ) return;

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
      CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.MEDIUM);
      CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.HIGH);
      break;
    case `${MODULE_ID}.cover.MEDIUM`:
      CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.LOW);
      CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.HIGH);
      break;
    case `${MODULE_ID}.cover.HIGH`:
      CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.LOW);
      CoverCalculator.disableCoverStatus(tokenD, COVER_TYPES.MEDIUM);
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

  const targetD = target.document;
  if ( !targeted ) {
    CoverCalculator.disableAllCoverStatus(targetD);
    return;
  }

  // Target from the current combatant to the target token
  const c = game.combats.active;
  const combatToken = c.combatant.token.object;
  const coverCalc = new CoverCalculator(combatToken, target);
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

  return c.combatant.players.some(player => user.name === player.name);
}



