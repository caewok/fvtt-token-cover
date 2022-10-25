/* globals
game,
ui
*/

"use strict";

import { log } from "./util.js";
import { MODULE_ID } from "./const.js";

export function getSetting(settingName) { return game.settings.get(MODULE_ID, settingName); }

export async function setSetting(settingName, value) {
  return await game.settings.set(MODULE_ID, settingName, value);
}

// Functions to change visibility of a setting
function setSettingVisibility(settingName, visible = true) {
  log(`Setting ${settingName} to ${visible ? "visible" : "not visible"}`);
  game.settings.settings.get(`${MODULE_ID}.${settingName}`).config = visible;
  if ( game.settings._sheet ) game.settings._sheet.render();
}


export const SETTINGS = {
  USE_MODULE: "use-module",

  RANGE: {
    ALGORITHM: "range-algorithm",
    TYPES: {
      CENTER: "range-center",
      FOUNDRY: "range-foundry",
      FOUNDRY_3D: "range-foundry-3d"
      // Corners and corners 3d?
    }
  },

  LOS: {
    ALGORITHM: "los-algorithm",
    TYPES: {
      POINTS: "los-points",
      AREA: "los-area",
      AREA3D: "los-area-3d"
    },

    PERCENT_AREA: "los-percent-area"
  },

  COVER: {
    ALGORITHM: "cover-algorithm",
    TYPES: {
      CENTER_CORNERS_TARGET: "cover-center-to-target-corners",
      CORNER_CORNERS_TARGET: "cover-corner-to-target-corners",
      CENTER_CORNERS_GRID: "cover-center-to-target-grid-corners",
      CORNER_CORNERS_GRID: "cover-corner-to-target-grid-corners",
      CENTER_CENTER: "cover-center-to-center",
      CENTER_CUBE: "cover-center-to-cube",
      CUBE_CUBE: "cover-cube-to-cube",
      AREA: "cover-area",
      AREA3D: "cover-area-3d"
    },
    NAMES: {
      LOW: "cover-name-low",
      MEDIUM: "cover-name-medium",
      HIGH: "cover-name-high"
    },
    EFFECTS: {
      LOW: "cover-effect-low",
      MEDIUM: "cover-effect-medium",
      HIGH: "cover-effect-high"
    },

    TRIGGER_CENTER: "cover-trigger-center",

    TRIGGER_PERCENT: {
      LOW: "cover-trigger-percent-low",
      MEDIUM: "cover-trigger-percent-medium",
      HIGH: "cover-trigger-percent-high"
    },

  }
};


/* Range testing types:
1. Center point -- Only test the center point of tokens.
2. Foundry -- Use the Foundry 8 points.
3. 3d Foundry -- Add additional points to top and bottom, 27 total

For 3d, test points in 3 dimensions.
*/

/* LOS testing types:
1. Points --- Use the same points from range, test if contained in LOS polygon.
3. Area -- Use token area.

For area, provide a slider for 0–100% of token area.
Each token should have a setting for bounds scale for vision.

For 3d points, don't test los contains for extra 3d Foundry points. (They would obv. be the same. )
For 3d points, do test wall collisions for non-infinite walls.
(Infinite walls included in LOS.)
*/

/* Cover testing types:
1. Center to 4 Corners -- from the center point of the token to 4 corners
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
2. Corner to Four Corner -- DMG rules; vision from each occupied grid point
Half trigger: 1 (hex: 1)
3/4 trigger: 3 (hex: 4)
3. Center to Center -- PF2e version
3/4 (standard)
4. Area
Half trigger: % area
3/4 trigger: % area
full trigger: % area

3D versions ( same triggers )
5. Center to cube corners
6. Cube corner to cube corners
7. 3d Area


Other settings:
GM can provide the name of an active effect to apply when covered. Applies to the token with cover.
- low active effect
- medium active effect
- high active effect

Cover Names:
Generic: low, medium, high
PF2e: lesser, standard, greater
dnd5e: half, 3/4, full

*/

