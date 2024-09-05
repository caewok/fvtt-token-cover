/* globals
CONFIG,
CONST,
foundry
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";

/**
 * Abstract Region behavior re terrains
 */
export class SetCoverRegionBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {

  static defineSchema() {
    return {
      cover: new foundry.data.fields.StringField({
        label: `${MODULE_ID}.behavior.types.set-cover.fields.cover.name`,
        hint: `${MODULE_ID}.behavior.types.set-cover.fields.cover.hint`,
        choices: this.coverChoices,
        blank: true
      }),

      distance: new foundry.data.fields.NumberField({
        label: `${MODULE_ID}.behavior.types.set-cover.fields.distance.name`,
        hint: `${MODULE_ID}.behavior.types.set-cover.fields.distance.hint`,
        initial: 0,
        step: 0.1
      }),

      appliesToAttackers: new foundry.data.fields.BooleanField({
        label: `${MODULE_ID}.behavior.types.set-cover.fields.appliesToAttackers.name`,
        hint: `${MODULE_ID}.behavior.types.set-cover.fields.appliesToAttackers.hint`,
        initial: false
      }),

      exclusive: new foundry.data.fields.BooleanField({
        label: `${MODULE_ID}.behavior.types.set-cover.fields.exclusive.name`,
        hint: `${MODULE_ID}.behavior.types.set-cover.fields.exclusive.hint`,
        initial: false
      })
    };
  }

  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onTokenEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this.#onTokenExit
  };

  static #onTokenEnter(event) {
    const token = event.data.token?.object;
    if ( !token ) return;
    token.tokencover.updateCover();
  }

  static #onTokenExit(event) {
    const token = event.data.token?.object;
    if ( !token ) return;
    token.tokencover.updateCover();
  }

  static coverChoices() {
    return CONFIG[MODULE_ID].CoverEffect._mapStoredEffectNames();
  }
}

