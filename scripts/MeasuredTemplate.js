/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { TokenCover } from "./TokenCover.js";

export const PATCHES = {};
PATCHES.TEMPLATES = {};

/**
 * Hook hoverMeasuredTemplate to trigger template hiding
 * @param {MeasuredTemplate} template
 * @param {boolean} hovering
 */
function hoverMeasuredTemplate(template, hovering) {
  console.log(`hoverMeasuredTemplate|${hovering} for ${template.id}`);
  if ( hovering ) {
    // When hovering, the template is the only attacker.
    TokenCover.clearAttackers(false);
    TokenCover.addAttacker(template);

  // When not hovering, remove this template as an attacker.
  } else TokenCover.removeAttacker(template);
}

/**
 * Hook destroyMeasuredTemplate to remove the template from the attackers
 * @param {MeasuredTemplate} template    The object instance being destroyed
 */
function destroyMeasuredTemplate(template) {
  TokenCover.removeAttacker(template);
}

PATCHES.TEMPLATES.HOOKS = { hoverMeasuredTemplate, destroyMeasuredTemplate };
