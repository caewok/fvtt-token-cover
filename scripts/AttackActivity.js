/* globals

*/
/* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
"use strict";

import { rollAttack_v4 } from "./dnd5e.js";

// Patches for the dnd5e AttackActivity class
export const PATCHES = {};
PATCHES.DND5E_v4 = {};

PATCHES.DND5E_v4.MIXES = { rollAttack: rollAttack_v4 };