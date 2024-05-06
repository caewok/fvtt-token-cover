/* globals
canvas,
ChatMessage,
CONFIG,
foundry,
game,
Hooks,
socketlib,
Token,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, COVER, SOCKETS } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { Settings } from "./settings.js";
import { dialogPromise } from "./util.js";


const NULL_SET = new Set();

// ----- NOTE: Set up sockets so GM can create or modify items ----- //
Hooks.once("socketlib.ready", () => {
  SOCKETS.socket ??= socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("confirmCoverDialog", confirmCoverDialog);
});

async function confirmCoverDialog(data) {
  const dialog = CoverDialog.fromJSON(data);
  if ( !dialog ) return false;
  return await dialog.confirmCover({ askGM: true });
}

// Helper class to construct dialogs related to cover between attacker and target(s).
export class CoverDialog {

  /** @type {Token} */
  attacker;

  /** @type {Set<Token>} */
  targets = new Set();

  /** @type {Map<Token, Set<CoverType>>} */
  #coverCalculations = new Map();

  /** @type {object} */
  config = {};

  constructor(attacker, targets, config = {}) {
    attacker ??= game.user._lastSelected || canvas.tokens.controlled[0];
    targets ??= game.user.targets;
    if ( targets instanceof Token ) targets = [targets];

    // Store the provided attacker, targets, options used for the cover calculation.
    this.attacker = attacker;
    targets.forEach(t => this.targets.add(t));
    this.config = config;

    // Mostly for debugging
    if ( !attacker || !(attacker instanceof Token) ) console.error("CoverDialog|no attacker provided.");
    if ( this.targets.size < 1 ) console.warn("CoverDialog|no targets provided.");
  }

  toJSON() {
    return {
      attacker: this.attacker.id,
      coverCalculations: this.constructor._coverCalculationsToJSON(this.coverCalculations), // Targets are the cover calc keys
      config: this.config
    };
  }

  static fromJSON(data) {
    const canvasTokens = new Map(canvas.tokens.placeables.map(t => [t.id, t]));
    const attacker = canvasTokens.get(data.attacker);
    if ( !attacker ) {
      ui.notifications.error(`${game.i18n.localize("tokencover.name")}|Attacker for the GM dialog were not found.`);
      console.error(`${MODULE_ID}|CoverDialog#fromJSON|Attacker not found. ${data.attacker}`);
      return false;
    }
    const targets = new Set(Object.keys(data.coverCalculations).map(id => canvasTokens.get(id)));
    if ( targets.has(undefined) || targets.has(null) ) {
      ui.notifications.error(`${game.i18n.localize("tokencover.name")}|One or more targets for the GM dialog were not found.`);
      console.error(`${MODULE_ID}|CoverDialog#fromJSON|Targets not found. ${data.targets.join(", ")}`);
      return false;
    }

    const dialog = new this(attacker, targets, data.config);
    if ( !dialog.constructor._coverCalculationsFromJSON(data.coverCalculations) ) return false;
    return dialog;
  }

  /** @type {Set<Token>} */
  get targetsWithCover() { return this.targets.filter(t => this.coverCalculations.get(t).size); }

  /** @type {Map<Token, Set<CoverType>>} */
  get coverCalculations() {
    if ( this.#coverCalculations.size === this.targets.size ) return this.#coverCalculations;
    CoverCalculator.coverCalculations(this.attacker, this.targets, this.#coverCalculations, this.config);
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
  static _coverCalculationsFromJSON(coverCalculations) {
    const ctMap = CONFIG[MODULE_ID].CoverType.coverObjectsMap;
    const canvasTokens = new Map(canvas.tokens.placeables.map(t => [t.id, t]));
    const m = new Map(Object.entries(coverCalculations).map(([tokenId, coverTypeIds]) =>
      [canvasTokens.get(tokenId), new Set([...coverTypeIds.map(coverTypeId => ctMap.get(coverTypeId))])]));
    if ( m.has(undefined) || m.has(null) ) {
      ui.notifications.error(`${game.i18n.localize("tokencover.name")}|One or more tokens for the GM dialog were not found.`);
      console.error(`${MODULE_ID}|CoverDialog#_coverCalculationsFromJSON|Tokens not found.`, coverCalculations``);
      return false;
    }
    return m;
  }

  /**
   * Replace the cover calculations with JSON data
   */
  static _coverCalculationsToJSON(coverCalculations) {
    const json = {};
    coverCalculations.forEach((coverTypes, token) => json[token.id] = [...coverTypes.map(ct => ct.id)]);
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
   * Request that the user or GM confirm cover for a given attacker and targets
   * @param {object} [opts]   Optional parameters used to construct the dialog
   * @param {boolean} [opts.askGM]      Should the GM get the cover confirmation dialog?
   * @param {string} [opts.actionType]  "msak"|"mwak"|"rsak"|"rwak". Used to check if attacker ignores cover
   * @returns {object|false} JSON of coverCalculations that can be converted to a Map using _coverCalcluationsFromJSON
   */
  async confirmCover({ askGM } = {}) {
    askGM ||= false;
    const html = this._htmlConfirmCover();
    const dialogData = { title: game.i18n.localize(`${MODULE_ID}.phrases.ConfirmCover`), content: html };
    if ( askGM && !game.user.isGM ) {
      ui.notifications.info("Checking cover with GM...");
      return await SOCKETS.socket.executeAsGM("confirmCoverDialog", this.toJSON());
    } else {
      const res = await dialogPromise(dialogData);
      if ( "Close" === res ) return res;
      return this.constructor._getDialogCoverSelections(res.html);
    }
  }

  /**
   * Pull the cover selections from the dialog results.
   * @param {object} html    JQuery object returned from Dialog.
   * @returns {object}  id: coverSelection[]. Returned as object so it works with sockets.
   */
  static _getDialogCoverSelections(html) {
    const out = {};
    const coverPrioritySelections = html.find("[class=CoverPrioritySelect]");
    for ( const selection of coverPrioritySelections ) {
      const id = selection.id.replace("CoverPrioritySelect.", "");
      out[id] = [selection.value];
    }

    // Overlapping may have multiple
    const coverOverlappingSelections = html.find("[class=CoverOverlappingSelect]");
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
    let coverCalculationsJSON;
    let askGM = false;
    switch ( coverCheckOption ) {
      case choices.AUTO: return this.coverCalculations;
      case choices.USER_CANCEL: {
        const dialogRes = await this.showCoverResults();
        if ( "Close" === dialogRes ) return false;
        return this.coverCalculations;
      }
      case choices.GM: askGM = true;
      case choices.USER: { // eslint-disable-line no-fallthrough
        coverCalculationsJSON = await this.confirmCover({ askGM });
        break;
      }
    }
    if ( !coverCalculationsJSON ) return false; // User canceled.

    // Update the dialog calculations with user-provided calcs.
    const coverCalculations = this.constructor._coverCalculationsFromJSON(coverCalculationsJSON);
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
    opts.displayIgnored ??= false; // Don't describe what cover is ignored by attacker.
    opts.include3dDistance ??= false; // Save space by not including distance.

    if ( !opts.includeZeroCover && !this.targetsWithCover.size ) return;

    // Construct the chat message.
    const html = this._htmlShowCover(opts);
    return ChatMessage.create({ content: html });
  }

  /**
   * Update targets' cover types based on attacker --> target cover calculations.
   * Temporarily overrides the cover types, but only until the next update (e.g., attacker move)
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
      target.tokencover.refreshCoverTypes(true); // Force regardless of settings.
    });
  }

  /**
   * Update targets' cover effects based on attacker --> target cover calculations.
   * Relies on existing cover types for the attacker, which may have been modified by
   * `updateTargetsCoverType`.
   * Only local changes.
   * @param {Map<Token, Set<CoverType>>} [coverCalculations]
   */
  updateTargetsCoverEffects(coverCalculations) {
    if ( coverCalculations === false ) return; // User canceled.
    coverCalculations ??= this.coverCalculations;
    coverCalculations.keys().forEach(target => {
      if ( target.tokencover.updateCoverEffects() ) target.tokencover.refreshCoverEffects(true); // Force regardless of settings.
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
    return dialogPromise(dialogData);
  }

  /**
   * Build html to ask user to confirm cover choices for targets.
   * @returns {string}    HTML string
   */
  _htmlConfirmCover() {
    const htmlTable = this._htmlCoverTable({
      tableId: this.attacker.id,
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
   * @param {string} [opts.actionType]            "msak"|"mwak"|"rsak"|"rwak". Used to check if attacker ignores cover
   * @param {boolean} [opts.applied]              The cover is as-applied by user/GM versus calculated
   * @param {boolean} [opts.displayIgnored]       Display cover results for cover ignored by attacker
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
      tableId: this.attacker.id,
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
   * Construct html to describe the attacker.
   * Describe the type of action the attacker is taking and whether the attacker ignores certain cover.
   * @param {boolean} confirm
   * @param {number} nCover
   * @param {boolean} applied
   * @returns {string} html
   */
  _htmlAttacker({ imageWidth = 50, confirm = false, nCover = 0, applied = false } = {}) {
     // Describe the type of action the attacker is taking and whether the attacker ignores certain cover.
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
        ${targetLabel}${numCoverLabel}<b>${this.attacker.name}</b>
        ${actionDescription} ${ignoresCoverLabel}
      </div
      <div class="flexcol" style="flex-grow: 1">
        <img src="${this.attacker.document.texture.src}" alt="${this.attacker.name} image" width="${imageWidth}" style="border:0px">
      </div
    </div>
    `;
    return html;
  }

  /**
   * Create html that describes how the attacker ignores cover.
   * @param {string|undefined} actionType   "msak"|"mwak"|"rsak"|"rwak". Used to check if attacker ignores cover
   */
  _htmlIgnoresCover(actionType) {
    const ic = this.attacker.tokencover.ignoresCover;
    const allCoverIgnored = ic.all;
    const typeCoverIgnored = ic[actionType] || COVER.NONE;

    // Build the html code.
    let ignoresCoverLabel = "";
    if ( allCoverIgnored > 0 ) ignoresCoverLabel += `<br> &le; ≤ ${allCoverIgnored} (${CoverCalculator.attackNameForType("all")})`;
    if ( typeCoverIgnored > 0 && actionType !== "all" ) ignoresCoverLabel += `<br> &le; ≤ ${typeCoverIgnored} (${CoverCalculator.attackNameForType(actionType)}s)`;
    if ( ignoresCoverLabel !== "" ) ignoresCoverLabel = ` <br><em>Ignores:${ignoresCoverLabel}</em>`;
    return ignoresCoverLabel;
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
    const attackerCenter = Point3d.fromToken(this.attacker).top; // Measure from attacker vision point.
    return this.targets.map(target => {
      const data = {
        name: target.name,
        id: target.id,
        image: target.document.texture.src, // Attacker canvas image
      };

      // Cover types.
      const coverTypes = this.coverCalculations.get(target);
      data.priorityType = coverTypes.filter(ct => !ct.canOverlap);
      data.overlappingTypes = coverTypes.filter(ct => ct.canOverlap);

      // Cover percentage
      data.percentCover = target.tokencover.coverPercentFromAttacker(this.attacker);

      // Distance between attacker and target
      data.distance = Point3d.distanceBetween(attackerCenter, Point3d.fromTokenCenter(target));

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
 * @param {Token} attacker
 * @param {Set<Token>} targets    Targeted token set. May be modified by user choices.
 * @param {string} actionType
 * @returns {boolean} True if attack should continue; false otherwise.
 */
export async function coverAttackWorkflow(attacker, targets, actionType) {
  // Construct dialogs, if applicable
  // tokenCoverCalculations will be:
  // - false if user canceled
  // - undefined if covercheck is set to NONE. NONE may still require chat display.
  // - Map otherwise
  const KEYS = Settings.KEYS;
  const coverDialog = new CoverDialog(attacker, targets);

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
