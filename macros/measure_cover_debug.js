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

// Display the cover dialog
const api = game.modules.get("tokencover").api;
const coverDialog = new api.CoverDialog(token, targets);
coverDialog.showCoverResults();

// Display debug from token to each target
const coverCalc = token.tokencover.coverCalc;
for ( const target of targets ) {
  coverCalc.target = target;
  await coverCalc.openDebugPopout(); // If using Area3d, popout the debug viewer.
  coverCalc.debug();
}

// Clear the debug drawing when any token is updated.
Hooks.once("updateToken", () => {
  coverCalc.clearDebug();
  coverCalc.closeDebugPopout();
});