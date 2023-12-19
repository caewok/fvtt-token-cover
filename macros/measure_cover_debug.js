// Macro to measure cover between selected tokens and targets.
// This version turns on debugging for the cover.
// Determine token and targets.
const token = game.user._lastSelected || canvas.tokens.controlled[0];
if ( !token ) {
  ui.notifications.error("Please select a token.");
  return;
}

let targets = game.user.targets;
if ( !targets.size ) {
  targets = new Set(canvas.tokens.placeables);
  targets.delete(token); // Remove the controlled token from targets.
}

if ( !targets.size ) {
  ui.notifications.error("Please target at least one target.");
  return;
}

// Turn on debugging just for this macro; turns off at next token move.

// api.debug.cover = true;
// api.debug.once = true;

// Display cover debug to user.
coverCalc = token.tokencover.coverCalc;
await coverCalc.openDebugPopout(); // If using Area3d, popout the debug viewer.

const api = game.modules.get("tokencover").api;
const coverDialog = new api.CoverDialog(token, targets);
coverDialog.showCoverResults();

coverCalc.debug(true);