export function registerSettings() {
  log("Registering token visibility settings.");

  const RTYPES = SETTINGS.RANGE.TYPES;
  const VTYPES = SETTINGS.LOS.TYPES;
  const CTYPES = SETTINGS.COVER.TYPES;
  const coverNames = getCoverNames();


  game.settings.register(MODULE_ID, SETTINGS.RANGE.ALGORITHM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.RANGE.ALGORITHM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.RANGE.ALGORITHM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: {
      [RTYPES.CENTER]: game.i18n.localize(`${MODULE_ID}.settings.${RTYPES.CENTER}`),
      [RTYPES.FOUNDRY]: game.i18n.localize(`${MODULE_ID}.settings.${RTYPES.FOUNDRY}`),
      [RTYPES.FOUNDRY_3D]: game.i18n.localize(`${MODULE_ID}.settings.${RTYPES.FOUNDRY_3D}`)
    },
    default: RTYPES.FOUNDRY
  });

  game.settings.register(MODULE_ID, SETTINGS.LOS.ALGORITHM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.LOS.ALGORITHM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.LOS.ALGORITHM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: {
      [VTYPES.POINTS]: game.i18n.localize(`${MODULE_ID}.settings.${VTYPES.POINTS}`),
      [VTYPES.AREA]: game.i18n.localize(`${MODULE_ID}.settings.${VTYPES.AREA}`),
      [VTYPES.AREA3D]: game.i18n.localize(`${MODULE_ID}.settings.${VTYPES.AREA3D}`)
    },
    default: VTYPES.POINTS,
    onChange: updateLosSetting
  });

  game.settings.register(MODULE_ID, SETTINGS.LOS.PERCENT_AREA, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.LOS.PERCENT_AREA}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.LOS.PERCENT_AREA}.Hint`),
    range: {
      max: 1,
      min: 0,
      step: 0.1
    },
    scope: "world",
    config: () => getSetting(SETTINGS.LOS.ALGORITHM) !== VTYPES.POINTS,
    default: 0,
    type: Number
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.ALGORITHM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.ALGORITHM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.ALGORITHM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    choices: {
      [CTYPES.CENTER_CENTER]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CENTER_CENTER}`),
      [CTYPES.CENTER_CORNERS_TARGET]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CENTER_CORNERS_TARGET}`),
      [CTYPES.CORNER_CORNERS_TARGET]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CORNER_CORNERS_TARGET}`),
      [CTYPES.CENTER_CORNERS_GRID]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CENTER_CORNERS_GRID}`),
      [CTYPES.CORNER_CORNERS_GRID]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CORNER_CORNERS_GRID}`),
      [CTYPES.CENTER_CUBE]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CENTER_CUBE}`),
      [CTYPES.CUBE_CUBE]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.CUBE_CUBE}`),
      [CTYPES.AREA]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.AREA}`),
      [CTYPES.AREA3D]: game.i18n.localize(`${MODULE_ID}.settings.${CTYPES.AREA3D}`)
    },
    default: CTYPES.CENTER_CORNERS//,
    //onChange: updateCoverSetting
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_CENTER, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_CENTER}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_CENTER}.Hint`),
    scope: "world",
    config: () => getSetting(SETTINGS.COVER.ALGORITHM) === CTYPES.CENTER_CENTER,
    default: coverNames.medium,
    type: String,
    choices: {
      LOW: coverNames.low,
      MEDIUM: coverNames.medium,
      HIGH: coverNames.high
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_PERCENT.LOW, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.LOW}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.LOW}.Hint`),
    range: {
      max: 1,
      min: 0.1,
      step: 0.1
    },
    scope: "world",
    config: () => getSetting(SETTINGS.COVER.ALGORITHM) !== CTYPES.CENTER_CENTER,
    default: .5,
    type: Number
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.MEDIUM}.Hint`),
    range: {
      max: 1,
      min: 0.1,
      step: 0.1
    },
    scope: "world",
    config: () => getSetting(SETTINGS.COVER.ALGORITHM) !== CTYPES.CENTER_CENTER,
    default: .75,
    type: Number
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.TRIGGER_PERCENT.HIGH, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.HIGH}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.TRIGGER_PERCENT.HIGH}.Hint`),
    range: {
      max: 1,
      min: 0.1,
      step: 0.1
    },
    scope: "world",
    config: () => getSetting(SETTINGS.COVER.ALGORITHM) !== CTYPES.CENTER_CENTER,
    default: 1,
    type: Number
  });


  game.settings.register(MODULE_ID, SETTINGS.COVER.NAMES.LOW, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.NAMES.LOW}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.NAMES.LOW}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: coverNames.low
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.NAMES.MEDIUM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.NAMES.MEDIUM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.NAMES.MEDIUM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: coverNames.medium
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.NAMES.HIGH, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.NAMES.HIGH}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.NAMES.HIGH}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: coverNames.high
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.EFFECTS.LOW, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.EFFECTS.LOW}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.EFFECTS.LOW}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.EFFECTS.MEDIUM, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.EFFECTS.MEDIUM}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.EFFECTS.MEDIUM}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, SETTINGS.COVER.EFFECTS.HIGH, {
    name: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.EFFECTS.HIGH}.Name`),
    hint: game.i18n.localize(`${MODULE_ID}.settings.${SETTINGS.COVER.EFFECTS.HIGH}.Hint`),
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  log("Done registering settings.");
}

function getCoverNames() {
  let coverNames;
  switch ( game.system.id ) {
    case "dnd5e":
      coverNames = { low: "half", medium: "three-quarters", high: "total"};
      break;
    case "pf2e":
      coverNames = { low: "Lesser", medium: "Standard", high: "Greater"};
      break;
    default:
      coverNames = { low: "low", medium: "medium", high: "high"};
  }
  return coverNames;
}

