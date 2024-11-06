/* globals
canvas,
ChatMessage
CONFIG,
document,
game,
PIXI,
renderTemplate
*/
"use strict";

import { log } from "./util.js";
import { MODULE_ID, FLAGS, LABELS, TEMPLATES } from "./const.js";
import { coverAttackWorkflow } from "./CoverDialog.js";

export const PATCHES = {};
PATCHES.DND5E_MIDI = {};

// ----- NOTE: Hooks ----- //

/**
 * Hook renderItemSheet5e to add cover configuration options for spells.
 * @param {ItemSheet5e} sheet
 * @param {Object} html
 * @param {Object} data
 */
function renderItemSheet5e(app, html, data) {
  const type = data.item?.type;
  if ( !(type === "spell" || type === "feat") ) return;
  render5eSpellTemplateConfig(app, html, data);
}

/**
 * Inject html to add controls to the measured template configuration:
 * 1. Switch to have the template be blocked by walls.
 *
 * templates/scene/template-config.html
 */
async function render5eSpellTemplateConfig(app, html, data) {
  const detailsTab = html.find(".tab.details");
  if ( !detailsTab || !detailsTab.length ) return;
  const CONFIG = FLAGS.DND5E.SPELL_CONFIG;

  // Add the default flag and localized selections.
  if (typeof data.document.getFlag(MODULE_ID, CONFIG.USE_COVER) === "undefined") {
    data.document.setFlag(MODULE_ID, CONFIG.USE_COVER, CONFIG.CHOICES.NO);
  }
  data[MODULE_ID] ??= {};
  data[MODULE_ID].useCoverOptions = LABELS.DND5E.SPELL_CONFIG.USE_COVER;

  // Insert the html.
  const myHTML = await renderTemplate(TEMPLATES.SPELL_CONFIG_DND5E, data);
  const div = document.createElement("div");
  div.innerHTML = myHTML;
  detailsTab[0].appendChild(div);
}

PATCHES.DND5E_MIDI.HOOKS = { renderItemSheet5e };


// For Item (v3)
const ELIGIBLE_ACTION_TYPES = new Set(["mwak", "msak", "rsak", "rwak"]);
export async function rollAttack_v3(wrapper, options = {}) {
  if ( !this.hasAttack ) return wrapper(options);

  // Determine the attack type
  const actionType = this.system?.actionType;
  if ( !ELIGIBLE_ACTION_TYPES.has(actionType) ) return wrapper(options);

  return _rollAttack.call(this, wrapper, actionType, options);
}


/**
 * v4 AttackActivity#rollAttack
 * @param {AttackRollProcessConfiguration} config  Configuration information for the roll.
 * @param {AttackRollDialogConfiguration} dialog   Configuration for the roll dialog.
 * @param {BasicRollMessageConfiguration} message  Configuration for the roll message.
 * @returns {Promise<D20Roll[]|null>}
 */
export async function rollAttack_v4(wrapper, config, dialog, message) {

  let actionType;
  const isRanged = this.attack.type.value === "ranged";
  switch ( this.attack.type.classification ) {
    case "weapon": actionType = isRanged ? "mwak" : "rwak";
    case "spell": actionType = isRanged ? "msak" : "rsak";
    case "unarmed": actionType = isRanged ? "mwak" : "rwak";
  }
  return _rollAttack.call(this, wrapper, actionType, config, dialog, message);
}

async function _rollAttack(wrapper, actionType, ...args) {
  const actor = this.actor;
  const token = canvas.tokens.get(ChatMessage.getSpeaker({ actor }).token);
  if ( !token || !token.isOwner ) return wrapper(options);

  // Determine the targets for the user
  const targets = game.user.targets;
  if ( !targets.size ) return wrapper(options);

  // Construct dialogs, if applicable
  const doAttack = await coverAttackWorkflow(token, targets, { actionType });
  if ( doAttack ) return wrapper(...args);

  // If coverAttackWorkflow returns false, user canceled or eliminated all targets; simply return.
  return false;

}
