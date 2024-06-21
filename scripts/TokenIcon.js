/* globals
canvas,
foundry,
loadTexture,
PIXI
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */

import { log } from "./util.js";

/**
 * Draw a token icon locally on this token.
 * Accessed via token[MODULE_ID]
 */
export function TokenIconMixin(Base) {
  return class TokenIcon extends Base {
    /** @type {Token} */
    // token; // Handled by base

    /** @type {Map<string, TokenIcon>} */
    iconMap = new Map();

    /** @type {PIXI.Sprite[]} */
    icons = new WeakSet();

    /**
     * Add a token icon to this token. Will remove any icon sharing the same category.
     * Does not refresh the token display. Call token.renderFlags.set( drawEffects: true ) or drawIcons.
     * @param {TokenIcon} tokenIcon         An object representing the token icon to add
     * @param {boolean} [clearAll=false]    If true, clear all existing icons.
     */
    addIcon(tokenIcon, clearAll = false) {
      log(`TokenIcon#addIcon|Adding ${tokenIcon.id} to ${this.token.name}`);
      tokenIcon.id ??= foundry.utils.randomID();
      tokenIcon.category ??= tokenIcon.icon;
      if ( clearAll ) this.iconMap.clear();
      this.iconMap.set(tokenIcon.category, tokenIcon);
    }

    /**
     * Remove a token icon from this token's map. Does not refresh the token display.
     *  Call token.renderFlags.set( drawEffects: true ).
     * @param {TokenIcon} tokenIcon         An object representing the token icon to remove
     */
    removeIcon(tokenIcon) {
      log(`TokenIcon#removeIcon|Removing ${tokenIcon.id} from ${this.token.name}`);
      this.iconMap.delete(tokenIcon.category);
    }

    /**
     * Draw the token's icons on the token.
     */
    async drawIcons() {
      log(`TokenIcon#drawIcons|${this.token.name}`);
      const token = this.token;
      token.effects.renderable = false;

      // Remove the old icons from the token's effects.
      const numEffects = token.effects.children.length;
      const removeIndices = [];
      for ( let i = 0; i < numEffects; i += 1 ) {
        const effect = token.effects.children[i];
        if ( !this.icons.has(effect) ) continue;
        removeIndices.push(i);
        this.icons.delete(effect);
      }

      // Reverse so the index is not affected by the removal.
      removeIndices.reverse().forEach(i => token.effects.removeChildAt(i)?.destroy())

      // Draw each icon.
      const promises = [];
      for ( let tokenIcon of this.iconMap.values() ) promises.push(this._drawIcon(tokenIcon.src, tokenIcon.tint));
      await Promise.allSettled(promises);
      token.effects.renderable = true;
      this._refreshIcons();
    }

    /**
     * Draw a single icon on the token.
     * @param {string} src
     * @param {number|null} tint
     * @returns {Promise<PIXI.Sprite|undefined>}
     */
    async _drawIcon(src, tint) {
      if ( !src ) return;
      const tex = await loadTexture(src, { fallback: "icons/svg/hazard.svg"} );
      const icon = new PIXI.Sprite(tex);
      if ( tint ) icon.tint = Number(tint);
      this.token.effects.addChild(icon);
      this.icons.add(icon);
    }

    /**
     * Refresh the display of icons, adjusting their position for token width and height.
     */
    _refreshIcons() {
      log(`TokenIcon#_refreshIcons|${this.token.name}`);
      const token = this.token;

      // See Token#_refreshEffects.
      let i = 0;
      const iconsToRefresh = [];
      for ( const effect of token.effects.children ) {
        if ( effect === token.effects.bg ) continue;
        if ( effect === token.effects.overlay ) continue;
        if ( this.icons.has(effect) ) iconsToRefresh.push(effect);
        else i += 1; // Determine how many non-icon effects are already drawn.
      }

      // Reorder on grid like with _refreshEffects.
      const size = Math.round(canvas.dimensions.size / 10) * 2;
      const rows = Math.floor(token.document.height * 5);
      for ( const icon of iconsToRefresh ) {
        icon.width = icon.height = size;
        icon.x = Math.floor(i / rows) * size;
        icon.y = (i % rows) * size;
        token.effects.bg.drawRoundedRect(icon.x + 1, icon.y + 1, size - 2, size - 2, 2);
        i += 1;
      }
    }
  };
}