function updateLosSetting(value) {
  log(`Changing to ${value}`);
//   ui.notifications.notify(`Changing to ${value}`);
  const VTYPES = SETTINGS.LOS.TYPES;
  const visible = value === VTYPES.AREA || value === VTYPES.AREA3D;
  setSettingVisibility(SETTINGS.LOS.PERCENT_AREA, visible);
}

function updateCoverSetting(value) {
  log(`Changing to ${value}`);
//   ui.notifications.notify(`Changing to ${value}`);
  const CTYPES = SETTINGS.COVER.TYPES;
  const area_visible = value === CTYPES.AREA;
  const center_visible = value === CTYPES.CENTER_CENTER;
  const corners_visible = !(area_visible || center_visible);

  setSettingVisibility(SETTINGS.COVER.TRIGGER_CORNERS.LOW, corners_visible);
  setSettingVisibility(SETTINGS.COVER.TRIGGER_CORNERS.MEDIUM, corners_visible);
  setSettingVisibility(SETTINGS.COVER.TRIGGER_CORNERS.HIGH, corners_visible);

  setSettingVisibility(SETTINGS.COVER.TRIGGER_AREA.LOW, area_visible);
  setSettingVisibility(SETTINGS.COVER.TRIGGER_AREA.MEDIUM, area_visible);
  setSettingVisibility(SETTINGS.COVER.TRIGGER_AREA.HIGH, area_visible);

  setSettingVisibility(SETTINGS.COVER.TRIGGER_CENTER, center_visible);
}

export function activateListenersSettingsConfig(wrapper, html) {
  log("activateListenersSettingsConfig", html);

  //   html.on("change", 'td[name="tokenvisibility.vision-algorithm"]', tempUpdateVisionSetting.bind(this));
  html.find(`[name="tokenvisibility.los-algorithm"]`).change(tempUpdateLosSetting.bind(this));
  //   html.find(`[name="${MODULE_ID}.${SETTINGS.VISION.ALGORITHM}"]`).change(tempUpdateVisionSetting.bind(this));

  html.find(`[name="tokenvisibility.cover-algorithm"]`).change(tempUpdateCoverSetting.bind(this));
  wrapper(html);
}

let ORIGINAL_LOS_ALGORITHM;
let ORIGINAL_COVER_ALGORITHM;

async function tempUpdateLosSetting(event) {
//   log("tempUpdateVisionSetting", event);
//   ui.notifications.notify(`tempUpdateVisionSetting`)

  ORIGINAL_LOS_ALGORITHM = getSetting(SETTINGS.LOS.ALGORITHM);
  await setSetting(SETTINGS.LOS.ALGORITHM, event.currentTarget.value);
//   updateVisionSetting(event.currentTarget.value);
}

async function tempUpdateCoverSetting(event) {
  ORIGINAL_COVER_ALGORITHM = getSetting(SETTINGS.COVER.ALGORITHM);
  await setSetting(SETTINGS.COVER.ALGORITHM, event.currentTarget.value);
}

export async function closeSettingsConfig(wrapper, options = {}) {
//   log("Closing!")
//   ui.notifications.notify("Closing settingsConfig");
  const out = wrapper(options);

  if ( ORIGINAL_LOS_ALGORITHM ) {
    setSetting(SETTINGS.LOS.ALGORITHM, ORIGINAL_LOS_ALGORITHM);
    ORIGINAL_LOS_ALGORITHM = undefined;
  }

  if ( ORIGINAL_COVER_ALGORITHM ) {
    setSetting(SETTINGS.COVER.ALGORITHM, ORIGINAL_COVER_ALGORITHM);
    ORIGINAL_COVER_ALGORITHM = undefined;
  }

  return out;
}


export async function _onSubmitSettingsConfig(wrapper, options = {}) {
//   log("on Submitting!")
//   ui.notifications.notify("Submitting settingsConfig");

  if ( ORIGINAL_LOS_ALGORITHM ) ORIGINAL_LOS_ALGORITHM = undefined;
  if ( ORIGINAL_COVER_ALGORITHM ) ORIGINAL_COVER_ALGORITHM = undefined;

  return wrapper(options);
}

export async function _onChangeInput(wrapper, event) {
  log("_onChangeInput!")  ;
//   ui.notifications.notify("_onChangeInput settingsConfig");

  return wrapper(event);
}

/*
Should probably switch to CSS:
https://ptb.discord.com/channels/170995199584108546/956243957816377414/1029782382225670201
No built-in way to do this. I would probably have config: true for all the settings, then use a renderSettingsConfig hook to selectively hide the elements with CSS only and add a listener which toggles that CSS hidden state.

*/

