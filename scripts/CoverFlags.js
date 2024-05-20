/* globals
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, FLAGS, SOCKETS } from "./const.js";
import { CoverEffect } from "./CoverEffect.js";
import { log } from "./util.js";

/**
 * Version of Cover Effect that uses flags only, no active effects or items.
 * Flags stored on the token document.
 * Icon(s) signify cover and are stored at token.document.statuses.
 */
export class CoverFlags extends CoverEffect {

  /**
   * Get data used to construct a cover effect document.
   * Use the icon as the status.
   * @type {object}
   */
  get documentData() {
    const data = super.documentData;

    // Use the icon as a status effect.
    data.effects ??= [];
    if ( !data.effects.length ) data.effects.push(data.icon);



    return data;
  }


}