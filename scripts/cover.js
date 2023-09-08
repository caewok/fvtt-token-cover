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
 * Hook event that fires after targeting (AoE) is complete.
 * Note: hook will be run by the user that executed the attack triggering this.
 */
export async function midiqolPreambleCompleteHook(workflow) {
  const { token, targets, item } = workflow;
  if ( !targets?.size || !token ) return true;

  // Construct dialogs, if applicable
  const actionType = item?.system?.actionType;
  return coverWorkflow(token, targets, actionType);
}

/**
 * Wrap Item5e.prototype.rollAttack
 */
export async function rollAttackItem5e(wrapper, options = {}) {
  if ( !this.hasAttack ) return wrapper(options);

  // Locate the token
  const actor = this.actor;
  const token = canvas.tokens.get(ChatMessage.getSpeaker({ actor }).token);
  if ( !token || !token.isOwner ) return wrapper(options);

  // Determine the targets for the user
  const targets = game.user.targets;
  if ( !targets.size ) return wrapper(options);

  // Determine the attack type
  const actionType = this.system?.actionType;

  // Construct dialogs, if applicable
  if ( await coverWorkflow(token, targets, actionType) ) return wrapper(options);

  // If coverWorkflow returns false, user canceled or eliminated all targets; simply return.
}


/**
 * Workflow to process cover for given token and targets.
 * Used by midi-qol and dnd5e functions.
 * @param {Token} token
 * @param {Set<Token>} targets    Targeted token set. May be modified by user choices.
 * @param {string} actionType
 * @returns {boolean} True if attack should continue; false otherwise.
 */
