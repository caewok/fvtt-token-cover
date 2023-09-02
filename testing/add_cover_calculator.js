MODULE_ID = "tokenvisibility"
DFREDS_ID = "dfreds-convenient-effects"
api = game.modules.get(MODULE_ID).api;
COVER = api.COVER
CoverCalculator = api.CoverCalculator
TYPES = COVER.TYPES


// Add cover using Cover Calculator
// Add half, add 3/4, add total
tokens = canvas.tokens.controlled;
for ( const token of tokens ) {
  await CoverCalculator.enableCover(token, TYPES.LOW)
  await CoverCalculator.enableCover(token, TYPES.MEDIUM)
  await CoverCalculator.enableCover(token, TYPES.HIGH)

  if ( token.actor.statuses.has(COVER.CATEGORIES.LOW[coverModule]) ) console.error("Token status LOW still present.");
  if ( token.actor.statuses.has(COVER.CATEGORIES.MEDIUM[coverModule]) ) console.error("Token status MEDIUM still present.");
  if ( !token.actor.statuses.has(COVER.CATEGORIES.HIGH[coverModule]) ) console.error("Token status HIGH not present.");
}

// Adding two in a row should remove the status
for ( const token of tokens ) {
  if ( token.actor.statuses.has(COVER.CATEGORIES.LOW[coverModule]) ) await coverActivationFn(token, "LOW");
  await coverActivationFn(token, "LOW");
  await coverActivationFn(token, "LOW");
  if ( token.actor.statuses.has(COVER.CATEGORIES.LOW[coverModule]) ) console.error("Token status LOW still present.");
}
