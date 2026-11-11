/* globals
foundry
*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { TokenEffects } from "./TokenEffects.js";

export const PATCHES = {};
PATCHES.BASIC = {};

const strip = list => list?.filter(d => TokenEffects.isManual(d));

/**
 * Filter local documents out of the persistence paths.
 */
function toObject(wrapped, source = true) {
  const data = wrapped(source);
  if ( data.effects ) data.effects = strip(data.effects);
  if ( data.items ) data.items = strip(data.items);
  return data;
}

PATCHES.BASIC.WRAPS = { toObject };
