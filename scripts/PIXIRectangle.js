/* globals
foundry,
PIXI
*/

/**
 * Get the given edge of a rectangle.
 * Edge endpoints are clockwise around the rectangle.
 */
function leftEdge() { return { A: { x: this.left, y: this.bottom }, B: { x: this.left, y: this.top }}; }
function rightEdge() { return { A: { x: this.right, y: this.top }, B: { x: this.right, y: this.bottom }}; }
function topEdge() { return { A: { x: this.left, y: this.top }, B: { x: this.right, y: this.top }}; }
function bottomEdge() { return { A: { x: this.right, y: this.bottom }, B: { x: this.left, y: this.bottom }}; }

/**
 * Use the Cohen-Sutherland algorithm approach to split a rectangle into zones:
 *          left    central   right
 * top      1001    1000      1010
 * central  0001    0000      0010
 * bottom   0101    0100      0110
 * https://en.wikipedia.org/wiki/Cohen%E2%80%93Sutherland_algorithm
 */
const rectZones = {
  INSIDE: 0x0000,
  LEFT: 0x0001,
  RIGHT: 0x0010,
  TOP: 0x1000,
  BOTTOM: 0x0100,
  TOPLEFT: 0x1001,
  TOPRIGHT: 0x1010,
  BOTTOMRIGHT: 0x0110,
  BOTTOMLEFT: 0x0101
};

/**
 * Get the rectZone for a given x,y point located around or in a rectangle.
 *
 * @param {Point} p
 * @return {Integer}
 */
function _zone(p) {
  let code = rectZones.INSIDE;
  if ( p.x < this.x ) {
    code |= rectZones.LEFT;
  } else if ( p.x > this.right ) {
    code |= rectZones.RIGHT;
  }

  if ( p.y < this.y ) {
    code |= rectZones.TOP;
  } else if ( p.y > this.bottom ) {
    code |= rectZones.BOTTOM;
  }
  return code;
}

/**
 * Test whether a line intersects this rectangle.
 * @param {Point} a
 * @param {Point} b
 * @param {Object} options
 * @param {boolean} options.inside    If true, a line contained within the rectangle will
 *                                    return true.
 * @param {Function} intersectFn      Function to use when testing intersections.
 * @return {boolean} True if intersects.
 */
function lineSegmentIntersects(a, b,
  { inside = false, intersectFn = foundry.utils.lineSegmentIntersects } = {}) {
  const zoneA = this._zone(a);
  const zoneB = this._zone(b);

  if ( !(zoneA | zoneB) ) { return inside; } // Bitwise OR is 0: both points inside rectangle.
  if ( zoneA & zoneB ) { return false; } // Bitwise AND is not 0: both points share outside zone
  if ( !(zoneA && zoneB) ) { return true; } // Reguler AND: one point inside, one outside

  // Line likely intersects, but some possibility that the line starts at, say, center left
  // and moves to center top which means it may or may not cross the rectangle
  switch ( zoneA ) {
    case rectZones.LEFT: return intersectFn(this.edge.left.A, this.edge.left.B, a, b);
    case rectZones.RIGHT: return intersectFn(this.edge.right.A, this.edge.right.B, a, b);
    case rectZones.TOP: return intersectFn(this.edge.top.A, this.edge.top.B, a, b);
    case rectZones.BOTTOM: return intersectFn(this.edge.bottom.A, this.edge.bottom.B, a, b);

    case rectZones.TOPLEFT: return intersectFn(this.edge.top.A, this.edge.top.B, a, b)
      || intersectFn(this.edge.left.A, this.edge.left.B, a, b);
    case rectZones.TOPRIGHT: return intersectFn(this.edge.top.A, this.edge.top.B, a, b)
      || intersectFn(this.edge.right.A, this.edge.right.B, a, b);
    case rectZones.BOTTOMLEFT: return intersectFn(this.edge.bottom.A, this.edge.bottom.B, a, b)
      || intersectFn(this.edge.left.A, this.edge.left.B, a, b);
    case rectZones.BOTTOMRIGHT: return intersectFn(this.edge.bottom.A, this.edge.bottom.B, a, b)
      || intersectFn(this.edge.right.A, this.edge.right.B, a, b);
  }
}

// ----------------  ADD METHODS TO THE PIXI.RECTANGLE PROTOTYPE ------------------------
export function registerPIXIRectangleMethods() {

  if ( !Object.hasOwn(PIXI.Rectangle.prototype, "_zones") ) {
    Object.defineProperty(PIXI.Rectangle.prototype, "_zones", {
      get: () => rectZones
    });
  }

  if ( !Object.hasOwn(PIXI.Rectangle.prototype, "leftEdge") ) {
    Object.defineProperty(PIXI.Rectangle.prototype, "leftEdge", {
      get: () => leftEdge
    });
  }

  if ( !Object.hasOwn(PIXI.Rectangle.prototype, "rightEdge") ) {
    Object.defineProperty(PIXI.Rectangle.prototype, "rightEdge", {
      get: () => rightEdge
    });
  }

  if ( !Object.hasOwn(PIXI.Rectangle.prototype, "topEdge") ) {
    Object.defineProperty(PIXI.Rectangle.prototype, "topEdge", {
      get: () => topEdge
    });
  }

  if ( !Object.hasOwn(PIXI.Rectangle.prototype, "bottomEdge") ) {
    Object.defineProperty(PIXI.Rectangle.prototype, "bottomEdge", {
      get: () => bottomEdge
    });
  }

  Object.defineProperty(PIXI.Rectangle.prototype, "lineSegmentIntersects", {
    value: lineSegmentIntersects,
    writable: true,
    configurable: true
  });

  Object.defineProperty(PIXI.Rectangle.prototype, "_zone", {
    value: _zone,
    writable: true,
    configurable: true
  });
}
