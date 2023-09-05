// Macro to measure cover between selected tokens and targets

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
const coverDialog = new api.CoverDialog(token, targets);
coverDialog.showCoverResults();
