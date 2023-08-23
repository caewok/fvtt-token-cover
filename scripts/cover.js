/* globals
game,
canvas,
ChatMessage,
duplicate,
CONFIG
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

import { MODULE_ID, COVER } from "./const.js";
import { getSetting, SETTINGS, getCoverName } from "./settings.js";
import { log } from "./util.js";
import { CoverCalculator, SOCKETS, dialogPromise } from "./CoverCalculator.js";

import { Point3d } from "./geometry/3d/Point3d.js";

/**
 * Hook event that fires after targeting (AoE) is complete.
 * Note: hook will be run by the user that executed the attack triggering this.
 */
export async function midiqolPreambleCompleteHook(workflow) {
  const token = workflow.token;
  const targets = [...workflow.targets];
  const nTargets = targets.length;

  if ( !nTargets || !token ) return true;

  const coverCheckOption = getSetting(SETTINGS.COVER.MIDIQOL.COVERCHECK);
  const choices = SETTINGS.COVER.MIDIQOL.COVERCHECK_CHOICES;
  const actionType = workflow.item?.system?.actionType;

  let coverCalculations;
  let originalCoverCalculations;
  if ( getSetting(SETTINGS.COVER.CHAT)
    || coverCheckOption !== choices.NONE ) {

    const ic = token.ignoresCoverType;
    const allCoverIgnored = ic.all;
    const typeCoverIgnored = ic[actionType] || COVER.TYPES.NONE;
    const ignoresCover = Math.max(allCoverIgnored, typeCoverIgnored);

    originalCoverCalculations = CoverCalculator.coverCalculations([token], targets);
    coverCalculations = duplicate(originalCoverCalculations);

    for ( const target of targets ) {
      const cover = coverCalculations[token.id][target.id];
      const calcCover = cover <= ignoresCover ? COVER.TYPES.NONE : cover;
      coverCalculations[token.id][target.id] = calcCover;
    }
  }

  if ( coverCheckOption === choices.GM || coverCheckOption === choices.USER ) {
    const dialogData = constructCoverCheckDialogContent(
      token,
      targets,
      coverCalculations,
      originalCoverCalculations,
      actionType);

    const res = coverCheckOption === choices.GM
      ? await SOCKETS.socket.executeAsGM("dialogPromise", dialogData)
      : await dialogPromise(dialogData);

    if ( "Close" === res ) return false;

    // Update the cover calculations with User or GM selections
    const coverSelections = res.find("[class=CoverSelect]");
    const targetCoverCalculations = coverCalculations[token.id];
    for ( let i = 0; i < nTargets; i += 1 ) {
      const selectedCover = coverSelections[i].selectedIndex;
      targetCoverCalculations[targets[i].id] = selectedCover;

      // Allow the GM or user to omit targets
      if ( selectedCover === COVER.TYPES.TOTAL ) {
        workflow.targets.delete(targets[i]);
        continue;
      }
    }
  }

  if ( coverCheckOption !== choices.NONE ) {
    // Update targets' cover
    const targetCoverCalculations = coverCalculations[token.id];
    for ( const target of targets ) {
      await CoverCalculator.setCoverStatus(target.id, targetCoverCalculations[target.id]);
    }
  }

  // Send cover to chat
  if ( getSetting(SETTINGS.COVER.CHAT) ) {
    const coverTable = CoverCalculator.htmlCoverTable([token], targets, {
      includeZeroCover: false,
      imageWidth: 30,
      coverCalculations,
      applied: true,
      displayIgnored: false
    });
    log(coverTable.html);

    if ( coverTable.nCoverTotal ) ChatMessage.create({ content: coverTable.html });
  }

  return true;
}

