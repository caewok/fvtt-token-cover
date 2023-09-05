// Macro to measure cover between selected tokens and targets
// And allow the user to set cover status

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
// if ( !targets.length ) {
//   ui.notifications.error("Please target at least one token.");
//   return;
// }

const api = game.modules.get("tokenvisibility").api;
const CoverCalculator = api.CoverCalculator;
const CoverDialog = api.CoverDialog

const coverDialog = new CoverDialog(token, targets)
const tokenCoverCalculations = await coverDialog.confirmCover()
await coverDialog.updateTargetsCover(tokenCoverCalculations);

const promises = Object.entries(tokenCoverCalculations)
  .map(([targetId, coverStatus]) => CoverCalculator.enableCover(targetId, coverStatus));
await Promise.all(promises)

// Send cover to chat
const coverCalculations = CoverDialog.convertTokenCalculations(token, tokenCoverCalculations);
const coverTable = coverDialog.htmlCoverTable({ tokens: [token], targets,
  includeZeroCover: true,
  imageWidth: 30,
  coverCalculations,
  applied: true,
  displayIgnored: false
});
ChatMessage.create({ content: coverTable.html });

