/* globals
canvas,
ChatMessage,
CONFIG,
Dialog,
foundry,
fromUuidSync,
game,
Hooks,
socketlib,
Token
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, COVER, SOCKETS } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { Settings } from "./settings.js";


const NULL_SET = new Set();

// ----- NOTE: Set up sockets so GM can create or modify items ----- //
Hooks.once("socketlib.ready", () => {
  SOCKETS.socket ??= socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("confirmCoverDialog", confirmCoverDialog);
});

async function confirmCoverDialog(data) {
  const dialog = CoverDialog.fromJSON(data);
  const confirmedCalcs = await dialog.confirmCover({ askGM: true });
  if ( !confirmedCalcs ) return false;
  return dialog._coverCalculationsToJSON(confirmedCalcs);
}

// Helper class to construct dialogs related to cover between attacker token and target(s).
export class CoverDialog {

  /** @type {Token} */
  token;

  /** @type {Set<Token>} */
  targets = new Set();

  /** @type {Map<Token, Set<CoverType>>} */
  #coverCalculations = new Map();

  /** @type {object} */
  config = {};

  constructor(token, targets, config = {}) {
    token ??= game.user._lastSelected || canvas.tokens.controlled[0];
    targets ??= game.user.targets;
    if ( targets instanceof Token ) targets = [targets];

    // Store the provided token, targets, options used for the cover calculation.
    this.token = token;
    targets.forEach(t => this.targets.add(t));
    this.config = config;

    // Mostly for debugging
    if ( !token || !(token instanceof Token) ) console.error("CoverDialog|no token provided.");
    if ( this.targets.size < 1 ) console.warn("CoverDialog|no targets provided.");
  }

  toJSON() {
    return {
      token: this.token.uuid,
      targets: [...this.targets.map(t => t.uuid)],
      coverCalculations: this._coverCalculationsToJSON(),
      config: this.config
    };
  }

  static fromJSON(data) {
    const token = fromUuidSync(data.token);
    const targets = new Set(data.targets.map(t => fromUuidSync(t)));
    const dialog = new this(token, targets, data.config);
    dialog._coverCalculationsFromJSON(data.coverCalculations);
    return dialog;
  }

  /** @type {Set<Token>} */
  get targetsWithCover() { return this.targets.filter(t => this.coverCalculations.get(t).size); }

  /** @type {Map<Token, Set<CoverType>>} */
  get coverCalculations() {
    if ( this.#coverCalculations.size === this.targets.size ) return this.#coverCalculations;
    CoverCalculator.coverCalculations(this.token, this.targets, this.#coverCalculations, this.config);
    return this.#coverCalculations;
  }

  /**
   * Update the cover calculations given different data set.
   * Targets not in the underlying cover calculations will be ignored.
   * @param {Map<Token, Set<CoverType>>} newCalcs
   */
  updateCoverCalculations(newCalcs) {
    newCalcs.forEach((coverTypes, token) => {
      const existingTypes = this.coverCalculations.get(token);
      if ( !existingTypes ) return;
      if ( existingTypes.equals(coverTypes) ) return;
      existingTypes.clear();
      coverTypes.forEach(ct => existingTypes.add(ct)); // Copy so the newCalcs set is not tied to this one.
    })
  }

  /**
   * Get JSON for the cover calculations.
   */
  _coverCalculationsFromJSON(coverCalculations) {
    const ctMap = CONFIG[MODULE_ID].CoverType.coverObjectsMap;
    const m = new Map(coverCalculations.map(([tokenId, coverTypeId]) =>
      [fromUuidSync(tokenId), ctMap.get(coverTypeId)]));
    this.updateCoverCalculations(m);
  }

  /**
   * Replace the cover calculations with JSON data
   */
  _coverCalculationsToJSON(coverCalculations) {
    coverCalculations ??= this.coverCalculations;
    const json = [];
    coverCalculations.forEach((coverTypes, token) => coverCalculations.push([token.uuid, coverTypes.id]));
    return json;
  }

  /**
   * Create an independent copy of the cover calcs map.
   * @returns {Map<Token, Set<CoverType>>}
   */
  duplicateCoverCalculations() {
    const copy = new Map(this.coverCalculations);
    copy.forEach((coverTypes, token) => copy.set(token, new Set(coverTypes)));
    return copy;
  }

  /**
   * Clear the cover calculations
   */
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
   * Request that the user or GM confirm cover for a given token and targets
   * @param {object} [opts]   Optional parameters used to construct the dialog
   * @param {boolean} [opts.askGM]      Should the GM get the cover confirmation dialog?
   * @param {string} [opts.actionType]  "msak"|"mwak"|"rsak"|"rwak". Used to check if token ignores cover
   * @returns {Map<Token, Set<CoverType>>|false}
   */
  async confirmCover({ askGM } = {}) {
    askGM ||= false;
    const html = this._htmlConfirmCover();
    const dialogData = { title: game.i18n.localize(`${MODULE_ID}.phrases.ConfirmCover`), content: html };

    let coverSelections;
    if ( askGM ) {
      coverSelections = await SOCKETS.socket.executeAsGM("coverDialog", dialogData);
    } else {
      const res = await this.constructor.dialogPromise(dialogData);
      coverSelections = this.constructor._getDialogCoverSelections(res);
    }
    if ( "Close" === coverSelections ) return false;

    // Update the cover calculations with User or GM selections
    const confirmedCalcs = this.duplicateCoverCalculations();
    const coverTypes = CONFIG[MODULE_ID].CoverType.coverObjectsMap;
    Object.entries(coverSelections).forEach(([id, selectedIndices]) => {
      const target = canvas.tokens.get(id);
      const s = new Set(selectedIndices
        .filter(coverTypeId => coverTypes.has(coverTypeId)) // Filter out NONE from the selected.
        .map(coverTypeId => coverTypes.get(coverTypeId)));
      confirmedCalcs.set(target, s);
    });
    return confirmedCalcs;
  }

  /**
   * Pull the cover selections from the dialog results.
   * @param {object} res    JQuery object returned from Dialog.
   * @returns {object}  id: coverSelection[]. Returned as object so it works with sockets.
   */
  static _getDialogCoverSelections(res) {
    if ( "Close" === res ) return res;
    const out = {};
    const coverPrioritySelections = res.find("[class=CoverPrioritySelect]");
    for ( const selection of coverPrioritySelections ) {
      const id = selection.id.replace("CoverPrioritySelect.", "");
      out[id] = [selection.value];
    }

    // Overlapping may have multiple
    const coverOverlappingSelections = res.find("[class=CoverOverlappingSelect]");
    for ( const selection of coverOverlappingSelections ) {
      const id = selection.id.replace("CoverOverlappingSelect.", "");
      const nSelections = selection.length;
      const arr = out[id] ??= [];
      for ( let i = 0; i < nSelections; i += 1 ) {
        if ( selection[i].selected ) arr.push(selection.value);
      }
    }
    return out;
  }

  /**
   * Based on settings, present user/GM with the cover calculations.
   * 1. GM confirms / cancels
   * 2. User confirms / cancels
   * 3. User accepts / cancels
   * @returns {Map<Token, Set<CoverType>>|false|undefined}
   *   Undefined if setting is to not calculate cover.
   *   False if the user/gm canceled by closing the dialog.
   */
  async workflow() {
    const coverCheckOption = Settings.get(Settings.KEYS.COVER_WORKFLOW.CONFIRM);
    const choices = Settings.KEYS.COVER_WORKFLOW.CONFIRM_CHOICES;
    let coverCalculations;
    switch ( coverCheckOption ) {
      case choices.AUTO: return this.coverCalculations;
      case choices.USER_CANCEL: {
        const dialogRes = await this.showCoverResults();
        if ( "Close" === dialogRes ) return false;
        return this.coverCalculations;
      }
      case choices.USER: {
        coverCalculations = await this.confirmCover({ askGM: false });
        break;
      }
      case choices.GM: {
        if ( !game.user.isGM ) {
          coverCalculations = await SOCKETS.socket.confirmCoverDialog(this.toJSON());
          if ( coverCalculations ) coverCalculations = this._coverCalculationsFromJSON(coverCalculations);
        } else coverCalculations = await this.confirmCover({ askGM: true });
        break;
      }
    }
    if ( !coverCalculations ) return false; // User canceled.

    // Update the dialog calculations with user-provided calcs.
    this.updateCoverCalculations(coverCalculations);
    return coverCalculations;
  }

  /**
   * Display a chat message with the cover calculations.
   * @param {string} [html]   Html to display; defaults to this._htmlShowCover
   * @param {object} [opts]   Options to pass to this._htmlShowCover
   * @returns Result from ChatMessage.create.
   */
  async sendCoverCalculationsToChat(opts = {}) {
    // Reasonable defaults for a chat message
    opts.includeZeroCover ??= false; // Only display targets that have cover.
    opts.imageWidth ??= 30; // Smaller image for the chat.
    opts.applied ??= true; // Treat as applied instead of "may have".
    opts.displayIgnored ??= false; // Don't describe what cover is ignored by token.
    opts.include3dDistance ??= false; // Save space by not including distance.

    if ( !opts.includeZeroCover && !this.targetsWithCover.size ) return;

    // Construct the chat message.
    const html = this._htmlShowCover(opts);
    return ChatMessage.create({ content: html });
  }

  /**
   * Update targets' cover types based on token --> target cover calculations.
   * Temporarily overrides the cover types, but only until the next update (e.g., token move)
   * Only local.
   * @param {Map<Token, Set<CoverType>>} [coverCalculations]
   */
  updateTargetsCoverType(coverCalculations) {
    if ( coverCalculations === false ) return; // User canceled.
    coverCalculations ??= this.coverCalculations;
    coverCalculations.forEach((coverTypes, target) => {
      const existing = target.coverTypes;
      if ( existing.equals(coverTypes) ) return;
      existing.clear();
      coverTypes.forEach(ct => existing.add(ct));
      target.refreshCoverTypes(true); // Force regardless of settings.
    });
  }

  /**
   * Update targets' cover effects based on token --> target cover calculations.
   * Relies on existing cover types for the token, which may have been modified by
   * `updateTargetsCoverType`.
   * Only local changes.
   * @param {Map<Token, Set<CoverType>>} [coverCalculations]
   */
  updateTargetsCoverEffects(coverCalculations) {
    if ( coverCalculations === false ) return; // User canceled.
    coverCalculations ??= this.coverCalculations;
    coverCalculations.keys().forEach(target => {
      if ( target.updateCoverEffects() ) target.refreshCoverEffects(true); // Force regardless of settings.
    });
  }

  /**
   * Display a dialog displaying cover tests to the user.
   * @param {object} opts     Options passed to htmlCoverTable.
   */
  async showCoverResults(opts) {
    const coverAlgorithm = Settings.get(Settings.KEYS.LOS.TARGET.ALGORITHM);
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
   * @returns {string}    HTML string
   */
  _htmlConfirmCover() {
    const htmlTable = this._htmlCoverTable({
      tableId: this.token.id,
      allowSelection: true
    });
    const htmlAttacker = this._htmlAttacker({ confirm: true });
    const html =
    `
    ${htmlAttacker}
    ${htmlTable}
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
    applied = false } = {}) {

    const excludedColumns = include3dDistance ? NULL_SET : new Set("distance");
    const targetData = this._targetData();
    const htmlTable = this._htmlCoverTable({
      tableId: this.token.id,
      imageWidth,
      includeZeroCover,
      excludedColumns,
      allowSelection: false,
      targetData
    });

    // State how many targets have cover prior to the cover table.
    const nCover = targetData.filter(td => td.priorityType.size || td.overlappingTypes.size).size;
    const htmlAttacker = this._htmlAttacker({ confirm: false, nCover, applied, imageWidth });
    const html =
    `
    ${htmlAttacker}
    ${htmlTable}
    <br>
    `;
    return html;
  }

  /**
   * Construct html to describe the token attacker.
   * Describe the type of action the token is taking and whether the token ignores certain cover.
   * @param {boolean} confirm
   * @param {number} nCover
   * @param {boolean} applied
   * @returns {string} html
   */
  _htmlAttacker({ imageWidth = 50, confirm = false, nCover = 0, applied = false } = {}) {
     // Describe the type of action the token is taking and whether the token ignores certain cover.
    const ignoresCoverLabel = this._htmlIgnoresCover(this.config.actionType);
    const actionDescription = this.config.actionType ? `${CoverCalculator.attackNameForType(this.config.actionType)}.` : "";

    let targetLabel = "Confirm cover for ";
    let numCoverLabel = "";
    if ( !confirm ) {
      targetLabel = `${nCover} target${nCover === 1 ? " " : "s "}`;
      numCoverLabel = applied
        ? nCover === 1 ? " has" : " have"
        : " may have";
      numCoverLabel += " cover from ";
    }

    const html =
    `
    <div class="flexrow">
      <div class="flexcol" style="flex-grow: 8">
        ${targetLabel}${numCoverLabel}<b>${this.token.name}</b>
        ${actionDescription} ${ignoresCoverLabel}
      </div
      <div class="flexcol" style="flex-grow: 1">
        <img src="${this.token.document.texture.src}" alt="${this.token.name} image" width="${imageWidth}" style="border:0px">
      </div
    </div>
    `;
    return html;
  }

  /**
   * Create html that describes how the token ignores cover.
   * @param {string|undefined} actionType   "msak"|"mwak"|"rsak"|"rwak". Used to check if token ignores cover
   */
  _htmlIgnoresCover(actionType) {
    const ic = this.token.ignoresCover;
    const allCoverIgnored = ic.all;
    const typeCoverIgnored = ic[actionType] || COVER.NONE;

    // Build the html code.
    let ignoresCoverLabel = "";
    if ( allCoverIgnored > 0 ) ignoresCoverLabel += `<br> &le; ≤ ${allCoverIgnored} (${CoverCalculator.attackNameForType("all")})`;
    if ( typeCoverIgnored > 0 && actionType !== "all" ) ignoresCoverLabel += `<br> &le; ≤ ${typeCoverIgnored} (${CoverCalculator.attackNameForType(actionType)}s)`;
    if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = ` <br><em>Ignores:${ignoresCoverLabel}</em>`;
    return ignoresCoverLabel;
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
  static async dialogPromise(data, options = {}) {
    return new Promise((resolve, reject) => { // eslint-disable-line no-unused-vars
      dialogCallback(data, html => resolve(html), options);
    });
  }

  // ----- NOTE: Calculate cover data for html tables ----- //

  /**
   * Target data for each target, used in displaying cover information.
   * @returns {object[]} Each object has properties:
   *   - @prop {string} name
   *   - @prop {string} image
   *   - @prop {number} distance
   *   - @prop {string} coverNames
   *   - @prop {Set<CoverType>} priorityType
   *   - @prop {Set<CoverType>} overlappingTypes
   *   - @prop {number} percentCover
   */
  _targetData() {
    const tokenCenter = Point3d.fromToken(this.token).top; // Measure from token vision point.
    return this.targets.map(target => {
      const data = {
        name: target.name,
        id: target.id,
        image: target.document.texture.src, // Token canvas image
      };

      // Cover types.
      const coverTypes = this.coverCalculations.get(target);
      data.priorityType = coverTypes.filter(ct => !ct.canOverlap);
      data.overlappingTypes = coverTypes.filter(ct => ct.canOverlap);

      // Cover percentage
      data.percentCover = target.coverPercentFromAttacker(this.token);

      // Distance between attacker and target
      data.distance = Point3d.distanceBetween(tokenCenter, Point3d.fromTokenCenter(target));

      return data;
    });
  }

  /**
   * Construct an html table that describes the cover calculations.
   * Table has no headers and one or more columns.
   * Columns: icon, name, priorityCover, overlappingCover, percentCover, distance
   * ∆ My Token  | Three Quarters | Soft   | 75%     | 39 ft
   *
   * @param {object} [opts]       Options that affect how the table is displayed
   * @param {Set<string>} [opts.excludedColumns]    One or more columns to exclude
   * @param {number} [opts.imageWidth=50]           Width of the icon
   * @param {boolean} [opts.includeZeroCover=true]  Include targets without cover
   * @param {boolean} [opts.allowSelection=false]   If true, drop-downs allow selection of
   *    priorityCover and overlappingCover
   */
  _htmlCoverTable({
    tableId = foundry.utils.randomID(),
    excludedColumns = NULL_SET,
    imageWidth = 50,
    includeZeroCover = true,
    allowSelection = false,
    targetData
  } = {}) {

    targetData ??= this._targetData();
    const allCoverTypes = new Set([...CONFIG[MODULE_ID].CoverType.coverObjectsMap.values()]);
    const overlappingCoverTypes = allCoverTypes.filter(ct => ct.canOverlap);
    if ( !overlappingCoverTypes.size ) excludedColumns.add("overlappingCover");

    let htmlTable =
    `
    <table id="${tableId}_table" class="table table-striped">
    <tbody>
    `;

    for ( const td of targetData ) {
      if ( !includeZeroCover && !td.priorityType.size && !td.overlappingTypes.size ) continue;

      let htmlRow = `<tr>`;

      if ( !excludedColumns.has("icon") ) {
        htmlRow +=
        `
        <td><img src="${td.image}" alt="${td.name} image" width="${imageWidth}" style="border:0px"></td>
        `;
      }

      if ( !excludedColumns.has("name") ) {
        htmlRow +=
        `
        <td>${td.name}</td>
        `;
      }

      if ( !excludedColumns.has("priorityCover") ) {
        const r = allowSelection
          ? this._htmlCoverSelector(td.priorityType, td.id, false)
          : `${coverTypeNames(td.priorityType)}`;

        htmlRow +=
        `
        <td>${r}</td>
        `;
      }

      if ( !excludedColumns.has("overlappingCover") ) {
        const r = allowSelection
          ? this._htmlCoverSelector(td.overlappingTypes, td.id, true)
          : `${coverTypeNames(td.overlappingTypes)}`;

        htmlRow +=
        `
        <td>${r}</td>
        `;
      }

      if ( !excludedColumns.has("percentCover") ) {
        htmlRow +=
        `
        <td>${Math.round(td.percentCover * 100)}%</td>
        `;
      }

      if ( !excludedColumns.has("distance") ) {
        htmlRow +=
        `
        <td>${Math.round(CONFIG.GeometryLib.utils.pixelsToGridUnits(td.distance))} ${canvas.scene.grid.units}</td>
        `;
      }

      htmlRow +=
      `
      </tr>
      `;

      htmlTable += htmlRow;
    }

    htmlTable +=
    `
    </tbody>
    </table>
    `;

    return htmlTable;
  }

  /**
   * Construct html selector that lets the user select from a drop-down of cover types.
   * @param {Set<CoverType>} chosen           Chosen cover type(s)
   * @param {string} id                       Id of the selector; will be prefixed by "CoverSelect"
   * @param {boolean} [overlapping=false]     Are these overlapping or priority cover types?
   *   Overlapping uses a multiple selector
   * @returns {string} HTML
   */
  _htmlCoverSelector(chosen, id, overlapping = false) {
    chosen ??= new Set();
    id ??= foundry.utils.randomID();
    id = overlapping ? `CoverOverlappingSelect.${id}` : `CoverPrioritySelect.${id}`;
    const allCoverTypes = new Set([...CONFIG[MODULE_ID].CoverType.coverObjectsMap.values()]);
    const coverTypes = overlapping
      ? allCoverTypes.filter(ct => ct.canOverlap) : allCoverTypes.filter(ct => !ct.canOverlap);

    let coverOptions =
    `
    <option value="NONE" ${chosen.size ?  "" : "selected"}>${game.i18n.localize("tokencover.cover.None")}</option>
    `;

    for ( const coverType of coverTypes ) {
      coverOptions +=
      `
      <option value="${coverType.id}"${chosen.has(coverType) ? " selected" : ""}>${game.i18n.localize(coverType.name)}</option>
      `;
    }

    const cl = overlapping ? "CoverOverlappingSelect" : "CoverPrioritySelect";
    const coverSelector =
    `
    <select id="${id}" class="${cl}" ${overlapping && coverTypes.size > 1 ? "multiple" : ""}>
    ${coverOptions}
    </select>
    `;

    return coverSelector;
  }

  /**
   * Determine if one or more calculated token covers vary from the current token cover.
   * @param {Map<Token, Set<CoverType>} calcA     Output from `coverCalculations`
   * @param {Map<Token, Set<CoverType>} calcB     Output from `coverCalculations`
   * @param {boolean} [requireTargetMatch=true]   If false, targets not in both will be ignored.
   * @returns {boolean} False if the two calculation maps are not equal.
   */
  static _coverCalculationsEqual(calcA, calcB, requireTargetMatch = true) {
    if ( requireTargetMatch && calcA.size !== calcB.size ) return false;

    // All cover sets must be equal.
    for ( const [target, cover] of calcA ) {
      const targetB = calcB.get(target);
      if ( !targetB ) {
        if ( requireTargetMatch ) return false;
        continue;
      }
      if ( !targetB.equals(cover) ) return false;
    }
    return true;
  }
}

// NOTE: Helper functions

/**
 * Return a comma-separated string of cover type names for a set of cover types.
 * @param {Set<CoverType>} coverTypes
 * @returns {string} String of cover types or None, localized.
 */
function coverTypeNames(coverTypes) {
  return coverTypes.size
    ? [...coverTypes.map(ct => game.i18n.localize(ct.name))].join(", ")
    : game.i18n.localize("tokencover.cover.None");
}

/**
 * Workflow to process cover for given token and targets during attack.
 * Used by midi-qol and dnd5e functions.
 * @param {Token} token
 * @param {Set<Token>} targets    Targeted token set. May be modified by user choices.
 * @param {string} actionType
 * @returns {boolean} True if attack should continue; false otherwise.
 */
export async function coverAttackWorkflow(token, targets, actionType) {
  // Construct dialogs, if applicable
  // tokenCoverCalculations will be:
  // - false if user canceled
  // - undefined if covercheck is set to NONE. NONE may still require chat display.
  // - Map otherwise
  const KEYS = Settings.KEYS;
  const coverDialog = new CoverDialog(token, targets);

  // Determine if change has occurred.
  // Need to duplicate because this may change.
  // Set actionType after; treat as a change.
  const formerCalcs = coverDialog.duplicateCoverCalculations();

  // Set action type and see if a change occurs.
  coverDialog.config.actionType = actionType;
  coverDialog.resetCoverCalculations();
  const currCalcs = coverDialog.duplicateCoverCalculations();

  if ( Settings.get(KEYS.COVER_WORKFLOW.CONFIRM_CHANGE_ONLY)
    && CoverDialog._coverCalculationsEqual(formerCalcs, currCalcs, true) ) return currCalcs;

  const coverCalculations = await coverDialog.workflow(actionType);
  if ( coverCalculations === false ) return false;  // User canceled
  const changed = !CoverDialog._coverCalculationsEqual(formerCalcs, coverCalculations, false);

  // Update targets' cover and effects
  if ( changed ) {
    const NEVER = KEYS.COVER_TYPES.CHOICES.NEVER;
    if ( Settings.get(KEYS.COVER_TYPES.USE) !== NEVER ) coverDialog.updateTargetsCoverType(coverCalculations);
    if ( Settings.get(KEYS.COVER_EFFECTS.USE) !== NEVER ) coverDialog.updateTargetsCoverEffects(coverCalculations);
  }

  // Send to chat
  if ( Settings.get(KEYS.COVER_WORKFLOW.CHAT) ) {
    const opts = {
      actionType,
      coverCalculations
    };
    await coverDialog.sendCoverCalculationsToChat(opts);
  }
  return true;
}

/**
 * Create new dialog with a callback function that can be used for dialogPromise.
 * @content HTML content for the dialog.
 * @callbackFn Allows conversion of the callback to a promise using dialogPromise.
 * @return rendered dialog.
 */
function dialogCallback(data, callbackFn, options = {}) {
  data.buttons = {
    one: {
      icon: '<i class="fas fa-check"></i>',
      label: "Confirm",
      callback: html => callbackFn(html)
    }
  };

  data.default = "one";
  data.close = () => callbackFn("Close");

  let d = new Dialog(data, options);
  d.render(true, { height: "100%" });
}
