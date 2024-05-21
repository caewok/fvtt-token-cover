/* globals
CONST,
flattenObject
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { CoverActiveEffect } from "./CoverActiveEffect.js";
import { Settings } from "./settings.js";

export class CoverFlags extends CoverActiveEffect {
  /**
   * Get data used to construct a local cover effect document.
   * For CoverFlag, this strips down to just the flags.
   * @type {object}
   */
  get localDocumentData() {
    const { flags } = super.localDocumentData;
    return { flags };
  }


  /**
   * Internal method to add this cover icon to the token locally.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _addToToken(token) {
    const doc = this.localDocumentData;
    token.document.updateSource(doc);

    // If token is secret, ignore
    if ( token.document.disposition === CONST.TOKEN_DISPOSITIONS.SECRET &&
      Settings.get(Settings.KEYS.DISPLAY_SECRET_COVER) ) return true;

    if ( token.document.effects.includes(this.icon) ) return true;

    // Add the status icon to the token.
    token.document.effects.push(this.icon);
    return true;
  }

  /**
   * Internal method to remove this cover effect from the token.
   * @param {Token} token
   * @returns {boolean} True if change was made.
   */
  _removeFromToken(token) {
    if ( Object.hasOwn(token.document.flags, MODULE_ID) ) {
      // Drop each flag.
      const tcDoc = flattenObject(this.localDocumentData);
      for ( const key of Object.keys(tcDoc) ) {
        delete tcDoc[key];
        const idx = key.lastIndexOf(".")
        if ( !~idx ) continue;
        const deletionKey = key.slice(0, idx + 1).concat("-=", key.slice(idx + 1));
        tcDoc[deletionKey] = null;
      }
       token.document.updateSource(tcDoc);
    }

    // Remove the status icon
    token.document.effects.findSplice(elem => elem === this.icon)
    return true;
  }

  /**
   * Get all documents for a give token/actor that could contain a cover effect.
   * Each document should be an object that has a "flags" property.
   * @param {Token} token
   * @returns {EmbeddedCollection|DocumentCollection|Map}
   */
  static _effectDocumentsOnToken(token) {
    const m = new Map();
    m.set(token.id, token.document);
    return m;
  }

}

/**
 * Specialized handling of cover effect rules in dnd5e.
 */
export class CoverFlagsDND5E extends CoverFlags {
  /**
   * Test if this cover effect could apply to a target token given an attacking token.
   * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
   * @param {Token} attackingToken        Token from which cover is sought
   * @param {Token} targetToken           Token to which cover would apply
   * @param {object} [opts]               Options used to determine whether to ignore cover
   * @param {CONFIG.DND5E.itemActionTypes} [actionType="all"]   Attack action type
   * @returns {boolean}
   */
  _couldApply(attackingToken, targetToken,  opts = {}) {
    const actionType = opts.actionType ?? "all";
    const ignoresCover = attackingToken.tokencover.ignoresCover?.[actionType];
    if ( ignoresCover && ignoresCover >= this.document.percentThreshold ) return false;
    return super._couldApply(attackingToken, targetToken);
  }
}
