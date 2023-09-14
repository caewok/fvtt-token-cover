// Macro to toggle ATV vision debug.
const api = game.modules.get("tokenvisibility").api;
api.debug.los = !api.debug.los;

// Clear the vision line drawings.
if ( !api.debug.los ) CONFIG.GeometryLib.Draw.clearDrawings();

// Tell the user what the current setting is and refresh the token vision
if ( api.debug.los ) {
  // Tell the user the current setting.
  const currentVisionSetting = game.settings.get("tokenvisibility", "los-algorithm")
  ui.notifications.notify(`Current ATV vision setting is ${currentVisionSetting}.`);

  // Refresh token vision for controlled tokens to display the debug lines.
  const tokens = canvas.tokens.controlled;
  if ( tokens.length ) tokens.forEach(token => token.renderFlags.set({refreshVisibility: true}));
  canvas.perception.update({refreshVision: true})
}
