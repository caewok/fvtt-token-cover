/* globals
PIXI
*/
"use strict";

// --------- ADD METHODS TO THE PIXI.RECTANGLE PROTOTYPE ----- //

export function registerPIXIRectangleMethods() {
  /**
   * Measure the area of this rectangle
   * @type {number}
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "area", {
    value: area,
    writable: true,
    configurable: true
  });

  /**
   * Move the rectangle by given x,y delta. Return new rectangle.
   * @param {number} dx
   * @param {number} dy
   * @returns {PIXI.Circle}
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "translate", {
    value: function(dx, dy) {
      return new PIXI.Rectangle(this.x + dx, this.y + dy, this.width, this.height);
    },
    writable: true,
    configurable: true
  });
}

/**
 * Calculate area of rectangle
 * @returns {number}
 */
function area() {
  return this.width * this.height;
}
