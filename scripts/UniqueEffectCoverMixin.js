/* globals
CONFIG,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { ICONS, MODULE_ID, FLAGS } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";

/**
 * A mixin which extends the UniqueEffect with specialized terrain behaviors
 * @category - Mixins
 * @param {AbstractUniqueEffect} Base         The base class mixed with terrain features
 * @returns {Cover}                           The mixed Cover class definition
 */
export function CoverMixin(Base) {
  return class Cover extends Base {

    /** @type {number} */
    get percentThreshold() {
      return this.document.flags?.[MODULE_ID]?.[FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD] || 0;
    }

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
     * @param {Viewer} attacker
     * @param {Token} targetToken
     * @returns {number}
     */
    percentCover(attacker, targetToken) {
      const { includeWalls, includeTokens } = this;
      const calc = attacker.tokencover?.coverCalculator ?? new CoverCalculator(attacker);
      calc.updateConfiguration(this.calcConfig);
      return calc.percentCover(targetToken, { includeWalls, includeTokens });
    }

    /**
     * Test if this cover effect could apply to a target token given an attacking token.
     * Does not handle priority between cover effects. For that, use CoverEffect.coverEffectsForToken
     * @param {Viewer} attacker      Token from which cover is sought
     * @param {Token} targetToken         Token to which cover would apply
     * @param {object} [_opts]            Options parameter that can be used by child classes.
     * @returns {boolean}
     */
    _couldApply(attacker, targetToken, _opts) {
      return this.percentCover(attacker, targetToken) >= this.percentThreshold;
    }

    /** @alias {Map<string, UniqueEffect} */
    static get coverObjectsMap() { return this._instances; }

    /**
     * @alias
     * Test if a token has this terrain already.
     * @param {Token} token
     * @returns {boolean}
     */
    tokenHasCover(token) { return this.isOnToken(token); }

    /** @type {string} */
    static type = "Cover";

    /**
     * Get all effects ordered by priority as well as unordered effects.
     * @type {object}
     *   - @prop {AbstractCoverObject[]} ordered          From highest to lowest priority
     *   - @prop {Set<AbstractCoverObject> unordered}     All objects with priority === 0
     */
    static get sortedCoverObjects() {
      const ordered = [];
      const unordered = new Set();
      for ( const coverEffect of this._instances.values() ) {
        if ( !coverEffect.priority ) unordered.add(coverEffect);
        else ordered.push(coverEffect);
      }
      ordered.sort((a, b) => b.priority - a.priority);
      return { ordered, unordered };
    }


    /**
     * Determine what cover effects apply to a target token given an attacking token.
     * @param {Token} attackingToken
     * @param {Token} targetToken
     * @returns {Set<CoverEffect>}
     */
    static coverForToken(attackingToken, targetToken, opts = {}) {
      const effects = new Set();
      const { ordered, unordered } = this.sortedCoverObjects;

      // Test cover effects in priority order.
      for ( const coverEffect of ordered ) {
        if ( coverEffect._couldApply(attackingToken, targetToken, opts) ) {
          effects.add(coverEffect);
          if ( !coverEffect.canOverlap ) break;
        }
      }

      // Test cover effects without a set priority.
      for ( const coverEffect of unordered ) {
        // If there is already an effect, cannot use a non-overlapping effect.
        if ( !coverEffect.canOverlap && effects.size ) continue;
        if ( coverEffect._couldApply(attackingToken, targetToken, opts) ) effects.add(coverEffect);
      }
      return effects;
    }

    /**
     * Determine if the GM has added a cover effect override to a token.
     * Cover effect overrides have a UNIQUE_EFFECT.ID flag but no local flag.
     * @param {Token} actor
     * @returns {boolean}
     */
    static coverOverrideApplied(token) {
      // TODO: Either add LOCAL Flag or re-do so it is not needed. Maybe compare to source?
      const { ID, IS_LOCAL } = FLAGS.UNIQUE_EFFECT;
      for ( const effectDoc of CONFIG[MODULE_ID].CoverEffect._allUniqueEffectDocumentsOnToken(token) ) {
        const modFlags = effectDoc?.flags?.[MODULE_ID];
        if ( !modFlags ) continue;
        if ( modFlags[ID] && !modFlags[IS_LOCAL] ) return true;
      }
      return false;
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

      // Cover Rules flags
      const modFlags = data.flags[MODULE_ID];
      modFlags[FLAGS.COVER_EFFECT.RULES.PERCENT_THRESHOLD] = 0;
      modFlags[FLAGS.COVER_EFFECT.RULES.PRIORITY] = 0;
      modFlags[FLAGS.COVER_EFFECT.RULES.CAN_OVERLAP] = false;
      modFlags[FLAGS.COVER_EFFECT.RULES.INCLUDE_WALLS] = true;
      modFlags[FLAGS.COVER_EFFECT.RULES.LIVE_TOKENS_BLOCK] = false;
      modFlags[FLAGS.COVER_EFFECT.RULES.DEAD_TOKENS_BLOCK] = false;
      modFlags[FLAGS.COVER_EFFECT.RULES.PRONE_TOKENS_BLOCK] = false;
      return data;
    }

    /**
     * Transition a single document stored in the storage object
     */
    static async _transitionDocument(doc) {
      const coverEffectId = doc.getFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID);
      if ( coverEffectId ) await doc.setFlag(MODULE_ID, FLAGS.UNIQUE_EFFECT.ID, coverEffectId);
    }
  };
}
