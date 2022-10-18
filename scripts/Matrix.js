/* globals
*/
"use strict";

import { Point3d } from "./Point3d.js";

// Basic matrix operations
// May eventually replace with math.js (when installed, call "math" to get functions)

export class Matrix {
  constructor(arr) {
    this.arr = arr;
  }

  /**
   * First dimension length of the array
   * @type {number}
   */
  get dim1() {
    return this.arr.length;
  }

  /**
   * Second dimension length of the array
   * @type {number}
   */
  get dim2() {
    return this.arr[0].length;
  }

  /**
   * Confirm that length of each sub-array is equal.
   * @param {Array[]} arr   Array of arrays.
   * @returns {boolean}
   */
  static verify(arr) {
    if ( !(arr instanceof Array) || arr.length === 0 ) return false;

    const innerLength = arr[0].length;
    return arr.every(elem => elem instanceof Array && elem.length === innerLength);
  }

  /**
   * Create matrix of given dimensions from a flat array.
   * Flat array arranged reading across. So (row0,col0), (row0,col1), ... (row1,col0), (row1,col1)
   * @param {number[]} arr    Flat array of numbers.
   * @param {number} rows
   * @param {number} cols
   * @return {Matrix}
   */
  static fromFlatArray(arr, rows, cols) {
    const ln = arr.length;
    if ( rows * cols !== ln ) {
      console.error("Rows or columns incorrectly specified.");
      return undefined;
    }

    const out = new Array(rows);
    for ( let r = 0; r < rows; r += 1 ) {
      const arrR = new Array(cols);
      out[r] = arrR;
      const i = r * cols;
      for ( let c = 0; c < cols; c += 1 ) {
        arrR[c] = arr[i + c];
      }
    }
    return new Matrix(out);
  }

  static empty(rows, cols) {
    return Matrix.fromFlatArray(new Array(rows * cols), rows, cols);
  }

  static zeroes(rows, cols) {
    return Matrix.fromFlatArray(new Array(rows * cols).fill(0), rows, cols);
  }

  static identity(rows, cols) {
    const arr = Matrix.zeroes();
    const iMax = Math.min(rows, cols);
    for ( let i = 0; i < iMax; i += 1 ) {
      arr[[i][i]] = 1;
    }
    return arr;
  }

  static fromPoint3d(p, { homogenous = true } = {}) {
    const arr = [p.x, p.y, p.z];
    if ( homogenous ) arr.push(1);
    return Matrix.fromFlatArray(arr, 1, homogenous ? 4 : 3);
  }

  static fromPoint2d(p, { homogenous = true } = {}) {
    const arr = [p.x, p.y];
    if ( homogenous ) arr.push(1);
    return Matrix.fromFlatArray(arr, 1, homogenous ? 3 : 2);
  }

  /**
   * Rotation matrix for a given angle, rotating around X axis.
   * @param {number} angle
   * @returns {Matrix}
   */
  static rotationX(angle) {
    let c = Math.cos(angle);
    let s = Math.sin(angle);

    // Math.cos(Math.PI / 2) ~ 0 but not quite.
    // Same for Math.sin(Math.PI).
    if ( c.almostEqual(0) ) c = 0;
    if ( s.almostEqual(0) ) s = 0;

    const rotX = [
      [1, 0, 0, 0],
      [0, c, s, 0],
      [0, -s, c, 0],
      [0, 0, 0, 1]
    ];

    return new Matrix(rotX);
  }

  /**
   * Rotation matrix for a given angle, rotating around Y axis.
   * @param {number} angle
   * @returns {Matrix}
   */
  static rotationY(angle) {
    let c = Math.cos(angle);
    let s = Math.sin(angle);

    // Math.cos(Math.PI / 2) ~ 0 but not quite.
    // Same for Math.sin(Math.PI).
    if ( c.almostEqual(0) ) c = 0;
    if ( s.almostEqual(0) ) s = 0;

    const rotY = [
      [c, 0, s, 0],
      [0, 1, 0, 0],
      [-s, 0, c, 0],
      [0, 0, 0, 1]
    ];

    return new Matrix(rotY);
  }

