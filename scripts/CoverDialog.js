/* globals
canvas,
CONFIG,
duplicate,
game
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { CoverCalculator, SOCKETS, dialogPromise } from "./CoverCalculator.js";
import { Point3d } from "./geometry/3d/Point3d.js";

// Helper class to construct dialogs related to cover between token(s) and target(s).


export class CoverDialog {

  /** @type {Token[]} */
  tokens = [];

  /** @type {Token[]} */
  targets = [];

  /**
   * @typedef TokenCoverCalculations
   * @type {object}
   * @property {string: COVER_TYPE}
   * Each property is the string of the token id, with the cover type for that token.
   */

  /** @type {{object{TokenCoverCalculations}} */
  #coverCalculations;

  constructor(tokens, targets) {
    if ( !tokens ) tokens = [...canvas.tokens.controlled];
    if ( !targets ) targets = [...game.user.targets];

    this.tokens = tokens instanceof Array ? tokens : [tokens];
    this.targets = targets instanceof Array ? targets : [targets];

    if ( this.tokens.length < 1 ) console.warn("CoverDialog|no tokens provided.");
    if ( this.targets.length < 1 ) console.warn("CoverDialog|no targets provided.");
  }

  get coverCalculations() {
    return this.#coverCalculations
      || (this.#coverCalculations = CoverCalculator.coverCalculations(this.tokens, this.targets));
  }

  resetCoverCalculations() { this.#coverCalculations = undefined; }

  /**
   * Retrieve cover calculations for a specific token of those provided.
   * If token ignores cover, apply that as well.
   * @param {Token} token
   * @param {string} actionType     "msak"|"mwak"|"rsak"|"rwak"
   */
  coverCalculationsForToken(token, actionType) {
    const COVER_TYPES = CoverCalculator.COVER_TYPES;
    const ic = token.ignoresCoverType;
    const allCoverIgnored = ic.all;
    const typeCoverIgnored = ic[actionType] || COVER_TYPES.NONE;
    const ignoresCover = allCoverIgnored ? COVER_TYPES.TOTAL : typeCoverIgnored;
    const coverCalculations = duplicate(this.coverCalculations[token.id]);
    const targets = this.targets;
    for ( const target of targets ) {
      const cover = coverCalculations[target.id];
      const calcCover = cover <= ignoresCover ? COVER_TYPES.NONE : cover;
      coverCalculations[target.id] = calcCover;
    }
    return coverCalculations;
  }

  /**
   * Request that the user or GM confirm cover for a given token and targets
   * @param {boolean} askGM   Should the GM get the cover confirmation dialog?
   * @param {object} [opts]   Optional parameters used to construct the dialog
   * @param {Token} [opts.token]      Which token to use to test for cover. Default is this.tokens[0]
   * @param {Token[]} [opts.targets]  Array of targets to test. Defaults to this.targets
   * @param {string} [actionType]     "msak"|"mwak"|"rsak"|"rwak". Used to check if token ignores cover
   * @returns {TokenCoverCalculations}
   */
  async confirmCover(askGM = false, { token, targets, actionType } = {}) {
    const dialogData = this._coverCheckDialogContent({ token, targets, actionType });
    const res = askGM
      ? await SOCKETS.socket.executeAsGM("dialogPromise", dialogData)
      : await this.constructor.dialogPromise(dialogData);
    if ( "Close" === res ) return false;

    // Update the cover calculations with User or GM selections
    const tokenCoverCalculations = res.tokenCoverCalculations;
    const coverSelections = res.find("[class=CoverSelect]");
    const nTargets = res.targets.length;
    for ( let i = 0; i < nTargets; i += 1 ) {
      const selectedCover = coverSelections[i].selectedIndex;
      tokenCoverCalculations[targets[i].id] = selectedCover;
    }
    return tokenCoverCalculations;
  }

  /**
   *

  /**
   * Build cover check dialog data to ask the user to confirm cover choices for targets.
   */
  _coverCheckDialogContent({ token, targets, tokenCoverCalculations, actionType } = {}) {
    token ??= this.tokens[0];
    targets ??= this.targets;
    tokenCoverCalculations ??= this.coverCalculationsForToken(token, actionType);

    const COVER_TYPES = CoverCalculator.COVER_TYPES;
    const ic = token.ignoresCoverType;
    const allCoverIgnored = ic.all;
    const typeCoverIgnored = ic[actionType] || COVER_TYPES.NONE;

    let ignoresCoverLabel = "";
    if ( allCoverIgnored > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(allCoverIgnored)} cover (${CoverCalculator.attackNameForType("all")} attacks)`;
    if ( typeCoverIgnored > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(typeCoverIgnored)} cover (${CoverCalculator.attackNameForType(actionType)} attacks)`;
    if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = ` <em>Ignores:${ignoresCoverLabel}</em>`;

    let html = `<b>${token.name}</b>. ${CoverCalculator.attackNameForType(actionType)} attack. ${ignoresCoverLabel}`;

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
        <th style="text-align: left"><b>Applied</b></th>
        <th style="text-align: left"><b>Estimated</b></th>
        ${distHeader}
      </tr>
    </thead>
    <tbody>
    `;

    const coverNames = duplicate(COVER_TYPES);
    for ( const [key, value] of Object.entries(coverNames) ) coverNames[key] = CoverCalculator.coverNameForType(value);

    for ( const target of targets ) {
      const cover = tokenCoverCalculations[target.id];

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
      <td><em>${CoverCalculator.coverNameForType(cover)}</em></td>
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

    const dialogData = {
      content: html,
      title: "Confirm cover",
      tokenCoverCalculations,
      token,
      targets
    };

    return dialogData;
  }

  /**
   * Construct an html table describing cover for various target(s) versus token(s).
   * @param {Token[]} tokens    Array of tokens to measure cover from.
   * @param {Token[]} targets   Target tokens that may have cover from one or more tokens.
   * @param {object} [options]  Options that affect the html creation
   * @param {boolean} [options.include3dDistance]   Include 3d distance calculation.
   * @param {boolean} [options.includeZeroCover]  Include targets that have no cover in the resulting html.
   * @returns {object {html: {string}, nCover: {number}, coverResults: {COVER_TYPES[][]}}}
   *   String of html content that can be used in a Dialog or ChatMessage.
   */
  htmlCoverTable({ tokens, targets,
    include3dDistance = true,
    includeZeroCover = true,
    imageWidth = 50,
    coverCalculations,
    actionType,
    applied = false,
    displayIgnored = true } = {}) {

    tokens ??= this.tokens;
    targets ??= this.targets;

    if ( !coverCalculations ) coverCalculations = CoverCalculator.coverCalculations(tokens, targets);

    let html = "";
    const coverResults = [];
    let nCoverTotal = 0;
    for ( const token of tokens ) {
      let nCover = 0;
      const targetCoverResults = [];
      coverResults.push(targetCoverResults);
      const token_center = new Point3d(token.center.x, token.center.y, token.topZ); // Measure from token vision point.

      const distHeader = include3dDistance ? '<th style="text-align: right"><b>Dist. (3d)</b></th>' : "";
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

      for ( const target of targets ) {
        if ( token.id === target.id ) {
          // Skip targeting oneself.
          targetCoverResults.push(this.COVER_TYPES.NONE);
          continue;
        }

        const target_center = new Point3d(
          target.center.x,
          target.center.y,
          CoverCalculator.averageTokenElevationZ(target));

        const cover = coverCalculations[token.id][target.id];

        targetCoverResults.push(cover);

        if ( !includeZeroCover && cover === this.COVER_TYPES.NONE ) continue;
        if ( cover !== this.COVER_TYPES.NONE ) nCover += 1;

        const targetImage = target.document.texture.src; // Token canvas image.
        const dist = Point3d.distanceBetween(token_center, target_center);
        const distContent = include3dDistance ? `<td style="text-align: right">${Math.round(CONFIG.GeometryLib.utils.pixelsToGridUnits(dist))} ${canvas.scene.grid.units}</td>` : "";

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
        if ( ic.all > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.all)} cover (${CoverCalculator.attackNameForType("all")} attacks)`;
        if ( actionType && ic[actionType] > 0 ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic[actionType])} cover (${CoverCalculator.attackNameForType(actionType)} attacks)`;

        else { // Test them all...
          if ( ic.mwak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.mwak)} cover (${CoverCalculator.attackNameForType("mwak")} attacks)`;
          if ( ic.msak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.msak)} cover (${CoverCalculator.attackNameForType("msak")} attacks)`;
          if ( ic.rwak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.rwak)} cover (${CoverCalculator.attackNameForType("rwak")} attacks)`;
          if ( ic.rsak ) ignoresCoverLabel += `<br>≤ ${CoverCalculator.coverNameForType(ic.rsak)} cover (${CoverCalculator.attackNameForType("rsak")} attacks)`;
        }

        if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = `<br><em>${token.name} ignores:${ignoresCoverLabel}</em>`;
      }

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

      nCoverTotal += nCover;
      if ( includeZeroCover || nCover ) html += htmlTable;
    }

    return {
      nCoverTotal,
      html,
      coverResults
    };
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


