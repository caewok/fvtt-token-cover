/* globals
Hooks,
canvas,
PIXI,
ClockwiseSweepPolygon,
PolygonEdge,
game
*/
"use strict";

Hooks.on("updateToken", updateTokenHook);

/**
 * If the token width/height changes, invalidate the tokenShape.
 */
function updateTokenHook(document, change, options, userId) { // eslint-disable-line no-unused-vars
  if ( Object.hasOwn(change, "width") || Object.hasOwn(change, "height") ) this._tokenShape = undefined;
}

/**
 * Determine the constrained border shape for this token.
 * @type {string} type    light, sight, sound, move
 * @returns {ConstrainedTokenShape|PIXI.Rectangle}
 */
export function getConstrainedTokenBorder() {
  return ConstrainedTokenBorder.get(this, "sight").constrainedShape();
}

/**
 * Determine the correct border shape for this token. Utilize the cached token shape.
 * @returns {PIXI.Polygon|PIXI.Rectangle}
 */
export function getTokenBorder() {
  return this.tokenShape.translate(this.x, this.y);
}

/**
 * Getter to cache the token shape.
 * @type {PIXI.Polygon|PIXI.Rectangle}
 */
export function getTokenShape() {
  return this._tokenShape || (this._tokenShape = calculateTokenShape(this));
}

/**
 * Theoretical token shape at 0,0 origin.
 * @returns {PIXI.Polygon|PIXI.Rectangle}
 */
function calculateTokenShape(token) {
  // TODO: Use RegularPolygon shapes for use with WeilerAtherton
  // Hexagon (for width .5 or 1)
  // Square (for width === height)
  let shape;
  if ( canvas.grid.isHex ) {
    const pts = canvas.grid.grid.getBorderPolygon(token.document.width, token.document.height, 0);
    if ( pts ) shape = new PIXI.Polygon(pts);
  }

  return shape || new PIXI.Rectangle(0, 0, token.w, token.h);
}

// Generate a polygon of the token bounds with portions intersected by walls stripped out.
// Use line-of-sight from the center point to determine the resulting token shape.
export class ConstrainedTokenBorder extends ClockwiseSweepPolygon {
  /**
   * Cache shape by token and type.
   */
  static _cache = {
    light: new WeakMap(),
    sight: new WeakMap(),
    move: new WeakMap(),
    sound: new WeakMap()
  };

  /**
   * Retrieve the constrained token shape for the given wall restriction type.
   * @param {Token} token
   * @param {string} type   Corresponds to wall restriction: sight, sound, light, move
   */
  static get(token, type = "sight") {
    let polygon = this._cache[type].get(token);
    if ( !polygon ) this._cache[type].set(token, polygon = new this(token, type));
    polygon.initialize();
    polygon.compute();

    return polygon;
  }

  /** Indicator of wall changes
   * @type {number}
   */
  static _wallsID = 0;

  /**
   * Properties to test if relevant token characterics have changed.
   * @type {object}
   */
  _tokenDimensions = {
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
    topZ: Number.POSITIVE_INFINITY,
    bottomZ: Number.NEGATIVE_INFINITY,
    width: -1,
    height: -1 };

  /** @type {Token} */
  _token;

  /** @type {number} */
  _wallsID = -1;

  /**
   * If true, no walls constrain token.
   * @type {boolean}
   */
  _unrestricted;

  /** @type {boolean} */
  _dirty = true;

  /** @type {string} */
  _type = "sight";

  constructor(token, type = "sight") {
    super();
    this._token = token;
    this._type = type;
  }

  /** @override */
  initialize() {
    const { x, y, topZ, bottomZ } = this._token;
    const { width, height } = this._token.document;

    const tokenMoved = this._tokenDimensions.x !== x
      || this._tokenDimensions.y !== y
      || this._tokenDimensions.topZ !== topZ
      || this._tokenDimensions.bottomZ !== bottomZ
      || this._tokenDimensions.width !== width
      || this._tokenDimensions.height !== height;

    if ( tokenMoved || this._wallsID !== ConstrainedTokenBorder._wallsID ) {
      this._tokenDimensions.x = x;
      this._tokenDimensions.y = y;
      this._tokenDimensions.topZ = topZ;
      this._tokenDimensions.bottomZ = bottomZ;
      this._tokenDimensions.width = width;
      this._tokenDimensions.height = height;
      this._wallsID = ConstrainedTokenBorder._wallsID;
      this._dirty = true;


      const border = this._token.tokenBorder;
      const config = {
        source: this._token.vision,
        type: this._type,
        boundaryShapes: [border] };

      const center = _token.center;
      super.initialize({ x: center.x, y: center.y }, config);
    }
  }

  /** @override */
  getBounds() {
    return this._token.bounds;
  }

  /** @override */
  compute() {
    if ( this._dirty ) {
      this._dirty = false;
      super.compute();
    }
  }

  /** @override */
  _compute() {
    this.points.length = 0;

    if ( this._identifyEdges() ) {
      this._identifyVertices();
      this._executeSweep();
      this._constrainBoundaryShapes();
      this._unrestricted = false;
    } else {
      this._unrestricted = true;
    }

    this.vertices.clear();
    this.edges.clear();
    this.rays.length = 0;
  }

  /** @override */
  _identifyEdges() {
    const walls = this._getWalls();
    const type = this.config.type;

    for ( const wall of walls ) this.edges.add(PolygonEdge.fromWall(wall, type));

    if ( this.edges.size === 0 ) return false;

    for ( const boundary of canvas.walls.outerBounds ) {
      const edge = PolygonEdge.fromWall(boundary, type);
      edge._isBoundary = true;
      this.edges.add(edge);
    }

    return true;
  }

  /** @override */
  _defineBoundingBox() {
    return this._token.bounds.clone().ceil().pad(1);
  }

  /** @override */
  contains(x, y) {
    const inBounds = this._token.bounds.contains(x, y);
    if ( this._unrestricted || !inBounds ) return inBounds;

    return PIXI.Polygon.prototype.contains.call(this, x, y);
  }

  /**
   * Return either this polygon or the underlying token border if possible.
   * @returns {ConstrainedTokenShape|PIXI.Rectangle}
   */
  constrainedShape() {
    return this._unrestricted ? this._token.tokenBorder : this;
  }
}

Hooks.once("setup", () => {
  if ( game.settings.get("core", "noCanvas") ) return;

  Hooks.on("canvasInit", () => { ConstrainedTokenBorder._wallsID++; });

  Hooks.on("createWall", document => {
    if ( document.rendered ) ConstrainedTokenBorder._wallsID++;
  });

  Hooks.on("updateWall", document => {
    if ( document.rendered ) ConstrainedTokenBorder._wallsID++;
  });

  Hooks.on("deleteWall", document => {
    if ( document.rendered ) ConstrainedTokenBorder._wallsID++;
  });
});
