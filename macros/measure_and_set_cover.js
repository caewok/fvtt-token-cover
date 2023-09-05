// Macro to measure cover between selected tokens and targets.
// And allow the user to set cover status.
const api = game.modules.get("tokenvisibility").api;
const CoverCalculator = api.CoverCalculator;
const CoverDialog = api.CoverDialog

// Determine token and targets.
const token = game.user._lastSelected;
const targets = game.user.targets;
if ( !token ) {
  ui.notifications.error("Please select a token.");
  return;
}
if ( !targets.size ) {
  ui.notifications.error("Please target at least one target.");
  return;
}

// Request the user confirm cover, and then update target statuses.
const coverDialog = new CoverDialog(token, targets)
const coverCalculations = await coverDialog.confirmCover()
await coverDialog.updateTargetsCover(coverCalculations);

// Send cover message to chat.
await coverDialog.sendCoverCalculationsToChat({ coverCalculations })
