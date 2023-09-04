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

coverDialog.updateTargetsCover();

