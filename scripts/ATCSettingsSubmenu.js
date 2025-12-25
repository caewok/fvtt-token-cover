/* globals
game,
ui,
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID } from "./const.js";
import { SETTINGS } from "./settings.js";
import { SettingsSubmenu } from "./SettingsSubmenu.js";
import { ViewerLOS } from "./LOS/ViewerLOS.js";

export class ATCSettingsSubmenu extends SettingsSubmenu {
  static DEFAULT_OPTIONS = {
    initialCategory: "losTarget",
    subtemplates: {
      sidebarFooter: `modules/${MODULE_ID}/templates/settings-submenu-buttons.html`,
    },
    actions: {
      resetPF2e: ATCSettingsSubmenu.#onResetPF2e,
      resetDND5e: ATCSettingsSubmenu.#onResetDND5e,
      reset3d: ATCSettingsSubmenu.#onReset3d,
    },
  };

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    const targetTab = this.element.querySelectorAll('[data-tab="losTarget"]')[1];
    if ( targetTab ) {
      // Add data action to the algorithm selector.
      const algSelector = targetTab.querySelector('[name="tokencover.los-algorithm"]');
      algSelector.addEventListener("change", ATCSettingsSubmenu._onAlgorithmSelect.bind(this));
      await ATCSettingsSubmenu._onAlgorithmSelect.call(this);
    }
  }

  static async #onResetPF2e() {
    console.log("onResetPF2e");

    // Set each value in the application.
    const PI = ViewerLOS.POINT_INDICES;
    const LOS = SETTINGS.LOS;
    const opts = {
      losTarget: {
        [LOS.TARGET.ALGORITHM]: LOS.TARGET.TYPES.POINTS,
        [LOS.TARGET.PERCENT]: 0,
        [LOS.TARGET.LARGE]: true,

        [LOS.TARGET.POINT_OPTIONS.POINTS]: [PI.CENTER, PI.CORNERS.FACING, PI.CORNERS.BACK, PI.MID.FACING, PI.MID.BACK],
        [LOS.TARGET.POINT_OPTIONS.INSET]: 0.75,
      },
      losViewer: {
        [LOS.VIEWER.POINTS]: [PI.CENTER],
        [LOS.VIEWER.INSET]: 0,
      },
    };
    setOptionValues.call(this, opts);
    const moduleName = game.i18n.localize(`${MODULE_ID}.name`);
    const message = game.i18n.localize(`${MODULE_ID}.settings.submenu.notifyDND5e`);
    ui.notifications.notify(`${moduleName} | ${message}`);
  }

  static async #onResetDND5e() {
    console.log("onResetDND5e");

    // Set each value in the application.
    const PI = ViewerLOS.POINT_INDICES;
    const LOS = SETTINGS.LOS;
    const opts = {
      losTarget: {
        [LOS.TARGET.ALGORITHM]: LOS.TARGET.TYPES.POINTS,
        [LOS.TARGET.PERCENT]: 0,
        [LOS.TARGET.LARGE]: true,

        [LOS.TARGET.POINT_OPTIONS.POINTS]: [PI.CORNERS.FACING, PI.CORNERS.BACK],
        [LOS.TARGET.POINT_OPTIONS.INSET]: 0,
      },
      losViewer: {
        [LOS.VIEWER.POINTS]: [PI.CORNERS.FACING, PI.CORNERS.BACK],
        [LOS.VIEWER.INSET]: 0,
      },
    };
    setOptionValues.call(this, opts);
    const moduleName = game.i18n.localize(`${MODULE_ID}.name`);
    const message = game.i18n.localize(`${MODULE_ID}.settings.submenu.notifyDND5e`);
    ui.notifications.notify(`${moduleName} | ${message}`);
  }

  static async #onReset3d() {
    console.log("onReset3d");

    // Set each value in the application.
    const PI = ViewerLOS.POINT_INDICES;
    const { LOS, RANGE, POINT_TYPES } = SETTINGS;
    const opts = {
      losTarget: {
        [LOS.TARGET.ALGORITHM]: LOS.TARGET.TYPES.WEBGL2,
        [LOS.TARGET.PERCENT]: 0.2,
        [LOS.TARGET.LARGE]: false,
      },
      losViewer: {
        [LOS.VIEWER.POINTS]: [PI.CENTER],
        [LOS.VIEWER.INSET]: 0,
      },
    }
    setOptionValues.call(this, opts);
    await this.constructor._onAlgorithmSelect.call(this);
    const moduleName = game.i18n.localize(`${MODULE_ID}.name`);
    const message = game.i18n.localize(`${MODULE_ID}.settings.submenu.notify3d`);
    ui.notifications.notify(`${moduleName} | ${message}`);
  }

  static async _onAlgorithmSelect() {
    const losTab = this.element.querySelectorAll('[data-tab="losTarget"]')[1];
    if ( losTab ) {
    // Add data action to the algorithm selector.
      const algSelector = losTab.querySelector('[name="tokencover.los-algorithm"]');
      const isPoints = algSelector.value === "los-algorithm-points";
      const targetOptionsElem = losTab.querySelector('[name="tokencover.los-points-options-target"]');
      targetOptionsElem.parentElement.parentElement.style.display = isPoints ? "block" : "none";

      const targetInsetElem = losTab.querySelector('[name="tokencover.los-inset-target"]');
      targetInsetElem.parentElement.parentElement.style.display = isPoints ? "block" : "none";
    }
    this.setPosition(this.position); // Force display refresh.
  }
}

/**
 * Helper to set different elements of the settings submenu.
 * @param {object} tabOpts
 *   - @prop {object} tab name
 *     - @prop {object} setting name: setting value
 */
function setOptionValues(tabOpts) {
  for ( const tab of Object.keys(tabOpts) ) {
    const tabElem = this.element.querySelectorAll(`[data-tab="${tab}"]`)[1];
    if ( !tabElem ) continue; // Failsafe.
    for ( const [key, value] of Object.entries(tabOpts[tab]) ) {
      const optionElem = tabElem.querySelector(`[name="${MODULE_ID}.${key}"]`);
      if ( !optionElem ) continue;
      optionElem.value = value;
    }
  }
}

