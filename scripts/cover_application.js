/* globals
CONFIG,
foundry,
fromUuidSync,
game,
Hooks,
socketlib
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, COVER, MODULES_ACTIVE } from "./const.js";
import { isFirstGM, keyForValue } from "./util.js";
import { CoverDialog } from "./CoverDialog.js";
import { CoverEffect } from "./CoverEffect.js";

const NULL_SET = new Set(); // Set intended to signify no items, as a placeholder.

/* Testing
Draw = CONFIG.GeometryLib.Draw
Point3d = CONFIG.GeometryLib.threeD.Point3d;
api = game.modules.get("tokencover").api;
PointsLOS = api.PointsLOS;
CoverCalculator = api.CoverCalculator

let [viewer] = canvas.tokens.controlled;
let [target] = game.user.targets;


*/

// ----- Set up sockets for changing effects on tokens and creating a dialog ----- //
// Don't pass complex classes through the socket. Use token ids instead.

export const SOCKETS = {
  socket: null
};

Hooks.once("socketlib.ready", () => {
  SOCKETS.socket = socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("applyCover", applyCover);
  SOCKETS.socket.register("coverDialog", coverDialog);
});

/**
 * Determine which function to use for updating cover.
 * Depends on whether DFred's CE is active and whether certain systems are present.
 */

Hooks.once("init", function() {
  switch ( game.system.id ) {
    case "sfrpg": COVER_UPDATE_FUNCTION = applyCoverSFRPG; break;
    default:
      COVER_UPDATE_FUNCTION = MODULES_ACTIVE.DFREDS_CE ? applyCoverDFred : applyCoverATV;
  }
});

/**
 * GM handling of cover changes from socket.
 * @param {string} tokenUUID      UUID of token that should have cover status changed.
 * @param {COVER_TYPE} coverType  What cover to set. If 0, all cover removed.
 */
const COVER_SEMAPHORE = new foundry.utils.Semaphore(1);
let COVER_UPDATE_FUNCTION = applyCoverATV;
function applyCover(tokenUUID, coverType) {
  // Only the first GM should handle cover, to avoid duplications.
  // (Semaphore is specific to the user.)
  if ( !isFirstGM() ) return;

  // Confirm the token UUID is valid.
  const tokenD = fromUuidSync(tokenUUID);
  if ( !tokenD ) return;

  // Confirm this is a valid cover type.
  const key = keyForValue(COVER.TYPES, coverType);
  if ( !key ) return;

  // Ignore cover type total.
  if ( coverType === COVER.TYPES.TOTAL ) return;

  COVER_SEMAPHORE.add(COVER_UPDATE_FUNCTION, tokenD, coverType);
}

// NOTE: Socket apply cover functions
/**
 * Apply cover using default Foundry.
 * @param {TokenDocument} tokenD    Token document of token for which to apply cover
 * @param {COVER_TYPES} coverType   What cover to set; if 0, all cover removed
 */
async function applyCoverATV(tokenD, coverType) {
  if ( !coverType ) return disableAllCoverATV(tokenD);
  return enableCoverATV(tokenD, coverType);
}

/**
 * Apply cover using DFred's Convenient Effects.
 * @param {TokenDocument} tokenD    Token document of token for which to apply cover
 * @param {COVER_TYPES} coverType   What cover to set; if 0, all cover removed
 */
async function applyCoverDFred(tokenD, coverType) {
  if ( !coverType ) return disableAllCoverDFreds(tokenD);
  return enableCoverDFreds(tokenD, coverType);
}

/**
 * Apply cover in the sfrpg system.
 * @param {TokenDocument} tokenD    Token document of token for which to apply cover
 * @param {COVER_TYPES} coverType   What cover to set; if 0, all cover removed
 */
async function applyCoverSFRPG(tokenD, coverType) {
  if ( !coverType ) return disableAllCoverSFRPG(tokenD);
  return enableCoverSFRPG(tokenD, coverType);
}

