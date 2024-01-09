[![Version (latest)](https://img.shields.io/github/v/release/caewok/fvtt-token-cover)](https://github.com/caewok/fvtt-token-cover/releases/latest)
[![Foundry Version](https://img.shields.io/badge/dynamic/json.svg?url=https://github.com/caewok/fvtt-token-cover/releases/latest/download/module.json&label=Foundry%20Version&query=$.compatibleCoreVersion&colorB=blueviolet)](https://github.com/caewok/fvtt-token-cover/releases/latest)
[![License](https://img.shields.io/github/license/caewok/fvtt-token-cover)](LICENSE)

# Alternative Token Cover

This module provides options to calculate how much cover a targeted token has, with respect to a viewer token. Various options are provided to modify how the cover calculation is made. The GM can also define low, medium, and high levels of cover, and associate each level of cover with an active effect that is applied to the targeted token when it has cover. Workflow options are provided to facilitate automation.

This module is closely related to [Alternative Token Visibility](https://github.com/caewok/fvtt-token-visibility). Both rely on the same underlying algorithms to determine whether there are obstacles between the viewer and the target.

Cover Algorithm choices:
- Points. Test whether a 3d ray from a point on the viewer token to a point on the target token is blocked by an obstacle. Multiple points on the target can be tested to determine whether a threshold percentage of rays is met for cover. For overhead tiles, considers them to block unless the ray passes through a transparent portion of the tile.
- Area2d. Test the percentage of the overhead view of a target token that is viewable from the perspective of a point on the viewer token. For overhead tiles, does not consider transparency.
- Area3d. Test the percentage of the 3d view of a target token that is viewable from the perspective of a point on the viewer token. For overhead tiles, uses webGL to test transparency.

Major features:
- Choose whether one or more points on the viewing target are tested for cover, with the best result taken. Options include a "stereo" version that uses two points on the front facing side of the token.
- Adjust viewer and target point locations, shifting from the token border to the center.
- Account for wall height (using the [Wall Height](https://github.com/theripper93/wall-height) module) and overhead tiles.
- Adjust the vision height for tokens and prone tokens.

# Installation

Add this [Manifest URL](https://github.com/caewok/fvtt-token-cover/releases/latest/download/module.json) in Foundry to install.

## Dependencies
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)

## Recommended module additions
- [Alternative Token Visibility](https://github.com/caewok/fvtt-token-visibility). Needed if you want token vision to exactly match token cover.
- [Wall Height](https://github.com/theripper93/wall-height). Not only does Wall Height provide the ability to set elevation for wall tops and bottoms, it also gives tokens height based on their size. The Area3d option for Alt Token Visibility takes full advantage of token height.
- [Elevated Vision](https://github.com/caewok/fvtt-elevated-vision). Can assist with setting terrain and token elevations.
- [Midiqol](https://gitlab.com/tposney/midi-qol). If midiqol is installed, additional options are presented to allow cover calculations during an attack roll.

## Levels

Alternative Token Cover is intended to work with the [Levels](https://github.com/theripper93/Levels) module. Both the Points and the Area3d algorithms will ignore transparent portions of tiles as expected in Levels. The Area2d algorithm treats overhead tiles as blocking regardless of transparency and thus may not work in all cases with Levels. 

# Token Height
Token height, for purposes of measuring vision, can be changed using the [Wall Height](https://github.com/theripper93/wall-height) module. Token height is otherwise set based on scale of the token—namely,the number of grid squares it occupies. 

Note that very large tokens can be quite tall, and may poke through an overhead tile. Depending on your settings, this may cause large tokens to be visible if a sufficient portion of the token is visible.

# Main Settings Menu

<img width="972" alt="ATC Main Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/dc2b3bca-0274-49ac-8923-926b531b5eb8">

## Cover

Cover is abstracted into three distinct levels: low, medium, and high. It is expected that these cover types are ordered, such that as a token becomes less viewable due to a portion of the token being behind an obstacle, the token goes from low --> medium --> high cover.

Settings allow the GM to define the precise limits for cover and the algorithm used. Use the active effet configuration settings to re-name the cover types and apply various active effects.

By default, cover algorithms uses the "move" wall restriction when considering whether walls block. This is intended to be consistent with how walls that would physically block movement are most likely to provide cover. Using the API, it is possible to change this for a given calculation. 

### Effects

The GM can define the name of each cover level, provide an icon, and define active effects for each cover type. Default active effects are provided for dnd5e low (half) and medium (three-quarters) cover. Cover effects can be set as status conditions on a token.

For PF2e, status effects are not added as status conditions. PF2e already has cover effects and the GM is advised to use those.

## Debug Range and Debug LOS
When enabled, these will visualize the range and line-of-sight algorithms on the canvas. Range is indicated by dots on the target tokens, red for out-of-range and green for in-range. For LOS Area3d, you must control a token and target another token to make a popout window appear that will show a 3d view from the perspective of the controlled token looking directly at the targeted token. (You might need to move the controlled token to force the popout to refresh.)

# Cover Settings Configuration Menu
Most of the relevant ATC module settings appear in a popout when you hit the "Configure" button in the main settings menu.

## Viewer
Settings relevant to the viewing token.

<img width="700" alt="ATC Viewer Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/310d547b-bcea-4602-8478-7fe2b124b4b1">

The viewing points are the viewing token's "eyes." If more than one viewing point, the target will have cover if none of the viewer points have line-of-sight to the target. When more than one point is used, an "offset" allows you to determine how far each point lies on a line between the viewer center and the viewer border. If two points are used, they are set to the token's front-facing direction.

## Target
Settings relevant to the target token.

<img width="702" alt="ATC Target Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/2d185540-87a6-4244-82eb-912a0fc346f2">

### Large Token Subtargeting
If enabled, tokens larger than a grid square will be considered to have no cover if at least one grid square's worth of the token is unobstructed from the viewer. For the Points algorithm, each grid square that the target occupies is tested separately as if it were a single token. For the Area2d and Area3d algorithms, the percentage area required is based on the size of a single grid square instead of the size of the entire target. The result is that tokens larger than a grid square can have less than 0% cover.  

This setting is slightly less performant but very useful for larger tokens. For example, without large token subtargeting, 3 out of 4 grid squares of a dragon could be visible and—depending on your cover threshold setting—this may still provide cover to the dragon.

### Points Algorithm
The points algorithm tests whether a 3d ray from the viewing point to a point on the target token is blocked by an obstacle. As with the viewer, the offset determines how close each point is to the center of the target token. If 3d points are enabled, additional points at the top and bottom of the target token will be tested. 

### Area2d Algorithm
The Area2d algorithm tests how much of the overhead target token shape is obstructed. It usually is very performant, but less intuitive and less accurate than the Area3d algorithm. It treats all overhead tiles as opaque.

### Area3d Algorithm
The Area3d algorithm constructs a simplistic 3d model of the scene from the point of view of the viewing token looking toward the target token. It then measures the obstructed area of the 3d target. This can be faster than the Points algorithm in certain scenes. 

If overhead tiles are encountered within the viewing triangle, the Area3d algorithm switches to webGL to construct its 3d model. This allows it to take into account transparent portions of the overhead tile. The webGL is much slower, however, so it only uses it when necessary. (The slowdown is primarily because the webGL scene must be converted back into pixels that Javascript can then summarize to determine the obstructed area.)

## Workflow
Settings relevant to automated workflow for applying cover effects to targeted tokens.

<img width="702" alt="ATC Workflow Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/ed58c4a8-e502-4709-ac8b-4f0397ebf45e">

### Combatant targeting applies cover
When enabled, this option applies cover status to targeted tokens during combat. During combat only, if the user that owns the current combatant targets a token, cover is measured and, when applicable, a cover status condition is added to the targeted token.

### Display cover in chat
For dnd5e, enabling this will use the dnd5e attack hook to display cover of targeted tokens in the chat, when an attack is initiated. Targeted tokens without cover are not included in the chat message, and so if no targeted tokens have cover, nothing will be output to chat.

### Midiqol Attack Workflow

If [Midiqol](https://gitlab.com/tposney/midi-qol) is active, the GM can choose whether cover status conditions should be applied to targeted tokens. Statuses are applied after targeting occurs in the midiqol workflow. Options:

- Do not test for cover
- Ask user to confirm.
- Ask GM to confirm.
- Apply automatically

For the confirmation options, this pops up a list of targets with calculated covers. Cover types can then be changed by the user or GM, respectively.

### Confirm cover only on change
To avoid spamming the GM or users with cover calculations, this setting (when enabled) limts confirmations to only when the calculated cover is different from the targeted token's current cover effect. For example, if the targeted token has no cover effect, and the calculated cover for the token is none, no confirmation would be displayed.

## Other
Other settings that affect the line-of-sight calculation.

<img width="699" alt="ATV Settings - Other" src="https://github.com/caewok/fvtt-token-visibility/assets/1267134/8cbc98d8-9dc7-4e67-b5d1-d23c0e6c2c9f">

Optionally, you can have live or dead tokens be treated as obstacles for the purposes of cover. Prone tokens can also optionally grant cover. For these settings to work, you must tell ATC what the prone status is for your system, and where to find the hit points attribute. (It is assumed that 0 or below means "dead" for purposes of defining dead tokens.) 

The vision height multiplier allows you to change the height at which a viewing token observes the scene. Think of this as the height of the eyes of the token above the ground, as a percentage of the total token height.

Note that if Alternative Token Visibility is present, it will take over control of the multiplier and prone status.

## Ignoring Cover

A token can be set to ignore cover less than or equal to some amount. For example, a token set to ignore Medium cover (3/4 cover in DND5e) will also ignore Low cover (1/2 cover in DND5e). Tokens can be set to ignore cover for all attacks (all), or any of the following: melee weapon (mwak), ranged weapon (rwak), melee spell (msak), or ranged spell (rsak).

To set ignoring cover on a specific token, use, for example:
```js
api = game.modules.get('tokencover').api;
cover_type = api.COVER_TYPES;

_token.ignoresCoverType.all = cover_type.LOW;
_token.ignoresCoverType.rwak = cover_type.MEDIUM;

rangedWeaponIgnored = _token.ignoresCoverType.rwak;
```

For linked actors, these values will be set on the actor.

In dnd5e, tokens can also be set to ignore cover for all attacks using the Special Traits token configuration menu.

For Midiqol workflows, the special flags for sharpshooter and spell sniper will be checked when using `_token.ignoresCoverType` and during the midi workflow if cover checking is enabled in the midiqol attack workflow setting, described above.

# Cover Macro

A compendium macro, "Measure Cover" is provided to allow users to easily measure cover. Select one or more tokens and target one or more tokens. Cover will be measured for each token --> target combination and the results reported in a pop-up.

<img src="https://raw.githubusercontent.com/caewok/fvtt-token-cover/feature/screenshots/screenshots/settings-cover-macro.jpg" width="400" alt="Cover Macro for the Alt Token Visibility Module">

A second version of this macro, "Cover Debug Tester" temporarily enables the debug visibility so you can get a better sense of what the cover algorithm is detecting.

If a token is set to ignore cover, that information will be provided in the pop-up display. It is assumed the GM or user will than take that information into account as needed.

Feel free to message me in Discord if you have questions about specific methods.
