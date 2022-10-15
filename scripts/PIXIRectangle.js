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

}

/**
 * Calculate area of rectangle
 * @returns {number}
 */
function area() {
  return this.width * this.height;
}