function constructCoverCheckDialogContent(token, targets, coverCalculations, ogCoverCalculations, actionType) {
  // Describe the types of cover ignored by the token
  // If actionType is defined, use that to limit the types
  let ignoresCoverLabel = "";
  const ic = token.ignoresCoverType;
  const allCoverIgnored = ic.all;
  const typeCoverIgnored = ic[actionType] || COVER.TYPES.NONE;

  if ( allCoverIgnored > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(allCoverIgnored)} cover (${CoverCalculator.attackNameForType("all")} attacks)`;
  if ( typeCoverIgnored > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(typeCoverIgnored)} cover (${CoverCalculator.attackNameForType(actionType)} attacks)`;

  if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = ` <em>Ignores:${ignoresCoverLabel}</em>`;

  let html = `<b>${token.name}</b>. ${CoverCalculator.attackNameForType(actionType)} attack. ${ignoresCoverLabel}`;

  const include3dDistance = true;
  const imageWidth = 50;
  const token_center = new Point3d(token.center.x, token.center.y, token.topZ); // Measure from token vision point.
  const distHeader = include3dDistance ? '<th style="text-align: right"><b>Dist. (3d)</b></th>' : "";
  html +=
  `
  <table id="${token.id}_table" class="table table-striped">
  <thead>
    <tr class="character-row">
      <th colspan="2"><b>Target</b></th>
      <th style="text-align: left"><b>Applied</b></th>
      <th style="text-align: left"><b>Estimated</b></th>
      ${distHeader}
    </tr>
  </thead>
  <tbody>
  `;

  for ( const target of targets ) {
    const cover = coverCalculations[token.id][target.id];
    const ogCover = ogCoverCalculations[token.id][target.id];

    const target_center = new Point3d(
      target.center.x,
      target.center.y,
      CoverCalculator.averageTokenElevationZ(target));

    const targetImage = target.document.texture.src; // Token canvas image.
    const dist = Point3d.distanceBetween(token_center, target_center);
    const distContent = include3dDistance ? `<td style="text-align: right">${Math.round(CONFIG.GeometryLib.utils.pixelsToGridUnits(dist))} ${canvas.scene.grid.units}</td>` : "";
    const coverOptions =
    `
    <option value="NONE" ${cover === COVER.TYPES.NONE ? "selected" : ""}>None</option>
    <option value="LOW" ${cover === COVER.TYPES.LOW ? "selected" : ""}>${getCoverName("LOW")}</option>
    <option value="MEDIUM" ${cover === COVER.TYPES.MEDIUM ? "selected" : ""}>${getCoverName("MEDIUM")}</option>
    <option value="HIGH" ${cover === COVER.TYPES.HIGH ? "selected" : ""}>${getCoverName("HIGH")}</option>
    <option value="OMIT">Omit from attack</option>
    `;
    const coverSelector =
    `
    <select id="CoverSelect.${target.id}" class="CoverSelect">
    ${coverOptions}
    </select>
    `;

    html +=
    `
    <tr>
    <td><img src="${targetImage}" alt="${target.name} image" width="${imageWidth}" style="border:0px"></td>
    <td>${target.name}</td>
    <td>${coverSelector}</td>
    <td><em>${CoverCalculator.coverNameForType(ogCover)}</em></td>
    ${distContent}
    </tr>
    `;
  }

  html +=
  `
  </tbody>
  </table>
  <br>
  `;

  const dialogData = {
    content: html,
    title: "Confirm cover"
  };

  return dialogData;
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
  if ( game.modules.has("midi-qol") && game.modules.get("midi-qol").active ) return true;
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
  const coverTable = CoverCalculator.htmlCoverTable([token], targets, {
    includeZeroCover: false,
    imageWidth: 30,
    actionType
  });
  log(coverTable.html);
  if ( coverTable.nCoverTotal ) ChatMessage.create({ content: coverTable.html });
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

  let id1;
  let id2;
  switch ( effectData.id ) {
    case `${MODULE_ID}.cover.LOW`:
      id1 = `${MODULE_ID}.cover.MEDIUM`;
      id2 = `${MODULE_ID}.cover.HIGH`;
      break;
    case `${MODULE_ID}.cover.MEDIUM`:
      id1 = `${MODULE_ID}.cover.LOW`;
      id2 = `${MODULE_ID}.cover.HIGH`;
      break;
    case `${MODULE_ID}.cover.HIGH`:
      id1 = `${MODULE_ID}.cover.LOW`;
      id2 = `${MODULE_ID}.cover.MEDIUM`;
      break;
    default:
      return state;
  }

  const existing1 = this.actor.effects.find(e => e.getFlag("core", "statusId") === id1);
  const existing2 = this.actor.effects.find(e => e.getFlag("core", "statusId") === id2);

  if ( existing1 ) await existing1.delete();
  if ( existing2 ) await existing2.delete();

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
