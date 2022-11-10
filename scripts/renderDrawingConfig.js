/* globals
renderTemplate,
game
*/

"use strict";

import { log } from "./util.js";
import { MODULE_ID, FLAGS } from "./const.js";

/**
 * Inject html to add controls to the drawing configuration.
 * If Levels module is active, allow the user to set drawings as holes for Area2d and Area3d.
 */
export async function renderDrawingConfigHook(app, html, data) {
  log("tokenVisibilityRenderDrawingConfig data", data);
  log(`enabled flag is ${app.object.getFlag(MODULE_ID, FLAGS.DRAWING.IS_HOLE)}`);
  log("tokenVisibilityRenderDrawingConfig data after", data);

  if ( !game.modules.get("levels")?.active ) return;

  const template = `modules/${MODULE_ID}/templates/token-visibility-drawing-config.html`;

  const myHTML = await renderTemplate(template, data);
  log("config rendered HTML", myHTML);
//   html.find(".form-group").last().after(myHTML);
  html.find("div[data-tab='position']").last().after(myHTML);

}
