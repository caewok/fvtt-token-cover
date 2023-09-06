// Macro to measure cover between selected tokens and targets.
// This version turns on debugging for the cover.
// Determine token and targets.
const token = game.user._lastSelected || canvas.tokens.controlled[0];
const targets = game.user.targets;
if ( !token ) {
  ui.notifications.error("Please select a token.");
  return;
}
if ( !targets.size ) {
  ui.notifications.error("Please target at least one target.");
  return;
}

// Turn on debugging just for this macro; turns off at next token move.
const api = game.modules.get("tokenvisibility").api;
api.debug.cover = true;
api.debug.once = true;

// Display cover to user.
const coverDialog = new api.CoverDialog(token, targets);
coverDialog.showCoverResults();
