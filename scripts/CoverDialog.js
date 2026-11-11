/* globals
canvas,
ChatMessage,
CONFIG,
foundry,
fromUuidSync,
game,
Hooks,
renderTemplate,
socketlib,
ui
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { MODULE_ID, SOCKETS, FA_ICONS, TEMPLATES } from "./const.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { Point3d } from "./geometry/3d/Point3d.js";
import { Settings } from "./settings.js";
import { NULL_SET, pixelsToGridUnits} from "./geometry/util.js";
import { UniqueEffectDefinition } from "./UniqueEffectDefinition.js";
import { TokenEffects } from "./TokenEffects.js";
import { TokenGeometry } from "./geometry/placeable_geometry/TokenGeometry.js";
import { Draw } from "./geometry/Draw.js";
import { getPluralizedString } from "./util.js";

const coverName = def => game.i18n.localize(def ? def.name : `${MODULE_ID}.cover.None`);
const NONE = "NONE";
const coverDefinitions = () => UniqueEffectDefinition.all
  .filter(d => d.category === "cover")
  .sort((a, b) => a.minPercent - b.minPercent);


// ----- NOTE: Set up sockets so GM can create or modify items ----- //
Hooks.once("socketlib.ready", () => {
  SOCKETS.socket ??= socketlib.registerModule(MODULE_ID);
  SOCKETS.socket.register("confirmCoverDialog", confirmCoverDialog);
});

async function confirmCoverDialog(data) {
  const dialog = CoverDialog.fromJSON(data);
  if ( !dialog ) return null;
  return await dialog.confirmCover({ askGM: true });
}

// Helper class to construct dialogs related to cover between attacker and target(s).
export class CoverDialog {

  /** @type {Token} */
  attacker;

  /** @type {Set<Token>} */
  targets = new Set();

  /** @type {Map<Token, UniqueEffectDefinition|null} */
  #coverCalculations = new Map();

  /** @type {object} */
  config = {};

  constructor(attacker, targets, config = {}) {
    if ( !attacker && game.user._lastSelected ) attacker = fromUuidSync(game.user._lastSelected)?.object;
    attacker ??= canvas.tokens.controlled[0];
    targets ??= game.user.targets;
    if ( targets instanceof foundry.canvas.placeables.Token ) targets = [targets];

    // Store the provided attacker, targets, options used for the cover calculation.
    this.attacker = attacker;
    targets.forEach(t => this.targets.add(t));
    this.config = config;

    // Mostly for debugging
    if ( !attacker ) console.error("CoverDialog|no attacker provided.");
    if ( this.targets.size < 1 ) console.warn("CoverDialog|no targets provided.");
  }

  // ----- NOTE: Data Model ---- //

  /** @type {Set<Token>} */
  get targetsWithCover() { return this.targets.filter(t => this.coverCalculations.get(t)); }

  /**
   * Update the cover calculations given different data set.
   * Targets not in the underlying cover calculations will be ignored.
   * @param {Map<Token, Set<CoverEffect>>} newCalcs
   */
  updateCoverCalculations(newCalcs) {
    for ( const [token, def] of newCalcs ) {
      if ( this.targets.has(token) ) this.coverCalculations.set(token, def ?? null);
    }
  }

  /**
   * Check if the cover calculations differ from the target tokens' cover types.
   * @returns {boolean}
   */
  _coverDiffersFromCurrent() {
    for ( const [token, def] of this.coverCalculations ) {
      if ( (token.tokencover.currentCover?.id ?? null) !== (def?.id ?? null) ) return true;
    }
    return false;
  }

  // ----- NOTE: JSON ----- //

  toJSON() {
    return {
      attacker: this.attacker?.id || this.attacker.toString(),
      coverCalculations: this.constructor._coverCalculationsToJSON(this.coverCalculations), // Targets are the cover calc keys
      config: this.config
    };
  }

  static _coverCalculationsToJSON(calcs) {
    const out = {};
    for ( const [token, def] of calcs ) out[token.id] = def?.id ?? NONE;
    return out;
  }

  static _coverCalculationsFromJSON(json) {
    const tokens = new Map(canvas.tokens.placeables.map(t => [t.id, t]));
    const out = new Map();
    for ( const [tokenId, defId] of Object.entries(json ?? {}) ) {
      const token = tokens.get(tokenId);
      if ( !token ) { console.error(`${MODULE_ID}|Token ${tokenId} not found.`); continue; }
      const id = Array.isArray(defId) ? defId[0] : defId; // Tolerate the old array format.
      const def = id === NONE || id == null ? null : UniqueEffectDefinition.get(id);
      if ( def === undefined ) { console.error(`${MODULE_ID}|Cover definition ${id} not found.`); continue; }
      out.set(token, def);
    }
    return out;
  }

  static fromJSON(data) {
    const tokens = new Map(canvas.tokens.placeables.map(t => [t.id, t]));
    const attacker = tokens.get(data.attacker);
    if ( !attacker ) return false;
    const calcs = this._coverCalculationsFromJSON(data.coverCalculations);
    const dialog = new this(attacker, [...calcs.keys()], data.config);
    dialog.#coverCalculations = calcs;       // Reuse the player's result.
    return dialog;
  }

  // ----- NOTE: Dialog ----- //

  async confirmCover({ askGM = false } = {}) {
    if ( askGM && !game.user.isGM ) {
      ui.notifications.info(game.i18n.localize(`${MODULE_ID}.cover-dialog.checking-with-gm`));
      try {
        const res = await SOCKETS.socket.executeAsGM("confirmCoverDialog", this.toJSON());
        if ( res !== null ) return res;
      } catch(err) { console.warn(`${MODULE_ID}|No GM available; confirming locally.`, err); }
    }
    const read = (_event, _button, dialog) => CoverDialog._getDialogCoverSelections(dialog?.element ?? dialog);

    const content = await this._renderContent({ includeAttacker: false, allowSelection: true });

    return foundry.applications.api.DialogV2.wait({
      window: { title: this.windowTitle({ confirm: true }) },
      content,
      rejectClose: false,
      modal: true,
      position: { width: "auto" },
      buttons: [
        { action: "yes", label: `${MODULE_ID}.cover-dialog.yes`, icon: FA_ICONS.COVER_DIALOG.YES, default: true, callback: read },
        { action: "no", label: `${MODULE_ID}.cover-dialog.no`, icon: FA_ICONS.COVER_DIALOG.NO,
          callback: (...args) => Object.fromEntries(Object.keys(read(...args)).map(id => [id, NONE])) },
      ],
    });   // Resolves to the callback's object, or null if closed.
  }

  windowTitle({ confirm = false } = {}) {
    const cfg = this.config?.attacker ?? {};
    const name = cfg.name || this.attacker.name || game.i18n.localize("COMBAT.UnknownCombatant");
    const titleKey = confirm ? "cover-dialog.confirm-cover-from" : "cover-dialog.cover-from";
    return game.i18n.format(`${MODULE_ID}.${titleKey}`, { name });
  }

  static _getDialogCoverSelections(root) {
    const out = {};
    for ( const sel of root.querySelectorAll("select[data-target-id]") ) out[sel.dataset.targetId] = sel.value;
    return out;
  }

  // ----- NOTE: Target Data ----- //

  /**
   * @typedef {Object} TargetData
   * @prop {string} id
   * @prop {string} name
   * @prop {string} image       URL source
   * @prop {UniqueEffectDefinition} definition
   * @prop {number} percentCover
   * @prop {number} distance
   * @prop {boolean} hasOverride
   */

  /**
   * @returns {TargetData[]}
   */
  _targetData() {
    const calc = this.attacker.tokencover?.coverCalculator ?? new CoverCalculator(this.attacker);
    using from = Point3d.tmp;
    using to = Point3d.tmp;
    TokenGeometry.tokenCenter(this.attacker.document, from);
    return [...this.targets].map(target => ({
      id: target.id,
      name: target.name,
      image: target.document.texture.src,
      definition: this.coverCalculations.get(target) ?? null,
      percentCover: calc.effectiveCoverPercent(target),   // Includes region covers, like the definition does
      distance: Point3d.distanceBetween(from, TokenGeometry.tokenCenter(target.document, to)),
      hasOverride: TokenEffects.manual(target).length > 0,
    }));
  }

  /** @type {Map<Token, Set<CoverEffect>>} */
  get coverCalculations() {
    if ( this.#coverCalculations.size === this.targets.size ) return this.#coverCalculations;
    CoverCalculator.coverCalculations(this.attacker, this.targets, this.#coverCalculations, this.config);
    return this.#coverCalculations;
  }

  /**
   * Create an independent copy of the cover calcs map.
   * @returns {Map<Token, Set<CoverEffect>>}
   */
  duplicateCoverCalculations() {
    return new Map(this.coverCalculations); // Definitions are shared singletons.
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
    if ( targets instanceof foundry.canvas.placeables.Token ) targets = [targets];
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
   * Based on settings, present user/GM with the cover calculations.
   * 1. GM confirms / cancels
   * 2. User confirms / cancels
   * 3. User accepts / cancels
   * @returns {Map<Token, definition|null>|false}
   *   False if the user/gm canceled by closing the dialog.
   */
  async workflow() {
    const WF = Settings.KEYS.COVER_WORKFLOW;
    if ( Settings.get(WF.CONFIRM_CHANGE_ONLY)
      && !this._coverDiffersFromCurrent() ) return this.coverCalculations;

    const coverCheckOption = Settings.get(WF.CONFIRM);
    const choices = Settings.ENUMS.CONFIRM_CHOICES;
    let coverCalculationsJSON;
    let askGM = false;
    switch ( coverCheckOption ) {
      case choices.AUTO: return this.coverCalculations;
      case choices.USER_CANCEL: {
        const dialogRes = await this.showCoverResults();
        if ( !dialogRes ) return false;
        return this.coverCalculations;
      }
      case choices.GM: askGM = true; // Fallthrough intended.
      case choices.USER: {
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
   * @param {object} [opts]   Options to pass to renderContent
   * @returns Result from ChatMessage.create.
   */
  async sendCoverCalculationsToChat(opts = {}) {
    opts.includeZeroCover ??= false; // Only display targets that have cover.
    opts.imageWidth ??= 30; // Smaller image for the chat.
    opts.applied ??= true; // Treat as applied instead of "may have".
    opts.displayIgnored ??= false; // Don't describe what cover is ignored by attacker.
    opts.include3dDistance ??= false; // Save space by not including distance.

    if ( !opts.includeZeroCover && !this.targetsWithCover.size ) return;

    const html = await this._renderContent({
      includeAttacker: true,
      confirm: false,
      applied: opts.applied,
      imageWidth: opts.imageWidth,
      include3dDistance: opts.include3dDistance,
      includeZeroCover: opts.includeZeroCover,
      allowSelection: false
    });
    return ChatMessage.create({ content: html });
  }

  /**
   * Display a dialog displaying cover tests to the user.
   * @param {object} opts     Options passed to renderContent.
   */
  async showCoverResults(opts = {}) {
    const html = await this._renderContent({
      includeAttacker: true,
      confirm: false,
      applied: opts.applied ?? false,
      imageWidth: opts.imageWidth ?? 50,
      include3dDistance: opts.include3dDistance ?? true,
      includeZeroCover: opts.includeZeroCover ?? true,
      allowSelection: false
    });
    const content = `\n${html}\n<br>\n<br>\n`;
    const dialogData = {
      window: { title: this.windowTitle({ confirm: false }) },
      content,
      position: { width: "auto" },
      rejectClose: false,
    };
    return foundry.applications.api.DialogV2.prompt(dialogData);
  }

  /**
   * Render template content using cover-dialog.html.
   * @param {object} [opts]
   * @returns {Promise<string>} HTML string
   */
  async _renderContent({
    includeAttacker = false,
    confirm = true,
    applied = false,
    imageWidth = 50,
    include3dDistance = true,
    includeZeroCover = true,
    allowSelection = false,
    excludedColumns = NULL_SET
  } = {}) {
    const targetData = this._targetData();
    const show = column => !excludedColumns.has(column);

    const filteredTargets = targetData.filter(td => includeZeroCover || td.definition);
    const nCover = targetData.filter(td => td.definition).length;

    const overridden = [];
    const targetRows = filteredTargets.map(td => {
      if ( td.hasOverride ) overridden.push(td.name);
      return {
        id: td.id,
        name: td.name,
        image: td.image,
        definition: td.definition,
        coverName: coverName(td.definition),
        percentCoverRounded: Math.round(td.percentCover * 100),
        distanceFormatted: Math.round(pixelsToGridUnits(td.distance)),
        hasOverride: td.hasOverride
      };
    });

    let attackerData = null;
    let targetSummary = "";
    let actionDescription = "";
    let ignoresCoverHtml = "";

    if ( includeAttacker ) {
      const cfg = this.config?.attacker ?? {};
      const img = cfg.img || this.attacker.document?.texture?.src || CONFIG.controlIcons.combat;
      const name = cfg.name || this.attacker.name || game.i18n.localize("COMBAT.UnknownCombatant");
      attackerData = { name, img, imageWidth: Number(imageWidth) };

      actionDescription = this.config.actionType ? `${CoverCalculator.attackNameForType(this.config.actionType)}.` : "";
      ignoresCoverHtml = this._htmlIgnoresCover(this.config.actionType);

      const coverSummaryKey = confirm ? "cover-dialog.confirm-cover-for"
        : applied ? "cover-dialog.have-cover-from" : "cover-dialog.may-have-cover-from";
      targetSummary = getPluralizedString(`${MODULE_ID}.${coverSummaryKey}`, nCover, { name });
    }

    const context = {
      tableId: this.attacker.id,
      showIcon: show("icon"),
      showName: show("name"),
      showCover: show("cover"),
      showPercent: show("percentCover"),
      showDistance: show("distance"),
      imageWidth: Number(imageWidth),
      allowSelection,
      targetRows,
      coverDefs: coverDefinitions(),
      overriddenNames: overridden.join(", "),
      gridUnits: canvas.scene.grid.units,
      includeAttacker,
      attackerData,
      targetSummary,
      actionDescription,
      ignoresCoverHtml
    };

    return renderTemplate(TEMPLATES.COVER_DIALOG, context);
  }

  /**
   * Create html that describes how the attacker ignores cover.
   * @param {string|undefined} actionType   "msak"|"mwak"|"rsak"|"rwak". Used to check if attacker ignores cover
   */
  _htmlIgnoresCover(actionType) {
    const ic = this.attacker.tokencover?.ignoresCover;
    if ( !ic ) return "";
    const lines = [];
    const all = Number(ic.all) || 0;
    const byType = actionType && actionType !== "all" ? Number(ic[actionType]) || 0 : 0;
    if ( all > 0 ) lines.push(`≤ ${all} (${game.i18n.localize(CoverCalculator.attackNameForType("all"))})`);
    if ( byType > 0 ) lines.push(`≤ ${byType} (${game.i18n.localize(CoverCalculator.attackNameForType(actionType))})`);
    return lines.length
      ? `<br><em>${game.i18n.localize(`${MODULE_ID}.cover-dialog.ignores`)}<br>${lines.join("<br>")}</em>`
      : "";
  }

  /**
   * Construct an html table describing cover for various target(s) versus token(s).
   * @param {Token} token       Token to measure cover from.
   * @param {Token[]} targets   Target tokens that may have cover from one or more tokens.
   * @param {object} [options]  Options that affect the html creation
   * @returns {Promise<string>} String of html content that can be used in a Dialog or ChatMessage.
   */
  static async htmlCoverTable(token, targets, opts) {
    if ( Settings.get(Settings.KEYS.DEBUG.LOS) ) Draw.clearDrawings();
    const coverDialog = new CoverDialog(token, targets);
    return coverDialog._renderContent({
      includeAttacker: true,
      confirm: false,
      applied: opts?.applied ?? false,
      imageWidth: opts?.imageWidth ?? 50,
      include3dDistance: opts?.include3dDistance ?? true,
      includeZeroCover: opts?.includeZeroCover ?? true,
      allowSelection: false
    });
  }

  /**
   * Update internal cover calculations and apply the resulting cover effects to target tokens.
   * Respects manual overrides and module use settings.
   * @param {Map<Token, UniqueEffectDefinition|null>|object} coverCalculations
   * @returns {boolean} True if processed successfully.
   */
  async updateTargetsCover(coverCalculations) {
    if ( !coverCalculations ) return false;
    const calcs = coverCalculations instanceof Map
      ? coverCalculations
      : this.constructor._coverCalculationsFromJSON(coverCalculations);

    this.updateCoverCalculations(calcs);

    const { KEYS, ENUMS } = Settings;
    if ( Settings.get(KEYS.COVER_EFFECTS.USE) !== ENUMS.USE_CHOICES.NEVER ) {
      for ( const [defender, def] of this.coverCalculations ) {
        if ( TokenEffects.manual(defender).length ) continue; // Respect manually applied cover.
        defender.tokencover.replaceCover(def ? [def] : []);
      }
    }
    return true;
  }
}

// NOTE: Helper functions

/**
 * Workflow to process cover for given token and targets during attack.
 * Used by midi-qol and dnd5e functions.
 * @param {Token} attacker
 * @param {Set<Token>} targets    Targeted token set. May be modified by user choices.
 * @param {object} [opts]           Options passed to CoverDialog
 * @returns {boolean} True if attack should continue; false otherwise.
 */
export async function coverAttackWorkflow(attacker, targets, opts) {
  const { KEYS, ENUMS } = Settings;
  const coverDialog = new CoverDialog(attacker, targets, opts);
  const coverCalculations = await coverDialog.workflow();
  if ( coverCalculations === false ) return false;  // User canceled

  // Update the targets' cover effects.
  if ( Settings.get(KEYS.COVER_EFFECTS.USE) !== ENUMS.USE_CHOICES.NEVER ) {
    for ( const [defender, def] of coverCalculations ) {
      if ( TokenEffects.manual(defender).length ) continue;       // Respect manually applied cover.
      defender.tokencover.replaceCover(def ? [def] : []);
    }
  }

  // Send to chat.
  if ( Settings.get(KEYS.COVER_WORKFLOW.CHAT) ) {
    await coverDialog.sendCoverCalculationsToChat({ actionType: opts?.actionType, coverCalculations });
  }
  return true;
}