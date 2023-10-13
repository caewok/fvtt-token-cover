/* globals
foundry,
canvas,
game,
_token
*/

"use strict";

import { SETTINGS, getSetting, setSetting } from "./settings.js";
import { CoverCalculator } from "./CoverCalculator.js";
import { MODULE_ID } from "./const.js";

/*
Rectangle intersection vs just testing all four edges
api = game.modules.get('tokenvisibility').api;
randomRectangle = api.random.randomRectangle;
randomSegment = api.random.randomSegment;
QBenchmarkLoopWithSetupFn = api.bench.QBenchmarkLoopWithSetupFn;

function setupFn() {
  rect = randomRectangle({minWidth: 1000});
  segment = randomSegment();
  return [rect, segment];
}

edges = ["leftEdge",  "topEdge", "rightEdge", "bottomEdge"];
function intersectSides(rect, segment) {
  for (let i = 0; i < 4; i += 1 ) {
    const edge = rect[edges[i]];
    if ( foundry.utils.lineSegmentIntersects(edge.A, edge.B, segment.A, segment.B) ) { return true; }
  }
  return false;
}

intersectRectangle = function(rect, segment) {
  return rect.lineSegmentIntersects(segment.A, segment.B);
}

function testFn() {
  args = setupFn();
  return [...args, intersectSides(...args), intersectRectangle(...args)]
//   return intersectSides(...args) === intersectRectangle(...args)
}
res = Array.fromRange(1000).map(elem => testFn())
res.every(elem => elem)


iterations = 10000
await QBenchmarkLoopWithSetupFn(iterations, setupFn, intersectSides, "intersectSides")
await QBenchmarkLoopWithSetupFn(iterations, setupFn, intersectRectangle, "intersectRectangle")

*/

/**
 * Benchmark token visibility.
 * For each token in the scene:
 * - control the token
 * - test visibility of all other tokens
 */

export async function benchAll(n = 100) {
  await benchCover(n);
}

export async function benchCurrent(n = 100) {
  game.modules.get(MODULE_ID).api.debug = false;

  const controlled = _token;
  if ( !controlled ) {
    console.error("Must select a single token to benchmark range.");
    return;
  }

  const tokens = canvas.tokens.placeables.filter(t => !t.controlled);
  console.log(`Benching current settings for ${tokens.length} tokens.`);
  console.log(`Cover: ${getSetting(SETTINGS.COVER.ALGORITHM)}`);

  await QBenchmarkLoopFn(n, coverTestFn, "Cover", controlled, tokens);
}


export async function benchCover(n = 100) {
  game.modules.get(MODULE_ID).api.debug = false;

  const default_settings = {
    cover_algorithm: getSetting(SETTINGS.COVER.ALGORITHM)
  };

  const controlled = _token;
  if ( !controlled ) {
    console.error("Must select a single token to benchmark cover.");
    return;
  }

  const tokens = canvas.tokens.placeables.filter(t => !t.controlled);
  console.log(`\nBenching token cover for ${tokens.length} tokens.`);

  await setSetting(SETTINGS.COVER.ALGORITHM, SETTINGS.COVER.TYPES.CENTER_CENTER);
  await QBenchmarkLoopFn(n, coverTestFn, "Center-->Center", controlled, tokens);

  await setSetting(SETTINGS.COVER.ALGORITHM, SETTINGS.COVER.TYPES.CENTER_CORNERS_TARGET);
  await QBenchmarkLoopFn(n, coverTestFn, "Center-->Corners Target", controlled, tokens);

  await setSetting(SETTINGS.COVER.ALGORITHM, SETTINGS.COVER.TYPES.CORNER_CORNERS_TARGET);
  await QBenchmarkLoopFn(n, coverTestFn, "Corner-->Corners Target", controlled, tokens);

  await setSetting(SETTINGS.COVER.ALGORITHM, SETTINGS.COVER.TYPES.CENTER_CORNERS_GRID);
  await QBenchmarkLoopFn(n, coverTestFn, "Center-->Select Grid Corners Target", controlled, tokens);

  await setSetting(SETTINGS.COVER.ALGORITHM, SETTINGS.COVER.TYPES.CORNER_CORNERS_GRID);
  await QBenchmarkLoopFn(n, coverTestFn, "Corners-->Select Grid Corners Target (dnd5e)", controlled, tokens);

  await setSetting(SETTINGS.COVER.ALGORITHM, SETTINGS.COVER.TYPES.AREA);
  await QBenchmarkLoopFn(n, coverTestFn, "Center-->Area", controlled, tokens);

  await setSetting(SETTINGS.COVER.ALGORITHM, SETTINGS.COVER.TYPES.AREA3D);
  await QBenchmarkLoopFn(n, coverTestFn, "Center-->Area 3d", controlled, tokens);

  // Reset
  await setSetting(SETTINGS.COVER.ALGORITHM, default_settings.cover_algorithm);
}

function coverTestFn(controlled, targets) {
  const out = [];

  // Avoid caching the constrained token shape
  for ( const token of targets ) token._constrainedTokenShape = undefined;

  for ( const target of targets ) {
    const coverCalc = new CoverCalculator(controlled, target);
    out.push(coverCalc.targetCover());
  }
  return out;
}

/**
 * For a given numeric array, calculate one or more quantiles.
 * @param {Number[]}  arr  Array of numeric values to calculate.
 * @param {Number[]}  q    Array of quantiles, each between 0 and 1.
 * @return {Object} Object with each quantile number as a property.
 *                  E.g., { ".1": 100, ".5": 150, ".9": 190 }
 */
