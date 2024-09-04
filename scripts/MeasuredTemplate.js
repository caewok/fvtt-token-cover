/* globals
canvas,
CONST,
game,
KeyboardManager
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { TokenCover } from "./TokenCover.js";
import { log } from "./util.js";
import { CoverCalculator } from "./CoverCalculator.js";

export const PATCHES = {};
PATCHES.TEMPLATES = {};

/**
 * Hook hoverMeasuredTemplate
 * Trigger template hiding
 * @param {MeasuredTemplate} template
 * @param {boolean} hovering
 */
function hoverMeasuredTemplate(template, hovering) {
  log(`hoverMeasuredTemplate|${hovering} for ${template.id}`);
  if ( hovering ) {
    // When hovering, the template is the only attacker.
    TokenCover.clearAttackers(false);
    TokenCover.addAttacker(template);

  // When not hovering, remove this template as an attacker.
  } else TokenCover.removeAttacker(template);
}

/**
 * Hook destroyMeasuredTemplate
 * Remove the template from the attackers.
 * @param {MeasuredTemplate} template    The object instance being destroyed
 */
function destroyMeasuredTemplate(template) {
  TokenCover.removeAttacker(template);
}

/**
 * Hook refreshMeasuredTemplate
 * If the template moves, clear cover calculations.
 * @param {PlaceableObject} object    The object instance being refreshed
 * @param {RenderFlags} flags         Render flags associated with the refresh */
function refreshMeasuredTemplate(template, flags) {
  if ( !(flags.refreshPosition
      || flags.refreshElevation) ) return;

  log(`refreshTemplate hook|Template ${template.id} ${template.document.x},${template.document.y}`, {...flags});
  const snap = !(canvas.grid.type === CONST.GRID_TYPES.GRIDLESS
  || game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.SHIFT));

  if ( template._original ) {
    // Template is a clone in a drag operation.
    log(`refreshTemplate hook|Template ${template.id} is being dragged. ${snap ? "Snap." : "No snapping."}`);
    TokenCover.removeAttacker(template._original, false);
    TokenCover.addAttacker(template, false, false);
    TokenCover.attackerMoved(template);
  } else {
    log(`refreshTemplate hook|Template ${template.id} is original but not animating.`);
    TokenCover.attackerMoved(template);
  }
}

PATCHES.TEMPLATES.HOOKS = { hoverMeasuredTemplate, destroyMeasuredTemplate, refreshMeasuredTemplate };
