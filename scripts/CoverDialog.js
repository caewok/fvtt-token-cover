/* globals
canvas,
ChatMessage,
CONFIG,
duplicate,
game,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, COVER } from "./const.js";
import { CoverCalculator, SOCKETS, dialogPromise } from "./CoverCalculator.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { SETTINGS, getSetting } from "./settings.js";

// Helper class to construct dialogs related to cover between token(s) and target(s).

export class CoverDialog {

  /** @type {Token} */
  token;

  /** @type {Set<Token>} */
  targets = new Set();

  /** @type {Map<Token, COVER_TYPE>} */
  #coverCalculations = new Map();

  constructor(token, targets) {
    token ??= game.user._lastSelected;
    targets ??= game.user.targets;
    if ( targets instanceof Token ) targets = [targets];

    // Store the provided token and targets.
    this.token = token;
    targets.forEach(t => this.targets.add(t));

    // Mostly for debugging
    if ( !token || !(token instanceof Token) ) console.error("CoverDialog|no token provided.");
    if ( this.targets.size < 1 ) console.warn("CoverDialog|no targets provided.");
  }

  /** @type {Map<Token, COVER_TYPE} */
  get coverCalculations() {
    if ( this.#coverCalculations.size === this.targets.length ) return this.#coverCalculations;
    CoverCalculator.coverCalculations(this.token, this.targets, this.#coverCalculations);
    return this.#coverCalculations;
  }

  copyTokenCoverCalculations() {
    return new Map(this.#coverCalculations);
  }

  resetCoverCalculations() { this.#coverCalculations.clear(); }

  /**
   * If the targets(s) are not present in the set, add them and refresh cover calculation.
   * @param {Token[]} targets
   */
  _addTargets(targets) {
    if ( targets instanceof Token ) targets = [targets];
    let recalc = false;
    targets.forEach(t => {
      if ( !this.targets.has(t) ) {
        recalc = true;
        this.targets.add(t);
      }
    });
    if ( recalc ) this.resetCoverCalculations();
  }

  /**
   * Determine if one or more calculated token covers vary from the current token cover.
   * @param {Map<Token, COVER_TYPE>} [coverCalculations]
   * @returns {boolean}
   */
  _targetCoversMatchCalculations(coverCalculations) {
    coverCalculations ??= this.coverCalculations;
    for ( const [target, cover] of coverCalculations ) {
      if ( cover !== target.coverType ) return false;
    }
    return true;
  }

  /**
   * Request that the user or GM confirm cover for a given token and targets
   * @param {object} [opts]   Optional parameters used to construct the dialog
   * @param {boolean} [opts.askGM]      Should the GM get the cover confirmation dialog?
   * @param {string} [opts.actionType]  "msak"|"mwak"|"rsak"|"rwak". Used to check if token ignores cover
   * @returns {Map<Token, COVER_TYPE>}
   */
  async confirmCover({ askGM, actionType } = {}) {
    askGM ||= false;
    const html = this._htmlConfirmCover({ actionType });
    const dialogData = { title: game.i18n.localize("tokenvisibility.phrases.ConfirmCover"), content: html };
    const res = askGM
      ? await SOCKETS.socket.executeAsGM("dialogPromise", dialogData)
      : await this.constructor.dialogPromise(dialogData);
    if ( "Close" === res ) return false;

    // Update the cover calculations with User or GM selections
    const confirmedCalcs = dialogData.coverCalculations;
    const coverSelections = res.find("[class=CoverSelect]");
    for ( const selection of coverSelections ) {
      const id = selection.id.replace("CoverSelect.", "");
      const target = canvas.tokens.get(id);
      confirmedCalcs.set(target, selection.selectedIndex);
    }
    return confirmedCalcs;
  }

  /**
   * Based on settings, present user/GM with the cover calculations.
   * 1. GM confirms / cancels
   * 2. User confirms / cancels
   * 3. User accepts / cancels
   * @param {string} [actionType]  "msak"|"mwak"|"rsak"|"rwak". Used to check if token ignores cover
   * @returns {Map<Token, COVER_TYPE>|false}
   */
  async coverWorkflow(actionType) {
    const coverCheckOption = getSetting(SETTINGS.COVER.MIDIQOL.COVERCHECK);
    const choices = SETTINGS.COVER.MIDIQOL.COVERCHECK_CHOICES;
    let askGM = true;
    let coverCalculations;
    switch ( coverCheckOption ) {
      case choices.USER:
        askGM = false;
      case choices.GM:  // eslint-disable-line no-fallthrough
        coverCalculations = await this.confirmCover({ askGM, actionType });
        // Allow the GM or user to omit targets.
        coverCalculations.forEach(([token, cover]) => {
          if ( cover === COVER.TYPES.TOTAL) coverCalculations.delete(token);
        });
        break;
      case choices.USER_CANCEL: {
        const dialogRes = await this.showCoverResults();
        if ( "Close" === dialogRes ) return false;
      }
    }
    if ( !coverCalculations.size ) return false;
    return coverCalculations;
  }

  async _sendCoverCalculationsToChat(options) {
    const coverTable = this._htmlShowCover(options);
    if ( coverTable.nCoverTotal ) return ChatMessage.create({ content: coverTable.html });
  }

  /**
   * Update targets' cover based on token --> target cover calculations.
   * @param {Map<Token, COVER_TYPE>} [coverCalculations]
   * @returns {Promise<>}
   */
  async updateTargetsCover(coverCalculations) {
    coverCalculations ??= this.coverCalculations;
    const promises = [];
    coverCalculations.forEach((coverStatus, target) =>
      promises.push(CoverCalculator.enableCover(target.id, coverStatus)));
    return Promise.all(promises);
  }

  /**
   * Display a dialog displaying cover tests to the user.
   * @param {object} opts     Options passed to htmlCoverTable.
   */
  async showCoverResults(opts) {
    const coverAlgorithm = getSetting(SETTINGS.COVER.ALGORITHM);
    const algorithmDescription = game.i18n.localize(`${MODULE_ID}.settings.${coverAlgorithm}`);
    const html = this._htmlShowCover(opts);
    const content =
`
${html}
<em>Cover algorithm: ${algorithmDescription}</em>
<br>
<br>
`;
    const dialogData = {
      title: game.i18n.localize(`${MODULE_ID}.phrases.CoverByTarget`),
      content,
      buttons: {
        one: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize(`${MODULE_ID}.phrases.Done`)
        }
      },
      default: game.i18n.localize(`${MODULE_ID}.phrases.Done`),
      height: "100%"
    };
    return this.constructor.dialogPromise(dialogData);
  }

  /**
   * Build html to ask user to confirm cover choices for targets.
   * @param {object} [opts]     Options that affect the html output
   * @param {string} [opts.actionType]    "msak"|"mwak"|"rsak"|"rwak". Used to check if token ignores cover
   * @returns {string}    HTML string
   */
  _htmlConfirmCover({ actionType } = {}) {
    const { token, targets, coverCalculations } = this;

    const COVER_TYPES = CoverCalculator.COVER_TYPES;
    const ic = token.ignoresCoverType;
    const allCoverIgnored = ic.all;
    const typeCoverIgnored = ic[actionType] || COVER_TYPES.NONE;

    let ignoresCoverLabel = "";
    if ( allCoverIgnored > 0 ) ignoresCoverLabel += `<br> &le; ${CoverCalculator.coverNameForType(allCoverIgnored)} (${CoverCalculator.attackNameForType("all")})`;
    if ( typeCoverIgnored > 0 && actionType !== "all" ) ignoresCoverLabel += `<br> &le; ${CoverCalculator.coverNameForType(typeCoverIgnored)} (${CoverCalculator.attackNameForType(actionType)}s)`;
    if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = ` <br><em>Ignores:${ignoresCoverLabel}</em>`;

    const actionDescription = actionType ? `${CoverCalculator.attackNameForType(actionType)}.` : "";

    let html =
    `<b>${token.name}</b>. ${actionDescription} ${ignoresCoverLabel}
    `;

    const include3dDistance = true;
    const imageWidth = 50;
    const token_center = Point3d.fromToken(token).top; // Measure from token vision point.
    const distHeader = include3dDistance ? '<th style="text-align: right"><b>Dist. (3d)</b></th>' : "";
    html +=
    `
    <table id="${token.id}_table" class="table table-striped">
    <thead>
      <tr class="character-row">
        <th colspan="2"><b>Target</b></th>
        <th style="text-align: left;"><b>Applied</b></th>
        <th style="text-align: left;"><b>Estimated</b></th>
        ${distHeader}
      </tr>
    </thead>
    <tbody>
    `;

    const coverNames = duplicate(COVER_TYPES);
    for ( const [key, value] of Object.entries(coverNames) ) coverNames[key] = CoverCalculator.coverNameForType(value);

    for ( const target of targets ) {
      const cover = coverCalculations.get(target);

      const target_center = new Point3d(
        target.center.x,
        target.center.y,
        CoverCalculator.averageTokenElevationZ(target));

      const targetImage = target.document.texture.src; // Token canvas image.
      const dist = Point3d.distanceBetween(token_center, target_center);
      const distContent = include3dDistance ? `<td style="text-align: right">${Math.round(CONFIG.GeometryLib.utils.pixelsToGridUnits(dist))} ${canvas.scene.grid.units}</td>` : "";
      const coverOptions =
      `
      <option value="NONE" ${cover === COVER_TYPES.NONE ? "selected" : ""}>${coverNames.NONE}</option>
      <option value="LOW" ${cover === COVER_TYPES.LOW ? "selected" : ""}>${coverNames.LOW}</option>
      <option value="MEDIUM" ${cover === COVER_TYPES.MEDIUM ? "selected" : ""}>${coverNames.MEDIUM}</option>
      <option value="HIGH" ${cover === COVER_TYPES.HIGH ? "selected" : ""}>${coverNames.HIGH}</option>
      <option value="OMIT">Omit from attack</option>
      `;
      const coverSelector =
      `
      <select id="CoverSelect.${target.id}" class="CoverSelect">
      ${coverOptions}
      </select>
      `;

      html +=
      `
      <tr>
      <td><img src="${targetImage}" alt="${target.name} image" width="${imageWidth}" style="border:0px"></td>
      <td>${target.name}</td>
      <td>${coverSelector}</td>
      <td style="padding-left: 5px;"><em>${CoverCalculator.coverNameForType(cover)}</em></td>
      ${distContent}
      </tr>
      `;
    }

    html +=
    `
    </tbody>
    </table>
    <br>
    `;

    return html;
  }

  /**
   * Construct an html table describing cover for various target(s).
   * @param {object} [opts]  Options that affect the html creation
   * @param {boolean} [opts.include3dDistance]    Include 3d distance calculation
   * @param {boolean} [opts.includeZeroCover]     Include targets that have no cover in the resulting html
   * @param {number} [opts.imageWidth]            How wide to make the target images
   * @param {string} [opts.actionType]            "msak"|"mwak"|"rsak"|"rwak". Used to check if token ignores cover
   * @param {boolean} [opts.applied]              The cover is as-applied by user/GM versus calculated
   * @param {boolean} [opts.displayIgnored]       Display cover results for cover ignored by token
   * @returns {string}    HTML string
   */
  _htmlShowCover({
    include3dDistance = true,
    includeZeroCover = true,
    imageWidth = 50,
    coverCalculations,
    actionType,
    applied = false,
    displayIgnored = true } = {}) {

    const { token, targets } = this;
    coverCalculations ??= this.coverCalculations;
    const COVER_TYPES = CoverCalculator.COVER_TYPES;
    const token_center = new Point3d(token.center.x, token.center.y, token.topZ); // Measure from token vision point.

    let html = "";
    let nCover = 0;

    // Add the distance column if requested.
    const distHeader = include3dDistance ? '<th style="text-align: right"><b>Dist. (3d)</b></th>' : "";

    // Build the table header
    let htmlTable =
    `
    <table id="${token.id}_table" class="table table-striped">
    <thead>
      <tr class="character-row">
        <th colspan="2" ><b>Target</b></th>
        <th style="text-align: left"><b>${applied ? "Applied Cover" : "Cover"}</b></th>
        ${distHeader}
      </tr>
    </thead>
    <tbody>
    `;

    // Add a row to display the cover for each target.
    for ( const target of targets ) {
      // Determine the target cover.
      const cover = coverCalculations.get(target);
      if ( !includeZeroCover && cover === COVER_TYPES.NONE ) continue;
      if ( cover !== COVER_TYPES.NONE ) nCover += 1;

      // Pull the token canvas image.
      const targetImage = target.document.texture.src;

      // If needed, determine the target distance.
      let distContent = "";
      if ( include3dDistance ) {
        const target_center = new Point3d(
          target.center.x,
          target.center.y,
          CoverCalculator.averageTokenElevationZ(target));
        const dist = Point3d.distanceBetween(token_center, target_center);
        distContent = `<td style="text-align: right">${Math.round(CONFIG.GeometryLib.utils.pixelsToGridUnits(dist))} ${canvas.scene.grid.units}</td>`;
      }

      // Add the table row.
      htmlTable +=
      `
      <tr>
      <td><img src="${targetImage}" alt="${target.name} image" width="${imageWidth}" style="border:0px"></td>
      <td>${target.name}</td>
      <td>${CoverCalculator.coverNameForType(cover)}</td>
      ${distContent}
      </tr>
      `;
    }

    // Finalize the table.
    htmlTable +=
    `
    </tbody>
    </table>
    <br>
    `;

    // Describe the types of cover ignored by the token
    // If actionType is defined, use that to limit the types
    let ignoresCoverLabel = "";
    if ( displayIgnored ) {
      const ic = token.ignoresCoverType;
      if ( ic.all > 0 ) ignoresCoverLabel += `<br>� ${CoverCalculator.coverNameForType(ic.all)} cover (${CoverCalculator.attackNameForType("all")} attacks)`;
      if ( actionType && ic[actionType] > 0 ) ignoresCoverLabel += `<br>� ${CoverCalculator.coverNameForType(ic[actionType])} cover (${CoverCalculator.attackNameForType(actionType)} attacks)`;

      else { // Test them all...
        if ( ic.mwak ) ignoresCoverLabel += `<br>� ${CoverCalculator.coverNameForType(ic.mwak)} cover (${CoverCalculator.attackNameForType("mwak")} attacks)`;
        if ( ic.msak ) ignoresCoverLabel += `<br>� ${CoverCalculator.coverNameForType(ic.msak)} cover (${CoverCalculator.attackNameForType("msak")} attacks)`;
        if ( ic.rwak ) ignoresCoverLabel += `<br>� ${CoverCalculator.coverNameForType(ic.rwak)} cover (${CoverCalculator.attackNameForType("rwak")} attacks)`;
        if ( ic.rsak ) ignoresCoverLabel += `<br>� ${CoverCalculator.coverNameForType(ic.rsak)} cover (${CoverCalculator.attackNameForType("rsak")} attacks)`;
      }

      if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = `<br><em>${token.name} ignores:${ignoresCoverLabel}</em>`;
    }

    // State how many targets have cover prior to the cover table.
    const targetLabel = `${nCover} target${nCover === 1 ? "" : "s"}`;
    const numCoverLabel = applied
      ? nCover === 1 ? "has" : "have"
      : "may have";

    htmlTable =
    `
    ${targetLabel} ${numCoverLabel} cover from <b>${token.name}</b>.
    ${ignoresCoverLabel}
    ${htmlTable}
    `;

    // Add the table to the html only if there is at least one token with cover
    // or we are including tokens with no cover.
    if ( includeZeroCover || nCover ) html += htmlTable;
    return html;
  }
}

/**
 * Convert any dialog to a promise to allow use with await/async.
 * @content HTML content for the dialog.
 * @return Promise for the html content of the dialog
 * Will return "Cancel" or "Close" if those are selected.
 * See Dialog class in Foundry.
 * @param {DialogData} data          An object of dialog data which configures how the modal window is rendered
 * @param {DialogOptions} [options]  Dialog rendering options, see {@link Application}.
 * @returns {Promise<>|"Close"} The callback data or "Close" if user closed the window
 */
CoverDialog.dialogPromise = dialogPromise;

// NOTE: Helper functions


