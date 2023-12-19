// Macro to measure cover between selected tokens and targets.
// Determine token and targets.
const token = game.user._lastSelected || canvas.tokens.controlled[0];
if ( !token ) {
  ui.notifications.error("Please select a token.");
  return;
}

let targets = game.user.targets;
if ( !targets.size ) {
  targets = new Set(canvas.tokens.placeables);
  targets.delete(token); // Remove the controlled token.
}

if ( !targets.size ) {
  ui.notifications.error("Please target at least one target.");
  return;
}

// Display cover to user.
const api = game.modules.get("tokencover").api;
const coverDialog = new api.CoverDialog(token, targets);
coverDialog.showCoverResults();