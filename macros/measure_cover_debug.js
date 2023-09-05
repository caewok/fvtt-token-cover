// Macro to measure cover between selected tokens and targets
// This version turns on debugging for the cover
const token = game.user._lastSelected;
const targets = [...game.user.targets];

if ( !token ) {
  ui.notifications.error("Please select a token.");
  return;
}

if ( !targets.length ) {
  ui.notifications.error("Please target at least one target.");
  return;
}

const api = game.modules.get("tokenvisibility").api;
api.debug.cover = true;
api.debug.once = true; // Turn on debugging just for this macro; turns off at next token move.

const coverDialog = new api.CoverDialog(token, targets);
coverDialog.showCoverResults();