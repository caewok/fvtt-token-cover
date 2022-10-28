/* globals
game,
canvas,
CONFIG,
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

import { MODULE_ID, COVER_TYPES, STATUS_EFFECTS } from "./const.js";
import { getSetting, SETTINGS } from "./settings.js";
import { log, dialogPromise, distanceBetweenPoints, pixelsToGridUnits } from "./util.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Point3d } from "./Point3d.js";

/**
 * Hook event that fires after targeting (AoE) is complete.
 */
export async function midiqolPreambleCompleteHook(workflow) {
  log("midiqolPreambleCompleteHook", workflow);

  const token = workflow.token;
  const targets = [...workflow.targets];
  const nTargets = targets.length;

  if ( !nTargets || !token ) return;

  const calcs = targets.map(t => new CoverCalculator(token, t));
  const covers = calcs.map(calc => calc.targetCover());

  // If automatic
  for ( let i = 0; i < nTargets; i += 1 ) {
    const cover = covers[i];
    const calc = calcs[i];
    calc.setTargetCoverEffect(cover);
  }

  let html = `<b>${token.name}</b>`;

  const include3dDistance = true;
  const imageWidth = 50;
  const token_center = new Point3d(token.center.x, token.center.y, token.topZ); // Measure from token vision point.
  const distHeader = include3dDistance ? '<th style="text-align: right"><b>Dist. (3d)</b></th>' : "";
  html +=
  `
  <table id="${token.id}_table" class="table table-striped">
  <thead>
    <tr class="character-row">
      <th colspan="2" ><b>Target</b></th>
      <th style="text-align: left"><b>Cover</b></th>
      ${distHeader}
    </tr>
  </thead>
  <tbody>
  `;

  for ( let i = 0; i < nTargets; i += 1 ) {
    const target = targets[i];
    const cover = covers[i];

    const target_center = new Point3d(
      target.center.x,
      target.center.y,
      CoverCalculator.averageTokenElevation(target));

    const targetImage = target.document.texture.src; // Token canvas image.
    const dist = distanceBetweenPoints(token_center, target_center);
    const distContent = include3dDistance ? `<td style="text-align: right">${Math.round(pixelsToGridUnits(dist))} ${canvas.scene.grid.units}</td>` : "";
    const coverOptions =
    `
    <option value="NONE" ${cover === COVER_TYPES.NONE ? "selected" : ""}>None</option>
    <option value="LOW" ${cover === COVER_TYPES.LOW ? "selected" : ""}>${getSetting(SETTINGS.COVER.NAMES.LOW)}</option>
    <option value="MEDIUM" ${cover === COVER_TYPES.MEDIUM ? "selected" : ""}>${getSetting(SETTINGS.COVER.NAMES.MEDIUM)}</option>
    <option value="HIGH" ${cover === COVER_TYPES.HIGH ? "selected" : ""}>${getSetting(SETTINGS.COVER.NAMES.HIGH)}</option>
    <option value="OMIT">Omit from attack</option>
    `;
    const coverSelector =
    `
    <label for="COVER.${target.id}">Cover</label>
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


  // If GM checks, send dialog to GM
  const res = await dialogPromise(html, {title: "Confirm cover"});
  if ( "Cancel" === res || "Closed" === res ) return false;

  // If user checks, send dialog to user
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
  const statusEffects = currentStatusEffects();

  CONFIG.statusEffects.push(
    statusEffects.LOW,
    statusEffects.MEDIUM,
    statusEffects.HIGH);
}

// Function to get the current status effects, with labels added from settings.
export function currentStatusEffects() {
  const statusEffects = STATUS_EFFECTS[game.system.id] || STATUS_EFFECTS.generic;

  statusEffects.LOW.label = getSetting(SETTINGS.COVER.NAMES.LOW);
  statusEffects.MEDIUM.label = getSetting(SETTINGS.COVER.NAMES.MEDIUM);
  statusEffects.HIGH.label = getSetting(SETTINGS.COVER.NAMES.HIGH);

  return statusEffects;
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
export function updateToken(document, change, options, userId) { // eslint-disable-line no-unused-vars
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
