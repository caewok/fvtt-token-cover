[![Version (latest)](https://img.shields.io/github/v/release/caewok/fvtt-token-cover)](https://github.com/caewok/fvtt-token-cover/releases/latest)
[![Foundry Version](https://img.shields.io/badge/dynamic/json.svg?url=https://github.com/caewok/fvtt-token-cover/releases/latest/download/module.json&label=Foundry%20Version&query=$.compatibility.verified&colorB=blueviolet)](https://github.com/caewok/fvtt-token-cover/releases/latest)
[![License](https://img.shields.io/github/license/caewok/fvtt-token-cover)](LICENSE)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H3Y7IJW)

# Alternative Token Cover

This module provides options to calculate how much cover a targeted token has, with respect to a viewer token. The GM can choose between several algorithms to determine how cover is physically measured. The GM can also define a set of rules for when cover should apply and define a set of active effects or items (depending on the system) that should be applied to tokens that have cover. Users can select between different methods of displaying cover on tokens.

This module is closely related to [Alternative Token Visibility](https://github.com/caewok/fvtt-token-visibility). Both rely on the same underlying algorithms to determine whether there are obstacles between the viewer and the target.

This module intends to be system-neutral. I will endeavor to make this module compatible with other systems upon request (and to the extent possible).

# Installation

Add this [Manifest URL](https://github.com/caewok/fvtt-token-cover/releases/latest/download/module.json) in Foundry to install.

## Dependencies

- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper)
- [socketlib](https://github.com/manuelVo/foundryvtt-socketlib)

## Recent feature additions

The v14 version represents a large re-write to improve the underlying geometry handling and to handle FoundryVTT v14's regions and levels.

### Wall Height replacement

Wall Height is marked as deprecated by the module creator. If Wall Height is not present, this module will add similar features to allow selection of a given wall height and token height.

### Updated Region behavior: Set Minimum Cover

Regions will provide cover for a token if the Set Minimum Cover behavior is enabled. If Terrain Mapper is present, its terrain shapes will be used where applicable, including modeling 3d steps, ramps, and hills.

Additional options change how that cover is applied:
- Define a minimum distance, within which this minimum cover will not be set. For example, a defending token may have cover from an attacker in a forest until they are within 10 feet of one another.
- Apply the cover to defending tokens outside the region if the attacker is within the region.

### Active effects, Items, and dnd5e statuses

Defining cover types has been moved to module settings. For dnd5e, this module can automatically use the dnd5e cover settings, or you can define your own. Cover is applied as either an active effect or an item, depending on the system.

The FoundryVTT v13 version of this module used a "Cover Book" to define and store active effects. This is no longer necessary because FoundryVTT v14 allows active effects to be stored in a compendium. The Cover Book has been deprecated, and the cover definitions have been simplified.

## Recommended module additions

- [Alternative Token Visibility](https://github.com/caewok/fvtt-token-visibility). Estimates token cover using the same underlying algorithms as this module. Needed if you want token vision to exactly match token cover.
- [Terrain Mapper](https://github.com/caewok/fvtt-terrain-mapper). Adds region behaviors to treat regions as physical plateaus, steps, ramps, and hills. This module will use those selected shapes to block cover accordingly.
- [Wall Height](https://github.com/theripper93/wall-height). Not only does Wall Height provide the ability to set elevation for wall tops and bottoms, it also gives tokens height based on their size. As of v14, this module will replace the primary features of the (now deprecated) Wall Height module if it is unavailable.
- [Midiqol](https://gitlab.com/tposney/midi-qol). If midiqol is installed, additional options are presented to allow cover calculations during an attack roll. (Currently unavailable and untested in FoundryVTT v14.)

# Measuring cover

"Cover" is measured by testing for obstacles between a viewer (attacking token) and a target (defending token). Different algorithms, set in the GM Cover Settings Menu (discussed below) control exactly how such obstacles are determined. Each algorithm considers points on or shape of the attacking and defending tokens and determines how much of the defender is obscured from the point of view of the attacker. The algorithm considers walls, tokens, or other obstacles and estimates the percent "cover" the defender has from the attacker.

## Viewpoints

A point or points on the attacker serve as the "eyes" of the attacker. Viewpoints are defined in the module settings. Viewpoints may be the center, 1 or more corners, or one or more midpoints on the sides of the token shape. Viewpoints other than the center can be offset from the relevant edge or corner. Viewpoints also may be elevated to be at the bottom, middle, or top of the token shape.

Note that very large tokens can be quite tall, and may poke through an overhead tile. Depending on your settings, this may cause large tokens to be visible if a sufficient portion of the token is visible.

By default, cover algorithms uses the "move" wall restriction when considering whether walls block. This is intended to be consistent with how walls that would physically block movement are most likely to provide cover. Using the API, it is possible to change this for a given calculation.

# Performance

Performance is inevitably a function of the number of tokens present on the scene and, to a lesser extent, the number of walls.

For cover effect "use" settings, least to most performant is:
1. Always
2. During combat
3. Combatant only
4. During attack
5. Never.

Enabling application of cover effects only while targeting (again, in settings) should also improve performance, possibly quite a bit for scenes with a lot of tokens.

Performance is also a function of the cover calculation algorithm chosen, and its settings. The Points algorithm is generally faster than 2d or 3d, unless you are testing a lot of points on the target. And it will always be faster to test a single viewer point rather than multiple viewer points.

# Main Settings Menu
<img width="559" alt="ATC Main Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/63bd7a8e-b7d8-446e-985e-a435d5efe459">

## Display Cover on Secret Tokens

If disabled, cover icons will not be shown on tokens with secret disposition. The cover effect (with any applicable bonuses) will still be applied to that token.

## Only Use Cover Icons

If enabled, only cover icons will be displayed; no cover effects (active effects or items) will be added to tokens. This setting is primarily for use with systems where the cover effects are unsupported. You can also use this if you don't want any active effects (e.g., defender bonuses) applied to tokens.

## Debug Cover

Enable this to create a display on the canvas indicating how cover is being tested. This is specific to the different cover algorithms. You generally will need to select a token to be the attacker and target one or more defending tokens.

# GM Cover Settings Menu
The more complex ATC module settings appear in a popout when you hit the "GM Cover Settings" button in the main settings menu. The menu is split into four tabs: Viewer, Target, Cover Workflow, and Cover Options. The first two control how cover is physically measured between the viewer (attacking) token and the target (defending) token that potentially has cover. Workflow determines if and when cover effects should be applied to the target. And options contain other miscellaneous less used options that affect the physical calculation for cover.

## Viewer
Settings relevant to the viewing, or attacking, token.

<img width="700" alt="ATC Viewer Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/310d547b-bcea-4602-8478-7fe2b124b4b1">

### Points
The viewing points are the viewing token's "eyes." If more than one viewing point, the target will have cover if none of the viewer points have line-of-sight to the target.

### Inset
When more than one point is used, an "inset" allows you to determine how far each point lies on a line between the viewer center and the viewer border. The greater the inset, the closer to the center the point is.

## Target
Settings relevant to the target, or defending, token. This is the token that may have cover.

<img width="702" alt="ATC Target Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/2d185540-87a6-4244-82eb-912a0fc346f2">

### Large Token Subtargeting
> Note: This setting is currently disabled and forced off in the UI while it is being fixed.

If enabled, tokens larger than a grid square will be considered to have no cover if at least one grid square's worth of the token is unobstructed from the viewer. For the Points algorithm, each grid square that the target occupies is tested separately as if it were a single token. For the Area2d and Area3d algorithms, the percentage area required is based on the size of a single grid square instead of the size of the entire target. The result is that tokens larger than a grid square can have less than 0% cover.

This setting is slightly less performant but very useful for larger tokens. For example, without large token subtargeting, 3 out of 4 grid squares of a dragon could be visible and—depending on your cover threshold setting—this may still provide cover to the dragon.

### Points Algorithm
The points algorithm tests whether a 3d ray from the viewing point to a point on the target token is blocked by an obstacle. As with the viewer, the offset determines how close each point is to the center of the target token. If 3d points are enabled, additional points at the top and bottom of the target token will be tested.

## Workflow
Settings relevant to automated workflow for applying cover effects to targeted tokens.

<img width="700" alt="ATC Workflow Settings" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/f6d44b2c-b8a5-4313-998b-ec4a76bae571">

### Apply Cover Effects

Cover effects can be applied at different stages of the workflow. When applied, a cover icon will be displayed on the token that has the cover.

Generally, if a user has selected a token, that token will be considered an "attacker" for purposes of cover, _for that user's view only_. Selecting multiple tokens will apply cover only if the defending token has that cover (or better) from every attacker. Generally, defending tokens are all non-selected tokens.

The GM can select between different options for displaying cover:
- Never: Don't display
- During Combat: Only display if combat is present.
- Current Combatant Only: Overrides selection rule to treat only the current combatant as the attacker.
- During Attack: For systems like dnd5e only. The cover effect is only displayed during the attack sequence.
- Always: Always display, regardless of combat status.

### Apply Cover Effects only when targeting

When enabled, cover effects will be applied only to targeted defenders. In other words, the user must control one or more tokens and target one or more other tokens to have cover be applied. This should increase performance for scenes with many tokens.

## Workflow: System-specific attack settings

<img width="700" alt="Screenshot 2024-05-07 at 11 48 06 AM" src="https://github.com/caewok/fvtt-token-cover/assets/1267134/dc058e34-a40a-483f-8c23-b57111ee5bfd">

Additional settings are available for systems like dnd5e for which ATC knows how to modify the system's attack workflow.

### Display cover in chat
Enabling this will display cover of targeted tokens in the chat, when an attack is initiated. Targeted tokens without cover are not included in the chat message, and so if no targeted tokens have cover, nothing will be output to chat.

## Confirm cover
Should the attack workflow be paused to confirm cover?
- Show the user, but only allow the user to cancel.
- Ask user to confirm.
- Ask GM to confirm.
- Apply automatically; no dialog.

The confirmation dialog pops up a list of targets with calculated covers. Cover effects can then be changed by the user or GM, respectively.

## Confirm no cover
If the defender is deemed to have no cover, should the confirmation dialog still be presented?

## Confirm only on change
Should the confirmation dialog be skipped if the cover matches what was displayed to the user? Sometimes, the attack workflow can modify cover. For example, the attacker may be able to ignore cover based on the type of attack. As this is only known at the time of attack, it is possible for cover to change at that time.

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

# API

If you want specific cover effects or support for your system's attack workflow, please feel free to open a Git issue. Please include details about where I can find your system's rules regarding cover and, preferably, where I can go with questions about how the system works.

If you would like to modify or extend this module, the following may be helpful:
- You can access various classes at `game.modules.get("tokencover").api`.
- Some defined values are at `CONFIG.tokencover`.
- `CONFIG.tokencover.CoverEffect.coverObjectsMap` stores all active cover effects. Note that `CoverEffect` is a singleton class, with a single cover effect per id. Subclasses are used for some systems.
- Various methods for testing token cover are present on the token: `token.tokencover`. The `token.tokencover.coverCalculator` determines cover from the perspective of the token as the attacker. Methods like `token.tokencover.coverPercentFromAttacker` determine cover from the perspective of the token as defender.
