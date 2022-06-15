/* globals
*/
"use strict";

// Functions related to creating random shapes, for testing and benchmarking

export function randomUniform(min = 0, max = 1) {
  let num = Math.random();
  num *= max - min; // Stretch to fill range
  num += min; // Offset to min
  return num;
}