// NOTE: Functions to enable cover.
/**
 * Enable a cover status (ActiveEffect) for a token.
 * Note that ActiveEffect hooks prevent multiple cover application.
 * @param {TokenDocument} tokenD    Token document of token for which to apply cover
 * @param {COVER_TYPES} coverType   What cover to set; if 0, all cover removed
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function enableCoverATV(tokenD, coverType) {
  const key = keyForValue(COVER.TYPES, coverType);
  const desiredCoverId = COVER.CATEGORIES[key][MODULE_ID];

  // Add the effect. (ActiveEffect hooks will prevent multiple additions.)
  const effectData = CONFIG.statusEffects.find(e => e.id === desiredCoverId);
  await tokenD.toggleActiveEffect(effectData, { active: true });
}

/**
 * Enable a cover status (ActiveEffect) for a token.
 * Note that ActiveEffect hooks prevent multiple cover application.
 * @param {TokenDocument} tokenD    Token document of token for which to apply cover
 * @param {COVER_TYPES} coverType   What cover to set; if 0, all cover removed
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function enableCoverDFreds(tokenD, coverType) {
  // Check that actor exists to avoid error when calling addEffect below.
  if ( !tokenD.actor ) return;

  // Add the effect.
  const key = keyForValue(COVER.TYPES, coverType);
  const effectName = COVER.DFRED_NAMES[key];
  return game.dfreds.effectInterface.addEffect({ effectName, uuid: tokenD.uuid });
}

/**
 * Enable a cover status (ActiveEffect) for a token in Starfinder RPG.
 * @param {TokenDocument} tokenD    Token document of token for which to apply cover
 * @param {COVER_TYPES} coverType   What cover to set; if 0, all cover removed
 * @returns {Promise<boolean>} Return from toggleActiveEffect.
 */
async function enableCoverSFRPG(tokenD, coverType) {
  if ( !tokenD.actor ) return;

  // Retrieve the cover item.
  let coverItem = game.items.find(i => i.getFlag(MODULE_ID, "cover") === coverType);
  if ( !coverItem ) {
    // Pull from the compendium.
    const coverName = COVER.SFRPG[coverType];
    const documentIndex = game.packs.get(`${MODULE_ID}.tokenvision_items_sfrpg`).index.getName(coverName);
    coverItem = await game.packs.get(`${MODULE_ID}.tokenvision_items_sfrpg`).getDocument(documentIndex._id);
  }

  if ( tokenD.actor.items.has(coverItem.id) ) return;

  // TODO: Remove existing cover? Or add check in item document creation hook, similar to AE?

  // Add the effect.
  return tokenD.actor.createEmbeddedDocuments("Item", [coverItem]);
}


// NOTE: Functions to disable cover.
/**
 * Remove all ATV cover statuses (ActiveEffect) from a token.
 * @param {TokenDocument} tokenD    Token document of token to change cover status.
 * @returns {Promise}
 */
async function disableAllCoverATV(tokenD) {
  if ( !tokenD.actor || !tokenD.actor.statuses ) return;

  // Drop all cover statuses.
  const coverStatuses = tokenD.actor.statuses?.intersection(COVER.IDS[MODULE_ID]) ?? NULL_SET;
  if ( !coverStatuses.size ) return;
  const promises = coverStatuses.map(id => tokenD.toggleActiveEffect({ id }, { active: false }));
  return Promise.allSettled(promises);
}

/**
 * Remove all ATV cover statuses (ActiveEffect) from a token.
 * Used in SOCKETS above.
 * @param {TokenDocument} tokenD    Token document of token to change cover status.
 * @returns {Promise}
 */
async function disableAllCoverDFreds(tokenD) {
  if ( !tokenD.actor || !tokenD.actor.statuses ) return;

  // Determine what cover statuses are already applied.
  const coverStatuses = tokenD.actor.statuses?.intersection(COVER.IDS["dfreds-convenient-effects"]) ?? NULL_SET;
  if ( !coverStatuses.size ) return;

  // Drop all cover statuses.
  const promises = coverStatuses.map(id => {
    const effectName = id.replace("Convenient Effect: ", "");
    return game.dfreds.effectInterface.removeEffect({ effectName, uuid: tokenD.uuid });
  });
  return Promise.allSettled(promises);
}

/**
 * Remove all ATV cover statuses (ActiveEffect) from a token in Starfinder RPG.
 * @param {TokenDocument} tokenD    Token document of token to change cover status.
 * @returns {Promise}
 */
async function disableAllCoverSFRPG(tokenD) {
  if ( !tokenD.actor ) return;

  // Drop all cover statuses.
  const coverIds = tokenD.actor.items.filter(i => i.getFlag(MODULE_ID, "cover")).map(i => i.id);
  if ( !coverIds.length ) return;
  return tokenD.actor.deleteEmbeddedDocuments("Item", coverIds); // Async
}

// NOTE: Socket dialog function
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
