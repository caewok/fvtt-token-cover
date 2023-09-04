MODULE_ID = "tokenvisibility"
DFREDS_ID = "dfreds-convenient-effects"
api = game.modules.get(MODULE_ID).api;
COVER = api.COVER
CoverCalculator = api.CoverCalculator
CoverDialog = api.CoverDialog
TYPES = COVER.TYPES;
coverModule = game.modules.get(DFREDS_ID)?.active ? DFREDS_ID : MODULE_ID;

token = game.user._lastSelected
targets = [...game.user.targets]

coverDialog = new CoverDialog(token, targets)

calcs = coverDialog.tokenCoverCalculations
calcs2 = coverDialog.copyTokenCoverCalculations();
calcs2.set(targets[0], 5);
if ( calcs.get(targets[0]) === calcs2.get(targets[0]) ) console.error("Target covers should not match.")

coverDialog.resetCoverCalculations()
coverDialog._targetCoversMatchCalculations();

await coverDialog.updateTargetsCover();

await coverDialog.showCoverResults()
await coverDialog.showCoverResults({include3dDistance: false})
await coverDialog.showCoverResults({includeZeroCover: false})
await coverDialog.showCoverResults({actionType: "mwak"})
await coverDialog.showCoverResults({applied: true})
await coverDialog.showCoverResults({displayIgnored: false})

await coverDialog.confirmCover();
await coverDialog.confirmCover({askGM: false})
await coverDialog.confirmCover({actionType: "mwak"})
await coverDialog.confirmCover({actionType: "all"})

await coverDialog.sendCoverCalculationsToChat()
await coverDialog.sendCoverCalculationsToChat(undefined, { actionType: "mwak" })

await coverDialog.workflow()
await coverDialog.workflow("mwak")

// Test different settings.
async function setSetting(settingName, value) {
//   settingsCache.delete(settingName);
  return game.settings.set(MODULE_ID, settingName, value);
}

await setSetting("midiqol-covercheck-if-changed", true);
await setSetting("midiqol-covercheck-if-changed", false);
await setSetting("midiqol-covercheck", "midiqol-covercheck-none");
await setSetting("midiqol-covercheck", "midiqol-covercheck-user");
await setSetting("midiqol-covercheck", "midiqol-covercheck-user-cancel");
await setSetting("midiqol-covercheck", "midiqol-covercheck-gm");
await setSetting("midiqol-covercheck", "midiqol-covercheck-auto");