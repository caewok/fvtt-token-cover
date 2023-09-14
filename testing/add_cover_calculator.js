MODULE_ID = "tokenvisibility"
DFREDS_ID = "dfreds-convenient-effects"
api = game.modules.get(MODULE_ID).api;
COVER = api.COVER
CoverCalculator = api.CoverCalculator
TYPES = COVER.TYPES;
coverModule = game.modules.get(DFREDS_ID)?.active ? DFREDS_ID : MODULE_ID;



// Add cover using Cover Calculator
// Add half, add 3/4, add total
// Should work from non-GM user as well.
tokens = canvas.tokens.controlled;
for ( const token of tokens ) {
  await CoverCalculator.enableCover(token, TYPES.LOW)
  //console.table([...token.actor.statuses.keys()])

  await CoverCalculator.enableCover(token, TYPES.MEDIUM)
  //console.table([...token.actor.statuses.keys()])

  await CoverCalculator.enableCover(token, TYPES.HIGH)
  //console.table([...token.actor.statuses.keys()])

  if ( token.actor.statuses.has(COVER.CATEGORIES.LOW[coverModule]) ) console.error("Token status LOW still present.");
  if ( token.actor.statuses.has(COVER.CATEGORIES.MEDIUM[coverModule]) ) console.error("Token status MEDIUM still present.");
  if ( !token.actor.statuses.has(COVER.CATEGORIES.HIGH[coverModule]) ) console.error("Token status HIGH not present.");
}

// Removing should work
for ( const token of tokens ) {
  await CoverCalculator.enableCover(token, TYPES.LOW);
  await CoverCalculator.disableAllCover(token);
  if ( token.actor.statuses.has(COVER.CATEGORIES.LOW[coverModule]) ) console.error("Token status LOW still present.");
  if ( token.actor.statuses.has(COVER.CATEGORIES.MEDIUM[coverModule]) ) console.error("Token status MEDIUM still present.");
  if ( token.actor.statuses.has(COVER.CATEGORIES.HIGH[coverModule]) ) console.error("Token status HIGH still present.");
}
