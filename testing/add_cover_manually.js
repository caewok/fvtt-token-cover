MODULE_ID = "tokenvisibility"
DFREDS_ID = "dfreds-convenient-effects"
api = game.modules.get(MODULE_ID).api;
COVER = api.COVER


async function activateModuleCover(token, cover) {
  const coverId = COVER.CATEGORIES[cover][MODULE_ID];
  const effect = CONFIG.statusEffects.find(e => e.id === coverId);
  await token.document.toggleActiveEffect(effect, { active: true })
}

async function activateDFredsCover(token, cover) {
  const effectName = COVER.DFRED_NAMES[cover];
  return game.dfreds.effectInterface.addEffect({ effectName, uuid: token.document.uuid })
}

coverModule = game.modules.get(DFREDS_ID)?.active ? DFREDS_ID : MODULE_ID;
coverActivationFn = coverModule === DFREDS_ID ? activateDFredsCover : activateModuleCover


// Add cover using the token toggle
// Add half, add 3/4, add total
tokens = canvas.tokens.controlled;
for ( const token of tokens ) {
  await coverActivationFn(token, "LOW");
  await coverActivationFn(token, "MEDIUM");
  await coverActivationFn(token, "HIGH");

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