function quantile(arr, q) {
  arr.sort((a, b) => a - b);
  if (!q.length) { return q_sorted(arr, q); }

  const out = {};
  for (let i = 0; i < q.length; i += 1) {
    const q_i = q[i];
    out[q_i] = q_sorted(arr, q_i);
  }

  return out;
}

/**
 * Re-arrange an array based on a given quantile.
 * Used by quantile function to identify locations of elements at specified quantiles.
 * @param {Number[]}  arr  Array of numeric values to calculate.
 * @param {Number}    q    Quantile to locate. E.g., .1, or .5 (median).
 */
function q_sorted(arr, q) {
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) {
    return arr[base] + (rest * (arr[base + 1] - arr[base]));
  }
  return arr[base];
}

/**
 * Round a decimal number to a specified number of digits.
 * @param {Number}  n       Number to round.
 * @param {Number}  digits  Digits to round to.
 */
function precision(n, digits = 2) {
  return Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits);
}

/**
  * Benchmark a method of a class.
  * Includes a 5% warmup (at least 1 iteration) and prints 10%/50%/90% quantiles along
  * with the mean timing.
  * @param {number} iterations    Number of repetitions. Will add an additional 5% warmup.
  * @param {Object} thisArg       Class or other object that contains the method.
  * @param {string} name          Function name to benchmark
  * @param {Object} ...args       Additional arguments to pass to function
  * @return {Number[]}            Array with the time elapsed for each iteration.
  */
export async function QBenchmarkLoop(iterations, thisArg, fn_name, ...args) {
  const name = `${thisArg.name || thisArg.constructor.name}.${fn_name}`;
  const fn = (...args) => thisArg[fn_name](...args);
  return await QBenchmarkLoopFn(iterations, fn, name, ...args);
}

/**
  * Benchmark a function
  * Includes a 5% warmup (at least 1 iteration) and prints 10%/50%/90% quantiles along
  * with the mean timing.
  * @param {number} iterations    Number of repetitions. Will add an additional 5% warmup.
  * @param {Function} fn            Function to benchmark
  * @param {string} name          Description to print to console
  * @param {Object} ...args       Additional arguments to pass to function
  * @return {Number[]}            Array with the time elapsed for each iteration.
  */
export async function QBenchmarkLoopFn(iterations, fn, name, ...args) {
  const timings = [];
  const num_warmups = Math.ceil(iterations * .05);

  for (let i = -num_warmups; i < iterations; i += 1) {
    const t0 = performance.now();
    fn(...args);
    const t1 = performance.now();
    if (i >= 0) { timings.push(t1 - t0); }
  }

  const sum = timings.reduce((prev, curr) => prev + curr);
  const q = quantile(timings, [.1, .5, .9]);

  console.log(`${name} | ${iterations} iterations | ${precision(sum, 4)}ms | ${precision(sum / iterations, 4)}ms per | 10/50/90: ${precision(q[.1], 6)} / ${precision(q[.5], 6)} / ${precision(q[.9], 6)}`);

  return timings;
}

/**
 * Benchmark a function using a setup function called outside the timing loop.
 * The setup function must pass any arguments needed to the function to be timed.
 * @param {number} iterations     Number of repetitions. Will add an additional 5% warmup.
 * @param {Function} setupFn      Function to call prior to each loop of the benchmark.
 * @param {Function} fn             Function to benchmark
 * @param {string} name           Description to print to console
 * @param {Object} ...args        Additional arguments to pass to setup function
 * @return {Number[]}             Array with the time elapsed for each iteration.
 */
export async function QBenchmarkLoopWithSetupFn(iterations, setupFn, fn, name, ...setupArgs) {
  const timings = [];
  const num_warmups = Math.ceil(iterations * .05);

  for (let i = -num_warmups; i < iterations; i += 1) {
    const args = setupFn(...setupArgs);
    const t0 = performance.now();
    fn(...args);
    const t1 = performance.now();
    if (i >= 0) { timings.push(t1 - t0); }
  }

  const sum = timings.reduce((prev, curr) => prev + curr);
  const q = quantile(timings, [.1, .5, .9]);

  console.log(`${name} | ${iterations} iterations | ${precision(sum, 4)}ms | ${precision(sum / iterations, 4)}ms per | 10/50/90: ${precision(q[.1], 6)} / ${precision(q[.5], 6)} / ${precision(q[.9], 6)}`);

  return timings;
}

/**
 * Helper function to run foundry.utils.benchmark a specified number of iterations
 * for a specified function, printing the results along with the specified name.
 * @param {Number}    iterations  Number of iterations to run the benchmark.
 * @param {Function}  fn          Function to test
 * @param ...args                 Arguments passed to fn.
 */
export async function benchmarkLoopFn(iterations, fn, name, ...args) {
  const f = () => fn(...args);
  Object.defineProperty(f, "name", {value: `${name}`, configurable: true});
  await foundry.utils.benchmark(f, iterations, ...args);
}

/**
 * Helper function to run foundry.utils.benchmark a specified number of iterations
 * for a specified function in a class, printing the results along with the specified name.
 * A class object must be passed to call the function and is used as the label.
 * Otherwise, this is identical to benchmarkLoopFn.
 * @param {Number}    iterations  Number of iterations to run the benchmark.
 * @param {Object}    thisArg     Instantiated class object that has the specified fn.
 * @param {Function}  fn          Function to test
 * @param ...args                 Arguments passed to fn.
 */
export async function benchmarkLoop(iterations, thisArg, fn, ...args) {
  const f = () => thisArg[fn](...args);
  Object.defineProperty(f, "name", {value: `${thisArg.name || thisArg.constructor.name}.${fn}`, configurable: true});
  await foundry.utils.benchmark(f, iterations, ...args);
}