  /**
   * Rotation matrix for a given angle, rotating around Z axis.
   * @param {number} angle
   * @returns {Matrix}
   */
  static rotationZ(angle) {
    let c = Math.cos(angle);
    let s = Math.sin(angle);

    // Math.cos(Math.PI / 2) ~ 0 but not quite.
    // Same for Math.sin(Math.PI).
    if ( c.almostEqual(0) ) c = 0;
    if ( s.almostEqual(0) ) s = 0;

    const rotZ = [
      [c, s, 0, 0],
      [-s, c, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1]
    ];

    return new Matrix(rotZ);
  }

  static rotationXYZ(angleX, angleY, angleZ) {
    let rot = angleX ? Matrix.rotationX(angleX) : angleY
      ? Matrix.rotationY(angleY) : angleZ
        ? Matrix.rotationZ(angleZ) : Matrix.identity(4, 4);

    if ( angleX && angleY ) {
      const rotY = Matrix.rotationY(angleY);
      rot = rot.multiply(rotY);
    }

    if ( (angleX || angleY) && angleZ ) {
      const rotZ = Matrix.rotationZ(angleZ);
      rot = rot.multiply(rotZ);
    }

    return rot;
  }

  static translation(x = 0, y = 0, z = 0) {
    const t = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [x, y, z, 1]
    ];
    return new Matrix(t);
  }

  /**
   * Test if this matrix is exactly equal to another
   * @param {Matrix} other
   * @returns {boolean}
   */
  equal(other) {
    const d1 = this.dim1;
    const d2 = this.dim2;
    if ( d1 !== other.dim1 || d2 !== other.dim2 ) return false;

    for ( let i = 0; i < d1; i += 1 ) {
      for ( let j = 0; j < d2; j += 1 ) {
        if ( this.arr[i][j] !== other.arr[i][j] ) return false;
      }
    }

    return true;
  }

  /**
   * Test if this matrix is almost equal to another
   * @param {Matrix} other
   * @param {number} epsilon
   * @returns {boolean}
   */
  almostEqual(other, epsilon = 1e-8) {
    const d1 = this.dim1;
    const d2 = this.dim2
    if ( d1 !== other.dim1 || d2 !== other.dim2 ) return false;

    for ( let i = 0; i < d1; i += 1 ) {
      for ( let j = 0; j < d2; j += 1 ) {
        if ( !this.arr[i][j].almostEqual(other.arr[i][j], epsilon) ) return false;
      }
    }

    return true;
  }


  /**
   * Convert to 3d point
   * If 1 x 4 or 4 x 1, take the fourth element to be the homogenous coord; divide
   * @returns {Point3d}
   */
  toPoint3d() {
    const d1 = this.dim1;
    const d2 = this.dim2;

    if ( d1 === 1 && d2 === 3 ) {
      return new Point3d(this.arr[0][0], this.arr[0][1], this.arr[0][2]);
    } else if ( d1 === 1 && d2 === 4 ) {
      const div = this.arr[0][3];
      return new Point3d(this.arr[0][0] / div, this.arr[0][1] / div, this.arr[0][2] / div);
    } else if ( d1 === 3 && d2 === 1 ) {
      return new Point3d(this.arr[0][0], this.arr[1][0], this.arr[2][0]);
    } else if ( d1 === 4 && d2 === 1 ) {
      const div = this.arr[3][0];
      return new Point3d(this.arr[0][0] / div, this.arr[1][0] / div, this.arr[2][0] / div);
    }

    console.error("Cannot conver matrix to 3dPoint.");
    return undefined;
  }

  /**
   * Convert to 2d point
   * If 1 x 3 or 3 x 1, take the third element to be the homogenous coord; divide
   * @returns {PIXI.Point}
   */
  toPoint2d() {
    const d1 = this.dim1;
    const d2 = this.dim2;

    if ( d1 === 1 && d2 === 2 ) {
      return new Point3d(this.arr[0][0], this.arr[0][1]);
    } else if ( d1 === 1 && d2 === 3 ) {
      const div = this.arr[0][2];
      return new Point3d(this.arr[0][0] / div, this.arr[0][1] / div);
    } else if ( d1 === 2 && d2 === 1 ) {
      return new Point3d(this.arr[0][0], this.arr[1][0]);
    } else if ( d1 === 3 && d2 === 1 ) {
      const div = this.arr[2][0];
      return new Point3d(this.arr[0][0] / div, this.arr[1][0] / div);
    }

    console.error("Cannot conver matrix to 2d point.");
    return undefined;
  }

  add(other, outMatrix = Matrix.empty(other.dim1, other.dim2)) {
    const d1 = this.dim1;
    const d2 = this.dim2;

    if ( d1 !== other.dim1 || d2 !== other.dim2 ) {
      console.error("Matrices cannot be added.");
      return undefined;
    }

    for ( let i = 0; i < d1; i += 1 ) {
      for ( let j = 0; j < d2; j += 1 ) {
        outMatrix.arr[i][j] = this.arr[i][j] + other.arr[i][j];
      }
    }
    return outMatrix;
  }

  subtract(other, outMatrix = Matrix.empty(other.dim1, other.dim2)) {
    const d1 = this.dim1;
    const d2 = this.dim2;

    if ( d1 !== other.dim1 || d2 !== other.dim2 ) {
      console.error("Matrices cannot be added.");
      return undefined;
    }

    for ( let i = 0; i < d1; i += 1 ) {
      for ( let j = 0; j < d2; j += 1 ) {
        outMatrix.arr[i][j] = this.arr[i][j] - other.arr[i][j];
      }
    }
    return outMatrix;
  }

  /**
   * Multiply this and another matrix. this • other.
   * @param {Matrix} other
   * @returns {Matrix}
   */
  multiply(other) {
    // A is this matrix; B is other matrix
    const rowsA = this.dim1;
    const colsA = this.dim2;
    const rowsB = other.dim1;
    const colsB = other.dim2;

    if ( colsA !== rowsB ) {
      console.error("Matrices cannot be multiplied.");
      return undefined;
    }

    const multiplication = Matrix.zeroes(rowsA, colsB);
    for ( let x = 0; x < rowsA; x += 1 ) {
      for ( let y = 0; y < colsB; y += 1 ) {
        for ( let z = 0; z < colsA; z += 1 ) {
          multiplication.arr[x][y] = multiplication.arr[x][y] + (this.arr[x][z] * other.arr[z][y]);
        }
      }
    }
    return multiplication;
  }

  /**
   * Faster 2x2 multiplication
   * Strassen's algorithm
   * JSBench.me: ~ 30% slower to multiply, versus this multiply2x2
   * https://jsbench.me/qql9d8m0eg/1
   * @param {Matrix} other
   * @returns {Matrix}
   */
  multiply2x2(other, outMatrix = Matrix.empty(2, 2)) {
    const a1 = this.arr[0][0];
    const a2 = this.arr[0][1];
    const a3 = this.arr[1][0];
    const a4 = this.arr[1][1];

    const b1 = other.arr[0][0];
    const b2 = other.arr[0][1];
    const b3 = other.arr[1][0];
    const b4 = other.arr[1][1];

    const m1 = (a1 + a4) * (b1 + b4);
    const m2 = (a3 + a4) * b1;
    const m3 = a1 * (b2 - b4);
    const m4 = a4 * (b3 - b1);
    const m5 = (a1 + a2) * b4;
    const m6 = (a3 - a1) * (b1 + b2);
    const m7 = (a2 - a4) * (b3 + b4);

    outMatrix.arr[0][0] = m1 + m4 - m5 + m7;
    outMatrix.arr[0][1] = m3 + m5;
    outMatrix.arr[1][0] = m2 + m4;
    outMatrix.arr[1][1] = m1 - m2 + m3 + m6;

    return outMatrix;
  }

  /**
   * Faster 3x3 multiplication
   * Laderman's.
   * https://www.ams.org/journals/bull/1976-82-01/S0002-9904-1976-13988-2/S0002-9904-1976-13988-2.pdf
   * JSBench suggests 50% to use normal multiply
   * https://jsbench.me/c8l9d973rm/1
   * @param {Matrix} other
   * @returns {Matrix}
   */
  multiply3x3(other, outMatrix = Matrix.empty(3, 3)) {
    const a00 = this.arr[0][0];
    const a01 = this.arr[0][1];
    const a02 = this.arr[0][2];
    const a10 = this.arr[1][0];
    const a11 = this.arr[1][1];
    const a12 = this.arr[1][2];
    const a20 = this.arr[2][0];
    const a21 = this.arr[2][1];
    const a22 = this.arr[2][2];

    const b00 = other.arr[0][0];
    const b01 = other.arr[0][1];
    const b02 = other.arr[0][2];
    const b10 = other.arr[1][0];
    const b11 = other.arr[1][1];
    const b12 = other.arr[1][2];
    const b20 = other.arr[2][0];
    const b21 = other.arr[2][1];
    const b22 = other.arr[2][2];

    const m1 = (a00 + a01 + a02 - a10 - a11 - a21 - a22) * b11;
    const m2 = (a00 - a10) * (b11 - b01);
    const m3 = a11 * (b01 - b00 + b10 - b11 - b12 - b20 + b22);
    const m4 = (a10 - a00 + a11) * (b00 - b01 + b11);
    const m5 = (a10 + a11) * (b01 - b00);
    const m6 = a00 * b00;
    const m7 = (a20 - a00 + a21) * (b00 - b02 + b12);
    const m8 = (a20 - a00) * (b02 - b12);
    const m9 = (a20 + a21) * (b02 - b00);
    const m10 = (a00 + a01 + a02 - a11 - a12 - a20 - a21) * b12;
    const m11 = a21 * (b02 - b00 + b10 - b11 - b12 - b20 + b21);
    const m12 = ( a21 - a02 + a22) * (b11 + b20 - b21);
    const m13 = (a02 - a22) * (b11 - b21);
    const m14 = a02 * b20;
    const m15 = (a21 + a22) * (b21 - b20);
    const m16 = (a11 - a02 + a12) * (b12 + b20 - b22);
    const m17 = (a02 - a12) * (b12 - b22);
    const m18 = (a11 + a12) * (b22 - b20);
    const m19 = a01 * b10;
    const m20 = a12 * b21;
    const m21 = a10 * b02;
    const m22 = a20 * b01;
    const m23 = a22 * b22;

    outMatrix.arr[0][0] = m6 + m14 + m19;
    outMatrix.arr[0][1] = m1 + m4 + m5 + m6 + m12 + m14 + m15;
    outMatrix.arr[0][2] = m6 + m7 + m9 + m10 + m14 + m16 + m18;

    outMatrix.arr[1][0] = m2 + m3 + m4 + m6 + m14 + m16 + m17;
    outMatrix.arr[1][1] = m2 + m4 + m5 + m6 + m20;
    outMatrix.arr[1][2] = m14 + m16 + m17 + m18 + m21;

    outMatrix.arr[2][0] = m6 + m7 + m8 + m11 + m12 + m13 + m14;
    outMatrix.arr[2][1] = m12 + m13 + m14 + m15 + m22;
    outMatrix.arr[2][2] = m6 + m7 + m8 + m9 + m23;

    return outMatrix;
  }

 multiply4x4StrassenInline(other, outMatrix = Matrix.empty(4, 4)) {
    const a00 = this.arr[0][0];
    const a01 = this.arr[0][1];
    const a02 = this.arr[0][2];
    const a03 = this.arr[0][3];
    const a10 = this.arr[1][0];
    const a11 = this.arr[1][1];
    const a12 = this.arr[1][2];
    const a13 = this.arr[1][3];
    const a20 = this.arr[2][0];
    const a21 = this.arr[2][1];
    const a22 = this.arr[2][2];
    const a23 = this.arr[2][3];
    const a30 = this.arr[3][0];
    const a31 = this.arr[3][1];
    const a32 = this.arr[3][2];
    const a33 = this.arr[3][3];

    const b00 = other.arr[0][0];
    const b01 = other.arr[0][1];
    const b02 = other.arr[0][2];
    const b03 = other.arr[0][3];
    const b10 = other.arr[1][0];
    const b11 = other.arr[1][1];
    const b12 = other.arr[1][2];
    const b13 = other.arr[1][3];
    const b20 = other.arr[2][0];
    const b21 = other.arr[2][1];
    const b22 = other.arr[2][2];
    const b23 = other.arr[2][3];
    const b30 = other.arr[3][0];
    const b31 = other.arr[3][1];
    const b32 = other.arr[3][2];
    const b33 = other.arr[3][3];




 }


 /**
  * https://medium.com/@ananyasingh1618/strassens-multiplication-matrix-62bbb10225e6
  * About 75% slower than loop with multiple even if you remove the checks for add and subtract
  */


  /**
   * Faster 4x4 multiplication
   * https://jsbench.me/bpl9dgtem6/1
   * regular looped multiply is 60% slower.
   * FYI, this could be faster but appears to be modular arithmetic:
   * https://www.nature.com/articles/s41586-022-05172-4.pdf
   * @param {Matrix} other
   * @returns {Matrix}
   */
  multiply4x4(other, outMatrix = Matrix.empty(4, 4)) {
    const a00 = this.arr[0][0];
    const a01 = this.arr[0][1];
    const a02 = this.arr[0][2];
    const a03 = this.arr[0][3];
    const a10 = this.arr[1][0];
    const a11 = this.arr[1][1];
    const a12 = this.arr[1][2];
    const a13 = this.arr[1][3];
    const a20 = this.arr[2][0];
    const a21 = this.arr[2][1];
    const a22 = this.arr[2][2];
    const a23 = this.arr[2][3];
    const a30 = this.arr[3][0];
    const a31 = this.arr[3][1];
    const a32 = this.arr[3][2];
    const a33 = this.arr[3][3];

    const b00 = other.arr[0][0];
    const b01 = other.arr[0][1];
    const b02 = other.arr[0][2];
    const b03 = other.arr[0][3];
    const b10 = other.arr[1][0];
    const b11 = other.arr[1][1];
    const b12 = other.arr[1][2];
    const b13 = other.arr[1][3];
    const b20 = other.arr[2][0];
    const b21 = other.arr[2][1];
    const b22 = other.arr[2][2];
    const b23 = other.arr[2][3];
    const b30 = other.arr[3][0];
    const b31 = other.arr[3][1];
    const b32 = other.arr[3][2];
    const b33 = other.arr[3][3];

    outMatrix.arr[0][0] = a00 * b00 + a01 * b10 + a02 * b20 + a03 * b30;
    outMatrix.arr[0][1] = a00 * b01 + a01 * b11 + a02 * b21 + a03 * b31;
    outMatrix.arr[0][2] = a00 * b02 + a01 * b12 + a02 * b22 + a03 * b32;
    outMatrix.arr[0][3] = a00 * b03 + a01 * b13 + a02 * b23 + a03 * b33;

    outMatrix.arr[1][0] = a10 * b00 + a11 * b10 + a12 * b20 + a13 * b30;
    outMatrix.arr[1][1] = a10 * b01 + a11 * b11 + a12 * b21 + a13 * b31;
    outMatrix.arr[1][2] = a10 * b02 + a11 * b12 + a12 * b22 + a13 * b32;
    outMatrix.arr[1][3] = a10 * b03 + a11 * b13 + a12 * b23 + a13 * b33;

    outMatrix.arr[2][0] = a20 * b00 + a21 * b10 + a22 * b20 + a23 * b30;
    outMatrix.arr[2][1] = a20 * b01 + a21 * b11 + a22 * b21 + a23 * b31;
    outMatrix.arr[2][2] = a20 * b02 + a21 * b12 + a22 * b22 + a23 * b32;
    outMatrix.arr[2][3] = a20 * b03 + a21 * b13 + a22 * b23 + a23 * b33;

    outMatrix.arr[3][0] = a30 * b00 + a31 * b10 + a32 * b20 + a33 * b30;
    outMatrix.arr[3][1] = a30 * b01 + a31 * b11 + a32 * b21 + a33 * b31;
    outMatrix.arr[3][2] = a30 * b02 + a31 * b12 + a32 * b22 + a33 * b32;
    outMatrix.arr[3][3] = a30 * b03 + a31 * b13 + a32 * b23 + a33 * b33;

    return outMatrix;
  }
}


