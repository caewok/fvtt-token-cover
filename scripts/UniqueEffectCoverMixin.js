/* globals
foundry,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { ICONS, MODULE_ID } from "./const.js";

/**
 * A mixin which extends the UniqueEffect with specialized terrain behaviors
 * @category - Mixins
 * @param {AbstractUniqueEffect} Base         The base class mixed with terrain features
 * @returns {Cover}                           The mixed Cover class definition
 */
export function CoverMixin(Base) {
  return class Cover extends Base {

    /** @type {number} */
    get percentThreshold() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD] || 0; }

    /** @type {number} */
    get priority() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PRIORITY] || 0; }

    /** @type {boolean} */
    get canOverlap() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.CAN_OVERLAP]; }

    /** @type {boolean} */
    get includeWalls() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.INCLUDE_WALLS]; }

    /** @type {boolean} */
    get liveTokensBlock() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.LIVE_TOKENS_BLOCK]; }

    /** @type {boolean} */
    get deadTokensBlock() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.DEAD_TOKENS_BLOCK]; }

    /** @type {boolean} */
    get proneTokensBlock() { return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PRONE_TOKENS_BLOCK]; }

    /** @type {boolean} */
    get includeTokens() { return this.liveTokensBlock || this.deadTokensBlock; }

    /** @type {AlternativeLOSConfig} */
    get calcConfig() {
      return {
        deadTokensBlock: this.deadTokensBlock,
        liveTokensBlock: this.liveTokensBlock,
        proneTokensBlock: this.proneTokensBlock,
        wallsBlock: this.includeWalls
      };
    }

    // ----- NOTE: Calculation methods ----- //

    /**
     * Percent cover given this cover effect's settings for a pair of tokens.
     * @param {Token} attackingToken
     * @param {Token} targetToken
     * @returns {number}
     */
    percentCover(attackingToken, targetToken) {
      const { includeWalls, includeTokens } = this;
      const calc = attackingToken.tokencover.coverCalculator;
      calc.updateConfiguration(this.calcConfig);
      return calc.percentCover(targetToken, { includeWalls, includeTokens });
    }

    /**
     * Test if this cover effect could apply to a target token given an attacking token.
     * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
     * @param {Token} attackingToken      Token from which cover is sought
     * @param {Token} targetToken         Token to which cover would apply
     * @param {object} [_opts]            Options parameter that can be used by child classes.
     * @returns {boolean}
     */
    _couldApply(attackingToken, targetToken, _opts) {
      return this.percentCover(attackingToken, targetToken) >= this.percentThreshold;
    }


    /**
     * Alias
     * Test if a token has this terrain already.
     * @param {Token} token
     * @returns {boolean}
     */
    tokenHasCover(token) { return this.isOnToken(token); }

    /** @type {string} */
    static type = "Cover";

    /** @type {object} */
    static get _storageMapData() {
      return {
        name: "Cover",
        img: ICONS.MODULE,
        type: "base",
      };
    }

    /**
     * Default data required to be present in the base effect document.
     * @param {string} [activeEffectId]   The id to use
     * @returns {object}
     */
    static newDocumentData(activeEffectId) {
      const data = Base.newDocumentData.call(this, activeEffectId);
      data.name = game.i18n.localize(`${MODULE_ID}.phrases.newEffect`);
      data.img = ICONS.MODULE;

      data.flags = {
          [FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD]: 0,
          [FLAGS.COVER_EFFECT.RULES.PRIORITY]: 0,
          [FLAGS.COVER_EFFECT.RULES.OVERLAPS]: false,
          [FLAGS.COVER_EFFECT.RULES.INCLUDE_WALLS]: true,
          [FLAGS.COVER_EFFECT.RULES.LIVE_TOKENS_BLOCK]: false,
          [FLAGS.COVER_EFFECT.RULES.DEAD_TOKENS_BLOCK]: false,
          [FLAGS.COVER_EFFECT.RULES.PRONE_TOKENS_BLOCK]: false
      };

      return data;
    }

    /**
     * Transition a single document stored in the storage object
     */
    static async _transitionDocument(doc) {
      const coverEffectId = doc.getFlag(MODULE_ID, FLAGS.COVER_EFFECT.ID);
      if ( coverEffectId ) await doc.setFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID, coverEffectId);
    }
  };
}
