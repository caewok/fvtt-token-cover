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

import { COVER, MODULES_ACTIVE } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { CoverDialog } from "./CoverDialog.js";

/**
 * Hook event that fires after targeting (AoE) is complete.
 * Note: hook will be run by the user that executed the attack triggering this.
 */
export async function midiqolPreambleCompleteHook(workflow) {
  const token = workflow.token;
  const targets = [...workflow.targets];
  const nTargets = targets.length;

  if ( !nTargets || !token ) return true;

  const actionType = workflow.item?.system?.actionType;
  const chosenTargets = await coverTargetsWorkflow(token, targets, actionType);

  // Update targets
  // Allow user to cancel

  return true;
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
  if ( MODULES_ACTIVE.MIDI_QOL ) return true;

  if ( !getSetting(SETTINGS.COVER.CHAT) ) return true;

  // Locate the token
  const token = canvas.tokens.get(rollConfig.messageData.speaker.token);
  if ( !token.isOwner ) return;

  // Determine the targets for the user
  const user = game.users.get(game.userId);
  const targets = canvas.tokens.placeables.filter(t => t.isTargeted && t.targeted.has(user));

  // Determine the attack type
  const actionType = item.system?.actionType;

  // Determine cover and distance for each target
//   const coverDialog = new CoverDialog(token, targets);
//   const coverTable = coverDialog.htmlCoverTable({
//     includeZeroCover: false,
//     imageWidth: 30,
//     actionType
//   });
//   if ( coverTable.nCoverTotal ) ChatMessage.create({ content: coverTable.html });
}

/**
 * Wrap Item5e.prototype.rollAttack
 */
export async function rollAttackItem5e(wrapper, options = {}) {
  if ( !this.hasAttack ) return wrapper(options);

  // Locate the token
  const actor = this.actor;
  const token = canvas.tokens.get(ChatMessage.getSpeaker({ actor }).token);
  if ( !token || !token.isOwner ) return;

  // Determine the targets for the user
  const user = game.users.get(game.userId);
  const targets = canvas.tokens.placeables.filter(t => t.isTargeted && t.targeted.has(user));

  // Determine the attack type
  const actionType = this.system?.actionType;

  // Do dialogs and chat message, if applicable.
  const res = await coverTargetsWorkflow(token, targets, actionType);
  if ( res === false ) return;

  return wrapper(options);
}

/**
 * Workflow to process target cover for a given token, possibly displaying confirmation
 * dialog to user/gm and creating cover chat message.
 * @param {Token} token       Token that is doing the attack
 * @param {Token[]} targets   Targets of the attack.
 */
async function coverTargetsWorkflow(token, targets, actionType) {
  const nTargets = targets.length;
  if ( !nTargets ) return true;

  const { MIDIQOL, CHAT } = SETTINGS.COVER;
  const coverCheckOption = getSetting(MIDIQOL.COVERCHECK);
  const choices = MIDIQOL.COVERCHECK_CHOICES;
  if ( coverCheckOption === choices.NONE && !getSetting(CHAT) ) return true;

  const coverDialog = new CoverDialog(token, targets);
  let tokenCoverCalculations = coverDialog.coverCalculationsForTokenAction(token, actionType);
  if ( coverCheckOption === choices.NONE ) return tokenCoverCalculations;

  const displayCoverDialog = !getSetting(MIDIQOL.COVERCHECK_IF_CHANGED)
    || !coverDialog._tokenCoverCalculationsMatchTargetCovers(tokenCoverCalculations, targets);

  if ( displayCoverDialog ) {
    tokenCoverCalculations = await coverDialog._confirmCoverCalculations(token, tokenCoverCalculations, actionType);
  }
  if ( !tokenCoverCalculations || isEmpty(tokenCoverCalculations) ) return false;

  if ( coverCheckOption === choices.GM || coverCheckOption === choices.USER ) {
    // Allow the GM or user to omit targets.
    const targetIds = new Set(Object.keys(tokenCoverCalculations));
    for ( const target of targets ) {
      if ( !targetIds.has(target.id) ) targets.delete(target);
    }
  }

  // Update targets' cover
  await coverDialog.updateTargetsCover(tokenCoverCalculations);

  // Send target calculations to chat
  if ( getSetting(CHAT) ) {
    const coverCalculations = CoverDialog.convertTokenCalculations(token, tokenCoverCalculations);
    const options = {
      includeZeroCover: false,
      imageWidth: 30,
      coverCalculations,
      applied: true,
      displayIgnored: false
    };
    await coverDialog._sendCoverCalculationsToChat(options);
  }

  return { tokenCoverCalculations, targets };
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
  const coverStatuses = actor.statuses?.intersect(COVER.IDS.ALL) ?? new Set();
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
//   const coverStatuses = actor.statuses?.intersect(COVER.IDS.ALL) ?? new Set();
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
    const coverStatuses = actor.statuses.intersect(COVER.IDS.ALL);
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
