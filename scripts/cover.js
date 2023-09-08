/* globals
canvas,
ChatMessage,
game,
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

import { COVER, MODULE_ID } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { CoverDialog } from "./CoverDialog.js";


/**
 * Workflow to process cover for given token and targets.
 * Used by midi-qol and dnd5e functions.
 * @param {Token} token
 * @param {Set<Token>} targets    Targeted token set. May be modified by user choices.
 * @param {string} actionType
 * @returns {boolean} True if attack should continue; false otherwise.
 */
export async function coverWorkflow(token, targets, actionType) {
  // Construct dialogs, if applicable
  // tokenCoverCalculations will be:
  // - false if user canceled
  // - undefined if covercheck is set to NONE. NONE may still require chat display.
  // - Map otherwise
  const coverDialog = new CoverDialog(token, targets);
  const coverCalculations = await coverDialog.workflow(actionType);
  if ( coverCalculations === false ) return false;  // User canceled

  // Check if the user removed one or more targets.
  if ( coverCalculations && coverCalculations.size !== coverDialog.coverCalculations.size ) {
    if ( !coverCalculations.size ) return false; // All targets removed.

    // Drop the removed targets.
    const removed = coverDialog.targets.difference(new Set(coverCalculations.keys()));
    removed.forEach(t => targets.delete(t));
  }

  // Update targets' cover if some targets are present
  if ( coverCalculations && coverCalculations.size ) {
    await coverDialog.updateTargetsCover(coverCalculations);
  }

  // Display in chat if requested.
  let displayChat = getSetting(SETTINGS.COVER.CHAT);
  if ( displayChat && getSetting(SETTINGS.COVER.MIDIQOL.COVERCHECK_IF_CHANGED) ) {
    // Only display chat if the cover differs from what is already applied to tokens.
    displayChat = !coverDialog._targetCoversMatchCalculations(coverCalculations);
  }

  if ( displayChat ) {
    const opts = {
      actionType,
      coverCalculations
    };
    await coverDialog.sendCoverCalculationsToChat(opts);
  }

  return true;
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


export async function combatTurnHook(combat, updateData, updateOptions) { // eslint-disable-line no-unused-vars
  // Properties for updateData:
  //   updateData.round
  //   updateData.turn

  const c = combat.combatant;
  const playerOwners = c.players;

  // Clear cover status of all tokens in the scene
  // Unless the token is targeted by the current user
  const tokens = canvas.tokens.placeables;

  const userTargetedTokens = [];
  for ( const token of tokens ) {
    if ( playerOwners.some(owner => token.targeted.has(owner)) ) {
      userTargetedTokens.push(token);
    }
    CoverCalculator.disableAllCover(token.id);
  }

  // Calculate cover from combatant to any currently targeted tokens
  const combatToken = c.token.object;
  for ( const target of userTargetedTokens ) {
    const coverCalc = new CoverCalculator(combatToken, target);
    coverCalc.setTargetCoverEffect();
  }
}


/**
 * When considering creating an active cover effect, do not do so if it already exists.
 * @param {Document} document                     The pending document which is requested for creation
 * @param {object} data                           The initial data object provided to the document creation request
 * @param {DocumentModificationContext} options   Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                        Explicitly return false to prevent creation of this Document
 */
export function preCreateActiveEffectHook(activeEffect, data, options, userId) {
  if ( userId !== game.userId ) return;

  // Is the activeEffect a cover status?
  if ( !activeEffect.statuses.intersects(COVER.IDS.ALL) ) return;

  // Does the status effect already exist?
  const actor = activeEffect.parent;
  const coverStatuses = actor.statuses?.intersection(COVER.IDS.ALL) ?? new Set();
  if ( coverStatuses.intersects(activeEffect.statuses) ) return false;
  return true;
}

/**
 * When creating an active cover effect, remove all other cover effects.
 * @param {Document} document                       The new Document instance which has been created
 * @param {DocumentModificationContext} options     Additional options which modified the creation request
 * @param {string} userId                           The ID of the User who triggered the creation workflow
 */
// export function createActiveEffectHook(activeEffect, options, userId) {
//   if ( userId !== game.userId ) return;
//
//   // Is the activeEffect a cover status?
//   if ( !activeEffect.statuses.intersects(COVER.IDS.ALL) ) return;
//
//   // Do statuses need to be removed?
//   const actor = activeEffect.parent;
//   const coverStatuses = actor.statuses?.intersection(COVER.IDS.ALL) ?? new Set();
//   const toRemove = coverStatuses.difference(activeEffect.statuses);
//   if ( !toRemove.size ) return;
//
//   // Remove all cover statuses except the activeEffect status
//   // ActiveEffect actor does not point to specific token for linked so use getActiveTokens
//   const tokenDocs = actor.getActiveTokens(false, true);
//   tokenDocs.forEach(tokenD => {
//     toRemove.map(id => tokenD.toggleActiveEffect({ id }, { active: false })); // Async
//   });
// }





