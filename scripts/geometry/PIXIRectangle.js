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

  /**
   * Return viewable points of this rectangle as seen from an origin
   */
  Object.defineProperty(PIXI.Rectangle.prototype, "viewablePoints", {
    value: viewablePoints,
    writable: true,
    configurable: true
  });

  if ( !Object.hasOwn(PIXI.Rectangle.prototype, "center") ) {
    Object.defineProperty(PIXI.Rectangle.prototype, "center", {
      get: center,
      enumerable: false
    });
  }
}

/**
 * Calculate area of rectangle
 * @returns {number}
 */
function area() {
  return this.width * this.height;
}

/**
 * Calculate center of the rectangle
 * @returns {number}
 */
function center() {
  return { x: this.x + (this.width * 0.5), y: this.y + (this.height * 0.5) };
}

/**
 * Returns the viewable of the rectangle that make up the viewable perimeter
 * as seen from an origin.
 * @param {Point} origin                  Location of the viewer, in 2d.
 * @param {object} [options]
 * @param {boolean} [options.outermostOnly]   Return only the outermost two points
 * @returns {Point[]|null}
 */
function viewablePoints(origin, { outermostOnly = true } = {}) {
  const zones = PIXI.Rectangle.CS_ZONES;
  const bbox = this;

  const pts = getViewablePoints(this, origin);

  if ( !pts || !outermostOnly ) return pts;

  const ln = pts.length;
  return [pts[0], pts[ln - 1]];
}

// Helper to get all the viewable points
function getViewablePoints(bbox, origin) {
  const zones = PIXI.Rectangle.CS_ZONES;

  let pts;
  switch ( bbox._getZone(origin) ) {
    case zones.INSIDE: return null;
    case zones.TOPLEFT: return [{ x: bbox.left, y: bbox.bottom },  { x: bbox.left, y: bbox.top }, { x: bbox.right, y: bbox.top }];
    case zones.TOPRIGHT: return [{ x: bbox.left, y: bbox.top }, { x: bbox.right, y: bbox.top }, { x: bbox.right, y: bbox.bottom }];
    case zones.BOTTOMLEFT: return [{ x: bbox.right, y: bbox.bottom }, { x: bbox.left, y: bbox.bottom }, { x: bbox.left, y: bbox.top }];
    case zones.BOTTOMRIGHT: return [{ x: bbox.right, y: bbox.top }, { x: bbox.right, y: bbox.bottom }, { x: bbox.left, y: bbox.bottom }];

    case zones.RIGHT: return [{ x: bbox.right, y: bbox.top }, { x: bbox.right, y: bbox.bottom }];
    case zones.LEFT: return [{ x: bbox.left, y: bbox.bottom }, { x: bbox.left, y: bbox.top }];
    case zones.TOP: return [{ x: bbox.left, y: bbox.top }, { x: bbox.right, y: bbox.top }];
    case zones.BOTTOM: return [{ x: bbox.right, y: bbox.bottom }, { x: bbox.left, y: bbox.bottom }];
  }

  return undefined; // Should not happen
}