async function coverWorkflow(token, targets, actionType) {
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

/**
 * Wrap TokenDocument.prototype.toggleActiveEffect
 * If adding a cover effect, remove other cover effects
 */
export async function toggleActiveEffectTokenDocument(wrapper, effectData, { overlay=false, active}={}) {
  const state = await wrapper(effectData, {overlay, active});
  if ( !state ) return; // No new effect added.

//   let id1;
//   let id2;
//   switch ( effectData.id ) {
//     case `${MODULE_ID}.cover.LOW`:
//       id1 = `${MODULE_ID}.cover.MEDIUM`;
//       id2 = `${MODULE_ID}.cover.HIGH`;
//       break;
//     case `${MODULE_ID}.cover.MEDIUM`:
//       id1 = `${MODULE_ID}.cover.LOW`;
//       id2 = `${MODULE_ID}.cover.HIGH`;
//       break;
//     case `${MODULE_ID}.cover.HIGH`:
//       id1 = `${MODULE_ID}.cover.LOW`;
//       id2 = `${MODULE_ID}.cover.MEDIUM`;
//       break;
//     default:
//       return state;
//   }
//
//   const existing1 = this.actor.effects.find(e => e.getFlag("core", "statusId") === id1);
//   const existing2 = this.actor.effects.find(e => e.getFlag("core", "statusId") === id2);
//
//   if ( existing1 ) await existing1.delete();
//   if ( existing2 ) await existing2.delete();

  return state;
}
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
 * If a token is targeted, determine its cover status.
 *
 * A hook event that fires when a token is targeted or un-targeted.
 * @function targetToken
 * @memberof hookEvents
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
export async function targetTokenHook(user, target, targeted) {
  if ( !getSetting(SETTINGS.COVER.COMBAT_AUTO) ) return;

  // If not in combat, do nothing because it is unclear who is targeting what...
  if ( !game.combat?.started ) return;

  // Ignore targeting by other users
  if ( !isUserCombatTurn(user) ) return;

  if ( !targeted ) {
    return await CoverCalculator.disableAllCover(target.id);
  }

  // Target from the current combatant to the target token
  const c = game.combats.active;
  const combatToken = c.combatant.token.object;
  const coverCalc = new CoverCalculator(combatToken, target);
  return await coverCalc.setTargetCoverEffect();
}

/**
 * Determine if the user's token is the current combatant in the active tracker.
 * @param {User} user
 * @returns {boolean}
 */
function isUserCombatTurn(user) {
  if ( !game.combat?.started ) return false;

  const c = game.combats.active;
  // If no players, than it must be a GM token
  if ( !c.combatant.players.length ) return user.isGM;

  return c.combatant.players.some(player => user.name === player.name);
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

/**
 * Wrap ActiveEffect._onCreateDocuments
 * When creating an active cover effect, remove all other cover effects.
 * Cannot use createActiveEffectHook b/c it is not async.
 *
 */
export async function _onCreateDocumentsActiveEffect(wrapper, documents, context) {
  await wrapper(documents, context);
  for ( const effect of documents ) {
    // If the effect already exists (or cannot be found) effect might be undefined.
    if ( !effect || !effect.statuses || !effect.parent ) continue;

    // Do statuses need to be removed?
    const actor = effect.parent;
    const coverStatuses = actor.statuses.intersection(COVER.IDS.ALL);
    const toRemove = coverStatuses.difference(effect.statuses);
    if ( !toRemove.size ) return effect;

    // Remove all cover statuses except the activeEffect status
    // ActiveEffect actor does not point to specific token for linked so use getActiveTokens
    const tokenDocs = actor.getActiveTokens(false, true);
    const promises = [];
    tokenDocs.forEach(tokenD => {
      promises.push(...toRemove.map(id => tokenD.toggleActiveEffect({ id }, { active: false }))); // Async
    });
    await Promise.all(promises);
  }
}

/**
 * For Starfinder, hook item creation to monitor cover added.
 * If the cover already exists, do not add it again.
 * @param {Document} document                     The pending document which is requested for creation
 * @param {object} data                           The initial data object provided to the document creation request
 * @param {DocumentModificationContext} options   Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                        Explicitly return false to prevent creation of this Document
 */
export function preCreateItemHook(item, data, options, userId) {
  if ( game.system.id !== "sfrpg" || userId !== game.userId ) return;

  // Is this item a cover status?
  const coverType = item.getFlag(MODULE_ID, "cover");
  if ( !coverType ) return;

  // Does this actor already have this item?
  const actor = item.parent;
  if ( actor.items.some(i => i.getFlag(MODULE_ID, "cover") === coverType) ) return false;
  return true;
}

/**
 * For Starfinder, hook item creation to monitor cover added.
 * When cover is added, remove all other cover items.
 * @param {Document} document                     The pending document which is requested for creation
 * @param {DocumentModificationContext} options   Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 */
export function createItemHook(item, options, userId) {
  if ( game.system.id !== "sfrpg" || userId !== game.userId ) return;

  // Is this item a cover status?
  const coverType = item.getFlag(MODULE_ID, "cover");
  if ( !coverType ) return;

  // Locate all other cover types on this actor.
  const actor = item.parent;
  const coverItems = actor.items.filter(i => {
    const iCover = i.getFlag(MODULE_ID, "cover");
    return iCover && iCover !== coverType;
  });
  if ( !coverItems.length ) return;

  // Remove the other cover types.
  // TODO: Is this a problem b/c it is async?
  const coverIds = coverItems.map(i => i.id);
  actor.deleteEmbeddedDocuments("Item", coverIds);
}

/**
 * For Starfinder, hook apply token status effect to add the cover item as needed.
 * @param {Token} token           The token the status is being applied to
 * @param {string} statusId       The status effect ID being applied, from CONFIG.specialStatusEffects
 * @param {boolean} active        Is the special status effect now active?
 */
export function applyTokenStatusEffectHook(token, statusId, active) {
  if ( game.system.id !== "sfrpg" ) return;

  // Is this a cover status?
  // statusId is all lowercase, at least in sfrpg.
  const cover = COVER.TYPES_FOR_ID[MODULE_ID][statusId];
  if ( !cover ) return;
  return active ? CoverCalculator.enableCover(token, COVER.TYPES_FOR_ID[MODULE_ID][statusId])
    :  CoverCalculator.disableAllCover(token);
}
