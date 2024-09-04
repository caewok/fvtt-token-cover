/* globals
canvas,
CONFIG,
foundry,
game,
MouseInteractionManager,
PIXI,
_token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

export const PATCHES = {};
PATCHES.TEMPLATES = {};

/**
 * Hook hoverMeasuredTemplate to trigger template hiding
 * @param {MeasuredTemplate} template
 * @param {boolean} hovering
 */
function hoverMeasuredTemplate(template, hovering) {
  console.log(`hoverMeasuredTemplate|${hovering} for ${template.id}`);
}

PATCHES.TEMPLATES.HOOKS = { hoverMeasuredTemplate };