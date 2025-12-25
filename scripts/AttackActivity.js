/* globals

*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { rollAttack } from "./dnd5e.js";

// Patches for the dnd5e AttackActivity class
export const PATCHES = {};
PATCHES.DND5E = {};

PATCHES.DND5E.MIXES = { rollAttack };